import type { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  type Db,
  transactions,
  clusterRuns,
  clusterMemberships,
  featureVectors,
  contractLabels,
} from "@clustec/common";

/**
 * Find all transactions where `address` appears publicly:
 * - feePayer
 * - publicCalls[].contractAddress
 * - publicCalls[].msgSender
 * - publicCalls[].calldata[] (hex match)
 * - l2ToL1MsgDetails[].recipient
 * - l2ToL1MsgDetails[].senderContract
 */
function buildAddressMatchCondition(address: string) {
  const lower = address.toLowerCase();
  return sql`(
    lower(${transactions.feePayer}) = ${lower}
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(${transactions.publicCalls}) AS elem
      WHERE lower(elem->>'contractAddress') = ${lower}
         OR lower(elem->>'msgSender') = ${lower}
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(elem->'calldata') AS cd
           WHERE lower(cd) = ${lower}
         )
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(${transactions.l2ToL1MsgDetails}) AS msg
      WHERE lower(msg->>'recipient') = ${lower}
         OR lower(msg->>'senderContract') = ${lower}
    )
  )`;
}

/** Determine how an address appears in a transaction. */
function detectRoles(
  address: string,
  tx: {
    feePayer: string;
    publicCalls: unknown;
    l2ToL1MsgDetails: unknown;
  },
): string[] {
  const lower = address.toLowerCase();
  const roles: string[] = [];

  if (tx.feePayer?.toLowerCase() === lower) roles.push("feePayer");

  const calls = (tx.publicCalls ?? []) as {
    contractAddress: string;
    msgSender: string;
    phase: string;
    calldata?: string[];
  }[];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c.contractAddress?.toLowerCase() === lower)
      roles.push(`${c.phase}Call[${i}].contract`);
    if (c.msgSender?.toLowerCase() === lower)
      roles.push(`${c.phase}Call[${i}].msgSender`);
    if (c.calldata?.some((f) => f.toLowerCase() === lower))
      roles.push(`${c.phase}Call[${i}].calldata`);
  }

  const msgs = (tx.l2ToL1MsgDetails ?? []) as {
    recipient: string;
    senderContract: string;
  }[];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].recipient?.toLowerCase() === lower)
      roles.push(`l2ToL1[${i}].recipient`);
    if (msgs[i].senderContract?.toLowerCase() === lower)
      roles.push(`l2ToL1[${i}].sender`);
  }

  return roles;
}

