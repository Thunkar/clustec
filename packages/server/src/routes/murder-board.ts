import type { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  type Db,
  transactions,
  clusterRuns,
  clusterMemberships,
  contractInteractions,
  publicAddressAppearances,
  contractLabels,
} from "@clustec/common";

/** Quick feePayer-only match (uses index). */
function buildFeePayerCondition(address: string) {
  const lower = address.toLowerCase();
  return sql`lower(${transactions.feePayer}) = ${lower}`;
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
    Querystring: { page?: string; limit?: string };
  }>("/api/networks/:id/murder-board/:address", async (request) => {
    const { id, address } = request.params;
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "50", 10)));
    const offset = (page - 1) * limit;

    // ── Step 1: Get matched tx IDs ──
    // Phase A: fast indexed lookups in parallel
    const lower = address.toLowerCase();
    const [feePayerIds, interactionIds] = await Promise.all([
      db.select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.networkId, id), buildFeePayerCondition(address))),
      db.selectDistinct({ id: contractInteractions.txId })
        .from(contractInteractions)
        .innerJoin(transactions, eq(transactions.id, contractInteractions.txId))
        .where(and(
          eq(transactions.networkId, id),
          sql`lower(${contractInteractions.contractAddress}) = ${lower}`,
        )),
    ]);

    const fastIdSet = new Set<number>();
    for (const r of feePayerIds) fastIdSet.add(r.id);
    for (const r of interactionIds) fastIdSet.add(r.id);

    // Phase B: indexed lookup for msgSender, calldata, l2ToL1 appearances
    const appearanceIds = await db
      .selectDistinct({ id: publicAddressAppearances.txId })
      .from(publicAddressAppearances)
      .innerJoin(transactions, eq(transactions.id, publicAddressAppearances.txId))
      .where(and(
        eq(transactions.networkId, id),
        eq(publicAddressAppearances.address, lower),
      ));

    for (const r of appearanceIds) fastIdSet.add(r.id);
    const allIds = [...fastIdSet];
    const totalTxs = allIds.length;

    if (totalTxs === 0) {
      return {
        address,
        totalTxs: 0,
        networkTxCount: 0,
        latestRunId: null,
        transactions: [],
        clusters: [],
        fpcsUsed: [],
        contractsInteracted: [],
        privacyScore: null,
        page,
        limit,
        totalPages: 0,
      };
    }

    // ── Step 2: Aggregates — all independent queries in parallel ──
    const idArray = sql`ARRAY[${sql.join(allIds.map((i) => sql`${i}`), sql`, `)}]::int[]`;

    const [
      [latestRun],
      fpcAggRows,
      [{ count: networkTxCount }],
      labels,
      contractAggRows,
    ] = await Promise.all([
      db.select({ id: clusterRuns.id })
        .from(clusterRuns)
        .where(eq(clusterRuns.networkId, id))
        .orderBy(desc(clusterRuns.computedAt))
        .limit(1),
      db.select({ feePayer: transactions.feePayer, count: sql<number>`count(*)` })
        .from(transactions)
        .where(sql`${transactions.id} = ANY(${idArray})`)
        .groupBy(transactions.feePayer),
      db.select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(eq(transactions.networkId, id)),
      db.select()
        .from(contractLabels)
        .where(eq(contractLabels.networkId, id)),
      db.select({
          contractAddress: contractInteractions.contractAddress,
          count: sql<number>`count(*)`,
        })
        .from(contractInteractions)
        .where(sql`${contractInteractions.txId} = ANY(${idArray})`)
        .groupBy(contractInteractions.contractAddress)
        .orderBy(desc(sql`count(*)`)),
    ]);

    const labelMap = new Map(
      labels.map((l) => [l.address.toLowerCase(), { label: l.label, contractType: l.contractType }]),
    );

    // Cluster memberships (depends on latestRun)
    let membershipRows: { txId: number; clusterId: number; outlierScore: number | null }[] = [];
    let clusterSizeMap = new Map<number, number>();

    if (latestRun) {
      membershipRows = await db
        .select({
          txId: clusterMemberships.txId,
          clusterId: clusterMemberships.clusterId,
          outlierScore: clusterMemberships.outlierScore,
        })
        .from(clusterMemberships)
        .where(and(
          eq(clusterMemberships.runId, latestRun.id),
          sql`${clusterMemberships.txId} = ANY(${idArray})`,
        ));

      const clusterIds = [...new Set(membershipRows.map((m) => m.clusterId).filter((c) => c !== -1))];
      if (clusterIds.length > 0) {
        const sizes = await db
          .select({ clusterId: clusterMemberships.clusterId, count: sql<number>`count(*)` })
          .from(clusterMemberships)
          .where(and(
            eq(clusterMemberships.runId, latestRun.id),
            sql`${clusterMemberships.clusterId} = ANY(${sql`ARRAY[${sql.join(
              clusterIds.map((cid) => sql`${cid}`), sql`, `,
            )}]::int[]`})`,
          ))
          .groupBy(clusterMemberships.clusterId);

        for (const s of sizes) clusterSizeMap.set(s.clusterId, Number(s.count));
      }
    }

    const membershipMap = new Map(membershipRows.map((m) => [m.txId, m]));

    // FPC network shares (depends on fpcAggRows + networkTxCount)
    const fpcAgg = new Map(fpcAggRows.map((r) => [r.feePayer, Number(r.count)]));
    const fpcAddressList = [...fpcAgg.keys()];
    let fpcNetworkShares = new Map<string, number>();
    if (fpcAddressList.length > 0) {
      const fpcCounts = await db
        .select({ feePayer: transactions.feePayer, count: sql<number>`count(*)` })
        .from(transactions)
        .where(and(
          eq(transactions.networkId, id),
          sql`${transactions.feePayer} = ANY(${sql`ARRAY[${sql.join(
            fpcAddressList.map((a) => sql`${a}`), sql`, `,
          )}]::text[]`})`,
        ))
        .groupBy(transactions.feePayer);

      const total = Number(networkTxCount);
      for (const row of fpcCounts) {
        fpcNetworkShares.set(row.feePayer, total > 0 ? Number(row.count) / total : 0);
      }
    }

    const contractsInteracted = contractAggRows.map((r) => ({
      address: r.contractAddress,
      label: labelMap.get(r.contractAddress.toLowerCase())?.label ?? null,
      contractType: labelMap.get(r.contractAddress.toLowerCase())?.contractType ?? null,
      callCount: Number(r.count),
    }));

    // Cluster aggregates
    const clusterAgg = new Map<number, number>();
    for (const m of membershipRows) {
      clusterAgg.set(m.clusterId, (clusterAgg.get(m.clusterId) ?? 0) + 1);
    }
    const clusters = [...clusterAgg.entries()]
      .map(([clusterId, txCount]) => ({
        clusterId,
        clusterSize: clusterId === -1 ? 1 : clusterSizeMap.get(clusterId) ?? 0,
        txCount,
      }))
      .sort((a, b) => b.txCount - a.txCount);

    const fpcsUsed = [...fpcAgg.entries()]
      .map(([addr, txCount]) => ({
        address: addr,
        label: labelMap.get(addr.toLowerCase())?.label ?? null,
        contractType: labelMap.get(addr.toLowerCase())?.contractType ?? null,
        txCount,
        networkShare: fpcNetworkShares.get(addr) ?? 0,
      }))
      .sort((a, b) => b.txCount - a.txCount);

    // Privacy score (uses aggregates, not full tx rows)
    const txListForScore = membershipRows.map((m) => ({
      clusterId: m.clusterId as number | null,
      clusterSize: m.clusterId === -1 ? 1 : clusterSizeMap.get(m.clusterId) ?? null,
      outlierScore: m.outlierScore,
      feePayer: "", // not needed for score
    }));
    // Add unanalyzed txs
    for (const txId of allIds) {
      if (!membershipMap.has(txId)) {
        txListForScore.push({ clusterId: null, clusterSize: null, outlierScore: null, feePayer: "" });
      }
    }
    const privacyScore = computePrivacyScore(txListForScore, clusters, fpcsUsed, fpcNetworkShares);

    // ── Step 3: Paginated tx rows (only fetch the page we need) ──
    const pageIds = allIds.slice(offset, offset + limit);
    let pageTxs: {
      txHash: string;
      blockNumber: number | null;
      status: string;
      executionResult: string | null;
      actualFee: string | null;
      roles: string[];
      clusterId: number | null;
      clusterSize: number | null;
      outlierScore: number | null;
      feePayer: string;
      numNoteHashes: number;
      numNullifiers: number;
      numL2ToL1Msgs: number;
      numPrivateLogs: number;
      numPublicLogs: number | null;
      numSetupCalls: number;
      numAppCalls: number;
      totalPublicCalldataSize: number;
      createdAt: Date;
    }[] = [];

    if (pageIds.length > 0) {
      const rows = await db
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
        .where(sql`${transactions.id} = ANY(${sql`ARRAY[${sql.join(
          pageIds.map((i) => sql`${i}`),
          sql`, `,
        )}]::int[]`})`)
        .orderBy(desc(transactions.blockNumber));

      pageTxs = rows.map((tx) => {
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
          clusterSize: clusterId === null ? null : clusterId === -1 ? 1 : clusterSizeMap.get(clusterId) ?? null,
          outlierScore: membership?.outlierScore ?? null,
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
    }

    return {
      address,
      totalTxs,
      networkTxCount: Number(networkTxCount),
      latestRunId: latestRun?.id ?? null,
      transactions: pageTxs,
      clusters,
      fpcsUsed,
      contractsInteracted,
      privacyScore,
      page,
      limit,
      totalPages: Math.ceil(totalTxs / limit),
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
  let score = 50;

  if (txList.length === 0) return { score: 0, factors: [] };

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