export function registerMurderBoardRoutes(app: FastifyInstance, db: Db) {
  app.get<{
    Params: { id: string; address: string };
  }>("/api/networks/:id/murder-board/:address", async (request) => {
    const { id, address } = request.params;

    // 1. Find all txs where this address appears publicly
    const matchedTxs = await db
      .select({
        id: transactions.id,
        txHash: transactions.txHash,
        status: transactions.status,
        executionResult: transactions.executionResult,
        blockNumber: transactions.blockNumber,
        actualFee: transactions.actualFee,
        feePayer: transactions.feePayer,
        publicCalls: transactions.publicCalls,
        l2ToL1MsgDetails: transactions.l2ToL1MsgDetails,
        numNoteHashes: transactions.numNoteHashes,
        numNullifiers: transactions.numNullifiers,
        numL2ToL1Msgs: transactions.numL2ToL1Msgs,
        numPrivateLogs: transactions.numPrivateLogs,
        numPublicLogs: transactions.numPublicLogs,
        numSetupCalls: transactions.numSetupCalls,
        numAppCalls: transactions.numAppCalls,
        totalPublicCalldataSize: transactions.totalPublicCalldataSize,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(and(eq(transactions.networkId, id), buildAddressMatchCondition(address)))
      .orderBy(desc(transactions.blockNumber));

    if (matchedTxs.length === 0) {
      return {
        address,
        totalTxs: 0,
        transactions: [],
        clusters: [],
        fpcsUsed: [],
        contractsInteracted: [],
        privacyScore: null,
      };
    }

    const txIds = matchedTxs.map((t) => t.id);

    // 2. Get latest cluster run for this network
    const [latestRun] = await db
      .select({ id: clusterRuns.id })
      .from(clusterRuns)
      .where(eq(clusterRuns.networkId, id))
      .orderBy(desc(clusterRuns.computedAt))
      .limit(1);

    // 3. Get cluster memberships + feature vectors for matched txs
    let membershipMap = new Map<
      number,
      { clusterId: number; outlierScore: number | null; featureVector: unknown }
    >();
    let clusterSizeMap = new Map<number, number>();

    if (latestRun) {
      const memberships = await db
        .select({
          txId: clusterMemberships.txId,
          clusterId: clusterMemberships.clusterId,
          outlierScore: clusterMemberships.outlierScore,
          featureVector: featureVectors.vector,
        })
        .from(clusterMemberships)
        .leftJoin(featureVectors, eq(featureVectors.txId, clusterMemberships.txId))
        .where(
          and(
            eq(clusterMemberships.runId, latestRun.id),
            sql`${clusterMemberships.txId} IN (${sql.join(
              txIds.map((tid) => sql`${tid}`),
              sql`, `,
            )})`,
          ),
        );

      for (const m of memberships) {
        membershipMap.set(m.txId, {
          clusterId: m.clusterId,
          outlierScore: m.outlierScore,
          featureVector: m.featureVector,
        });
      }

      // Get cluster sizes for all clusters these txs belong to
      const clusterIds = [
        ...new Set(memberships.map((m) => m.clusterId).filter((c) => c !== -1)),
      ];
      if (clusterIds.length > 0) {
        const sizes = await db
          .select({
            clusterId: clusterMemberships.clusterId,
            count: sql<number>`count(*)`,
          })
          .from(clusterMemberships)
          .where(
            and(
              eq(clusterMemberships.runId, latestRun.id),
              sql`${clusterMemberships.clusterId} IN (${sql.join(
                clusterIds.map((cid) => sql`${cid}`),
                sql`, `,
              )})`,
            ),
          )
          .groupBy(clusterMemberships.clusterId);

        for (const s of sizes) {
          clusterSizeMap.set(s.clusterId, Number(s.count));
        }
      }
    }

    // 4. Get labels for address resolution
    const labels = await db
      .select()
      .from(contractLabels)
      .where(eq(contractLabels.networkId, id));
    const labelMap = new Map(
      labels.map((l) => [l.address.toLowerCase(), { label: l.label, contractType: l.contractType }]),
    );

    // 5. Build transaction list with roles and cluster info
    const txList = matchedTxs.map((tx) => {
      const membership = membershipMap.get(tx.id);
      const clusterId = membership?.clusterId ?? null;
      return {
        txHash: tx.txHash,
        blockNumber: tx.blockNumber,
        status: tx.status,
        executionResult: tx.executionResult,
        actualFee: tx.actualFee,
        roles: detectRoles(address, tx),
        clusterId,
        clusterSize:
          clusterId === null
            ? null
            : clusterId === -1
              ? 1
              : clusterSizeMap.get(clusterId) ?? null,
        outlierScore: membership?.outlierScore ?? null,
        featureVector: membership?.featureVector ?? null,
        feePayer: tx.feePayer,
        numNoteHashes: tx.numNoteHashes,
        numNullifiers: tx.numNullifiers,
        numL2ToL1Msgs: tx.numL2ToL1Msgs,
        numPrivateLogs: tx.numPrivateLogs,
        numPublicLogs: tx.numPublicLogs,
        numSetupCalls: tx.numSetupCalls,
        numAppCalls: tx.numAppCalls,
        totalPublicCalldataSize: tx.totalPublicCalldataSize,
        createdAt: tx.createdAt,
      };
    });

    // 6. Aggregate clusters
    const clusterAgg = new Map<number, number>();
    for (const tx of txList) {
      if (tx.clusterId !== null) {
        clusterAgg.set(tx.clusterId, (clusterAgg.get(tx.clusterId) ?? 0) + 1);
      }
    }
    const clusters = [...clusterAgg.entries()]
      .map(([clusterId, txCount]) => ({
        clusterId,
        clusterSize: clusterId === -1 ? 1 : clusterSizeMap.get(clusterId) ?? 0,
        txCount,
      }))
      .sort((a, b) => b.txCount - a.txCount);

    // 7. Aggregate FPCs used (fee payers across this address's txs)
    const fpcAgg = new Map<string, number>();
    for (const tx of matchedTxs) {
      fpcAgg.set(tx.feePayer, (fpcAgg.get(tx.feePayer) ?? 0) + 1);
    }
    const fpcAddressList = [...fpcAgg.keys()];

    // 7b. Network-wide FPC usage counts (needed for both response and scoring)
    const [{ count: networkTxCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.networkId, id));

    let fpcNetworkShares = new Map<string, number>();
    if (fpcAddressList.length > 0) {
      const fpcCounts = await db
        .select({
          feePayer: transactions.feePayer,
          count: sql<number>`count(*)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.networkId, id),
            sql`${transactions.feePayer} IN (${sql.join(
              fpcAddressList.map((a) => sql`${a}`),
              sql`, `,
            )})`,
          ),
        )
        .groupBy(transactions.feePayer);

      const total = Number(networkTxCount);
      for (const row of fpcCounts) {
        fpcNetworkShares.set(row.feePayer, total > 0 ? Number(row.count) / total : 0);
      }
    }

    const fpcsUsed = [...fpcAgg.entries()]
      .map(([addr, txCount]) => ({
        address: addr,
        label: labelMap.get(addr.toLowerCase())?.label ?? null,
        contractType: labelMap.get(addr.toLowerCase())?.contractType ?? null,
        txCount,
        networkShare: fpcNetworkShares.get(addr) ?? 0,
      }))
      .sort((a, b) => b.txCount - a.txCount);

    // 8. Aggregate contracts interacted with (from public calls)
    const contractAgg = new Map<string, number>();
    for (const tx of matchedTxs) {
      const calls = (tx.publicCalls ?? []) as { contractAddress: string }[];
      for (const c of calls) {
        if (c.contractAddress) {
          contractAgg.set(
            c.contractAddress,
            (contractAgg.get(c.contractAddress) ?? 0) + 1,
          );
        }
      }
    }
    const contractsInteracted = [...contractAgg.entries()]
      .map(([addr, callCount]) => ({
        address: addr,
        label: labelMap.get(addr.toLowerCase())?.label ?? null,
        contractType: labelMap.get(addr.toLowerCase())?.contractType ?? null,
        callCount,
      }))
      .sort((a, b) => b.callCount - a.callCount);

    // 9. Privacy score
    const privacyScore = computePrivacyScore(txList, clusters, fpcsUsed, fpcNetworkShares);

    return {
      address,
      totalTxs: matchedTxs.length,
      networkTxCount: Number(networkTxCount),
      latestRunId: latestRun?.id ?? null,
      transactions: txList,
      clusters,
      fpcsUsed,
      contractsInteracted,
      privacyScore,
    };
  });
}

function computePrivacyScore(
  txList: { clusterId: number | null; clusterSize: number | null; outlierScore: number | null; feePayer: string }[],
  clusters: { clusterId: number; clusterSize: number; txCount: number }[],
  fpcsUsed: { address: string; txCount: number }[],
  fpcNetworkShares: Map<string, number>,
): { score: number; factors: { name: string; impact: "good" | "bad" | "neutral"; detail: string }[] } {
  const factors: { name: string; impact: "good" | "bad" | "neutral"; detail: string }[] = [];
  let score = 50; // Start neutral

  if (txList.length === 0) return { score: 0, factors: [] };

  // --- Cluster concentration ---
  // All txs in one big cluster = good; spread across many = bad (linkable across patterns)
  const analyzedTxs = txList.filter((t) => t.clusterId !== null);
  const nonOutlierClusters = clusters.filter((c) => c.clusterId !== -1);

  if (nonOutlierClusters.length === 1 && nonOutlierClusters[0].clusterSize > 10) {
    score += 15;
    factors.push({
      name: "Cluster concentration",
      impact: "good",
      detail: `All analyzed txs in one cluster of ${nonOutlierClusters[0].clusterSize} — blends in well`,
    });
  } else if (nonOutlierClusters.length > 3) {
    const penalty = Math.min(20, nonOutlierClusters.length * 4);
    score -= penalty;
    factors.push({
      name: "Cluster diversity",
      impact: "bad",
      detail: `Txs spread across ${nonOutlierClusters.length} clusters — activity pattern is diverse and identifiable`,
    });
  } else if (nonOutlierClusters.length > 1) {
    score -= 5;
    factors.push({
      name: "Cluster diversity",
      impact: "bad",
      detail: `Txs in ${nonOutlierClusters.length} clusters — some pattern variation visible`,
    });
  }

  // --- Privacy set sizes ---
  const avgClusterSize =
    nonOutlierClusters.length > 0
      ? nonOutlierClusters.reduce((s, c) => s + c.clusterSize, 0) / nonOutlierClusters.length
      : 0;

  if (avgClusterSize > 50) {
    score += 10;
    factors.push({
      name: "Privacy set size",
      impact: "good",
      detail: `Average privacy set of ${Math.round(avgClusterSize)} txs — hard to single out`,
    });
  } else if (avgClusterSize > 0 && avgClusterSize < 10) {
    score -= 15;
    factors.push({
      name: "Small privacy sets",
      impact: "bad",
      detail: `Average privacy set of ${Math.round(avgClusterSize)} txs — relatively easy to identify`,
    });
  }

  // --- Outlier ratio ---
  const outlierTxs = txList.filter((t) => t.clusterId === -1);
  const outlierRatio = analyzedTxs.length > 0 ? outlierTxs.length / analyzedTxs.length : 0;

  if (outlierTxs.length > 0) {
    const penalty = Math.min(25, Math.round(outlierRatio * 50));
    score -= penalty;
    factors.push({
      name: "Outlier transactions",
      impact: "bad",
      detail: `${outlierTxs.length}/${analyzedTxs.length} txs are outliers (privacy set of 1)`,
    });
  } else if (analyzedTxs.length > 0) {
    score += 5;
    factors.push({
      name: "No outliers",
      impact: "good",
      detail: "All txs belong to a cluster — none are uniquely identifiable",
    });
  }

  // --- FPC network share ---
  // What matters is how much of the network uses the same FPCs as this address.
  // Weight each FPC's network share by the number of user txs that use it.
  const totalUserTxs = txList.length;
  let weightedShare = 0;
  for (const fpc of fpcsUsed) {
    const share = fpcNetworkShares.get(fpc.address) ?? 0;
    weightedShare += share * (fpc.txCount / totalUserTxs);
  }

  if (weightedShare > 0.5) {
    score += 15;
    factors.push({
      name: "FPC network coverage",
      impact: "good",
      detail: `Fee payers used cover ${(weightedShare * 100).toFixed(0)}% of network txs — blends in with the crowd`,
    });
  } else if (weightedShare > 0.2) {
    score += 5;
    factors.push({
      name: "FPC network coverage",
      impact: "neutral",
      detail: `Fee payers used cover ${(weightedShare * 100).toFixed(0)}% of network txs — moderate anonymity set`,
    });
  } else if (weightedShare > 0) {
    score -= 10;
    factors.push({
      name: "FPC network coverage",
      impact: "bad",
      detail: `Fee payers used cover only ${(weightedShare * 100).toFixed(1)}% of network txs — niche FPC narrows anonymity`,
    });
  }

  // --- Unanalyzed txs ---
  const unanalyzed = txList.length - analyzedTxs.length;
  if (unanalyzed > 0) {
    factors.push({
      name: "Unanalyzed transactions",
      impact: "neutral",
      detail: `${unanalyzed} txs not yet in a cluster run — score may change after analysis`,
    });
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), factors };
}
