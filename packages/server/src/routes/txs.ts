import type { FastifyInstance } from "fastify";
import type { AnyColumn } from "drizzle-orm";
import { eq, desc, and, ne, or, sql, ilike, inArray } from "drizzle-orm";
import {
  type Db,
  transactions,
  featureVectors,
  noteHashes,
  nullifiers,
  publicDataWrites,
  clusterMemberships,
  contractLabels,
  buildSlotLookup,
} from "@clustec/common";
import type { FeePricingService } from "../services/fee-pricing.ts";
import { gowerDistance, loadClusterCentroids, FEATURE_DIM } from "../lib/gower.ts";

/** Migrate old 15-dim feature vectors to 16-dim by inserting hasTeardown=0 at position 12 */
function migrateVector(v: unknown): (number | string)[] | null {
  if (!v || !Array.isArray(v)) return null;
  if (v.length === FEATURE_DIM) return v;
  // Old 15-dim: [0..11 numeric, totalPublicCalldataSize, expirationDelta, feePayer]
  // New 16-dim: [0..11 numeric, hasTeardown, totalPublicCalldataSize, expirationDelta, feePayer]
  if (v.length === FEATURE_DIM - 1 && typeof v[14] === "string") {
    return [...v.slice(0, 12), 0, ...v.slice(12)];
  }
  return v;
}

// Allowed sort columns and directions
const SORT_COLUMNS: Record<string, AnyColumn> = {
  createdAt: transactions.createdAt,
  blockNumber: transactions.blockNumber,
  numNoteHashes: transactions.numNoteHashes,
  numNullifiers: transactions.numNullifiers,
  numPublicDataWrites: transactions.numPublicDataWrites,
  numPrivateLogs: transactions.numPrivateLogs,
  numPublicLogs: transactions.numPublicLogs,
  numContractClassLogs: transactions.numContractClassLogs,
  numL2ToL1Msgs: transactions.numL2ToL1Msgs,
  numSetupCalls: transactions.numSetupCalls,
  numAppCalls: transactions.numAppCalls,
  totalPublicCalldataSize: transactions.totalPublicCalldataSize,
  gasLimitDa: transactions.gasLimitDa,
  gasLimitL2: transactions.gasLimitL2,
  maxFeePerDaGas: transactions.maxFeePerDaGas,
  maxFeePerL2Gas: transactions.maxFeePerL2Gas,
  actualFee: transactions.actualFee,
  feePayer: transactions.feePayer,
  status: transactions.status,
};

export function registerTxRoutes(app: FastifyInstance, db: Db, feePricing?: Map<string, FeePricingService>) {
  app.get<{
    Params: { id: string };
    Querystring: {
      page?: string;
      limit?: string;
      feePayer?: string;
      status?: string;
      search?: string;
      sort?: string;
      order?: string;
    };
  }>("/api/networks/:id/txs", async (request) => {
    const { id } = request.params;
    const page = parseInt(request.query.page ?? "1", 10);
    const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 100);
    const offset = (page - 1) * limit;
    const { feePayer, status, search } = request.query;

    const sortCol = SORT_COLUMNS[request.query.sort ?? ""] ?? transactions.createdAt;
    // Push nulls to bottom regardless of sort direction
    const sortOrder = request.query.order === "asc"
      ? sql`${sortCol} ASC NULLS LAST`
      : sql`${sortCol} DESC NULLS LAST`;

    // Build conditions
    const conditions = [eq(transactions.networkId, id)];
    if (status) {
      conditions.push(eq(transactions.status, status as typeof transactions.status.enumValues[number]));
    }
    if (feePayer) {
      conditions.push(eq(transactions.feePayer, feePayer));
    }

    // Search: match against tx hash, fee payer, or public call addresses
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(transactions.txHash, pattern),
          ilike(transactions.feePayer, pattern),
          // Search contractAddress and msgSender inside publicCalls JSONB array
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${transactions.publicCalls}) AS elem
            WHERE elem->>'contractAddress' ILIKE ${pattern}
               OR elem->>'msgSender' ILIKE ${pattern}
          )`,
        )!,
      );
    }

    const where = and(...conditions);

    // Select only lightweight scalar columns — exclude heavy JSONB blobs
    // (publicCalls, l2ToL1MsgDetails, rawTx, rawTxEffect)
    const listColumns = {
      id: transactions.id,
      networkId: transactions.networkId,
      txHash: transactions.txHash,
      status: transactions.status,
      executionResult: transactions.executionResult,
      blockNumber: transactions.blockNumber,
      txIndex: transactions.txIndex,
      actualFee: transactions.actualFee,
      numNoteHashes: transactions.numNoteHashes,
      numNullifiers: transactions.numNullifiers,
      numL2ToL1Msgs: transactions.numL2ToL1Msgs,
      numPrivateLogs: transactions.numPrivateLogs,
      numContractClassLogs: transactions.numContractClassLogs,
      numPublicDataWrites: transactions.numPublicDataWrites,
      numPublicLogs: transactions.numPublicLogs,
      numSetupCalls: transactions.numSetupCalls,
      numAppCalls: transactions.numAppCalls,
      hasTeardown: transactions.hasTeardown,
      totalPublicCalldataSize: transactions.totalPublicCalldataSize,
      gasLimitDa: transactions.gasLimitDa,
      gasLimitL2: transactions.gasLimitL2,
      maxFeePerDaGas: transactions.maxFeePerDaGas,
      maxFeePerL2Gas: transactions.maxFeePerL2Gas,
      expirationTimestamp: transactions.expirationTimestamp,
      feePayer: transactions.feePayer,
      createdAt: transactions.createdAt,
    };

    const [rows, [{ count: total }]] = await Promise.all([
      db
        .select(listColumns)
        .from(transactions)
        .where(where)
        .orderBy(sortOrder)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(where),
    ]);

    return { data: rows, page, limit, total: Number(total) };
  });

  app.get<{
    Params: { id: string; hash: string };
  }>("/api/networks/:id/txs/:hash", async (request, reply) => {
    const { id, hash } = request.params;

    const [tx] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.networkId, id), eq(transactions.txHash, hash)))
      .limit(1);

    if (!tx) {
      return reply.status(404).send({ error: "Transaction not found" });
    }

    // Parallel queries for all tx data
    const [
      [fv],
      notes,
      nulls,
      pdws,
      memberships,
      labels,
    ] = await Promise.all([
      db.select().from(featureVectors).where(eq(featureVectors.txId, tx.id)).limit(1),
      db.select().from(noteHashes).where(eq(noteHashes.txId, tx.id)),
      db.select().from(nullifiers).where(eq(nullifiers.txId, tx.id)),
      db.select().from(publicDataWrites).where(eq(publicDataWrites.txId, tx.id)),
      db.select().from(clusterMemberships).where(eq(clusterMemberships.txId, tx.id)).orderBy(desc(clusterMemberships.runId)).limit(1),
      db.select().from(contractLabels).where(eq(contractLabels.networkId, id)),
    ]);

    // Resolve public data write leaf slots to contract + slot index
    const labelMap = new Map(labels.map((l) => [l.address, l.label]));
    let slotLookup = new Map<string, { contractAddress: string; contractLabel?: string; storageSlotIndex: number | string }>();

    // Only compute the expensive slot lookup if there are public data writes to resolve
    if (pdws.length > 0) {
      const rawCalls_ = (tx.publicCalls ?? []) as { contractAddress: string; msgSender: string }[];
      const knownAddresses = [
        ...(tx.feePayer ? [tx.feePayer] : []),
        ...rawCalls_.flatMap((c) => [c.contractAddress, c.msgSender]),
      ];
      slotLookup = await buildSlotLookup(
        labels.map((l) => l.address),
        labelMap,
        knownAddresses
      );
    }

    const resolvedPdws = pdws.map((w) => {
      const preimage = slotLookup.get(w.leafSlot);
      const label = preimage
        ? labels.find(
            (l) => l.address.toLowerCase() === preimage.contractAddress.toLowerCase()
          )
        : undefined;
      return {
        ...w,
        resolvedContract: preimage
          ? {
              address: preimage.contractAddress,
              label: preimage.contractLabel ?? label?.label ?? null,
              contractType: label?.contractType ?? null,
              storageSlotIndex: preimage.storageSlotIndex,
            }
          : null,
      };
    });

    // Resolve public calls from JSONB, enriched with contract labels
    const rawCalls = (tx.publicCalls ?? []) as {
      contractAddress: string;
      functionSelector: string;
      msgSender: string;
      isStaticCall: boolean;
      phase: string;
      calldataSize: number;
      calldata?: string[];
    }[];
    const resolvedCalls = rawCalls.map((c) => {
      const label = labels.find(
        (l) => l.address.toLowerCase() === c.contractAddress.toLowerCase()
      );
      return {
        contractAddress: c.contractAddress,
        functionSelector: c.functionSelector,
        phase: c.phase,
        msgSender: c.msgSender,
        isStaticCall: c.isStaticCall,
        calldataSize: c.calldataSize,
        calldata: c.calldata ?? [],
        label: label?.label ?? null,
        contractType: label?.contractType ?? null,
      };
    });

    const latestMembership = memberships[0] ?? null;

    // Compute privacy set info
    let privacySet: {
      clusterId: number;
      clusterSize: number;
      totalTxsAnalyzed: number;
      outlierScore: number | null;
    } | null = null;


    if (latestMembership) {
      const [clusterSizeRow, totalRow] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(clusterMemberships)
          .where(
            and(
              eq(clusterMemberships.runId, latestMembership.runId),
              eq(clusterMemberships.clusterId, latestMembership.clusterId)
            )
          )
          .then((r) => r[0]),
        db
          .select({ count: sql<number>`count(*)` })
          .from(clusterMemberships)
          .where(eq(clusterMemberships.runId, latestMembership.runId))
          .then((r) => r[0]),
      ]);

      privacySet = {
        clusterId: latestMembership.clusterId,
        clusterSize: latestMembership.clusterId === -1 ? 1 : Number(clusterSizeRow.count),
        totalTxsAnalyzed: Number(totalRow.count),
        outlierScore: latestMembership.clusterId === -1 ? null : latestMembership.outlierScore,
      };
    }

    // Find similar transactions with their stored feature vectors
    type SimilarTxRow = {
      txHash: string;
      blockNumber: number | null;
      status: string;
      numNoteHashes: number;
      numNullifiers: number;
      numL2ToL1Msgs: number;
      numPrivateLogs: number;
      numContractClassLogs: number;
      numPublicLogs: number | null;
      gasLimitDa: number | null;
      gasLimitL2: number | null;
      maxFeePerDaGas: number | null;
      maxFeePerL2Gas: number | null;
      numSetupCalls: number;
      numAppCalls: number;
      totalPublicCalldataSize: number;
      expirationTimestamp: number | null;
      feePayer: string;
      outlierScore: number | null;
      featureVector: unknown;
    };

    const similarTxSelect = {
      txHash: transactions.txHash,
      blockNumber: transactions.blockNumber,
      status: transactions.status,
      numNoteHashes: transactions.numNoteHashes,
      numNullifiers: transactions.numNullifiers,
      numL2ToL1Msgs: transactions.numL2ToL1Msgs,
      numPrivateLogs: transactions.numPrivateLogs,
      numContractClassLogs: transactions.numContractClassLogs,
      numPublicLogs: transactions.numPublicLogs,
      gasLimitDa: transactions.gasLimitDa,
      gasLimitL2: transactions.gasLimitL2,
      maxFeePerDaGas: transactions.maxFeePerDaGas,
      maxFeePerL2Gas: transactions.maxFeePerL2Gas,
      numSetupCalls: transactions.numSetupCalls,
      numAppCalls: transactions.numAppCalls,
      hasTeardown: transactions.hasTeardown,
      totalPublicCalldataSize: transactions.totalPublicCalldataSize,
      expirationTimestamp: transactions.expirationTimestamp,
      feePayer: transactions.feePayer,
      outlierScore: clusterMemberships.outlierScore,
      featureVector: featureVectors.vector,
    };


    let similarTxs: SimilarTxRow[] = [];

    if (latestMembership && latestMembership.clusterId !== -1) {
      // Cluster member: fetch same-cluster txs
      similarTxs = await db
        .select(similarTxSelect)
        .from(clusterMemberships)
        .innerJoin(transactions, eq(transactions.id, clusterMemberships.txId))
        .leftJoin(featureVectors, eq(featureVectors.txId, transactions.id))
        .where(
          and(
            eq(clusterMemberships.runId, latestMembership.runId),
            eq(clusterMemberships.clusterId, latestMembership.clusterId),
            ne(clusterMemberships.txId, tx.id)
          )
        )
        .orderBy(desc(clusterMemberships.outlierScore))
        .limit(20);
    } else if (latestMembership && latestMembership.clusterId === -1 && fv?.vector) {
      // Outlier: find nearest clusters by centroid distance, then fetch members
      const centroidData = await loadClusterCentroids(db, id, latestMembership.runId);
      if (centroidData) {
        const { centroids, ranges } = centroidData;
        const txVector = fv.vector as (number | string)[];

        // Rank centroids by Gower distance, pick top 10
        const ranked = centroids
          .map((c) => ({ ...c, dist: gowerDistance(txVector, c.centroid, ranges) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 10);

        const rankedClusterIds = ranked.map((c) => c.clusterId);

        if (rankedClusterIds.length > 0) {
          const candidates = await db
            .select({
              ...similarTxSelect,
              clusterId: clusterMemberships.clusterId,
            })
            .from(clusterMemberships)
            .innerJoin(transactions, eq(transactions.id, clusterMemberships.txId))
            .leftJoin(featureVectors, eq(featureVectors.txId, transactions.id))
            .where(
              and(
                eq(clusterMemberships.runId, latestMembership.runId),
                inArray(clusterMemberships.clusterId, rankedClusterIds),
                sql`${clusterMemberships.txId} != ${tx.id}`,
              )
            );

          // Pick the single closest tx per cluster
          const bestPerCluster = new Map<number, { row: SimilarTxRow; dist: number }>();
          for (const { clusterId: cId, ...row } of candidates) {
            const vec = row.featureVector as (number | string)[] | null;
            const dist = vec ? gowerDistance(txVector, vec, ranges) : 1;
            const prev = bestPerCluster.get(cId);
            if (!prev || dist < prev.dist) {
              bestPerCluster.set(cId, { row, dist });
            }
          }

          similarTxs = [...bestPerCluster.values()]
            .sort((a, b) => a.dist - b.dist)
            .map(({ row }) => row);
        }
      }
    }

    // Extract log details from rawTxEffect
    const rawEffect = tx.rawTxEffect as Record<string, unknown> | null;

    // Private logs: { fields: string[], emittedLength: number }
    const privateLogDetails: { index: number; emittedLength: number; fields: string[] }[] = [];
    if (rawEffect && Array.isArray(rawEffect.privateLogs)) {
      for (let i = 0; i < rawEffect.privateLogs.length; i++) {
        const log = rawEffect.privateLogs[i] as Record<string, unknown>;
        const emitted = typeof log?.emittedLength === "number" ? log.emittedLength : 0;
        const allFields = Array.isArray(log?.fields) ? (log.fields as string[]) : [];
        // Only include the emitted (non-padding) fields
        const fields = allFields.slice(0, emitted).map(String);
        if (emitted > 0) {
          privateLogDetails.push({ index: i, emittedLength: emitted, fields });
        }
      }
    }

    // Contract class logs: { contractAddress, fields: { fields: string[] }, emittedLength }
    const contractClassLogDetails: { index: number; contractAddress: string | null; contractClassId: string | null; emittedLength: number; fields: string[] }[] = [];
    if (rawEffect && Array.isArray(rawEffect.contractClassLogs)) {
      for (let i = 0; i < rawEffect.contractClassLogs.length; i++) {
        const log = rawEffect.contractClassLogs[i] as Record<string, unknown>;
        const addr = typeof log?.contractAddress === "string" ? log.contractAddress : null;
        const emitted = typeof log?.emittedLength === "number" ? log.emittedLength : 0;
        // fields is a ContractClassLogFields object with its own .fields array
        const inner = log?.fields as Record<string, unknown> | undefined;
        const allFields = Array.isArray(inner?.fields) ? (inner.fields as string[]) : [];
        const fields = allFields.slice(0, emitted).map(String);
        const contractClassId = fields.length > 0 ? fields[0] : null;
        if (addr || emitted > 0) {
          contractClassLogDetails.push({ index: i, contractAddress: addr, contractClassId, emittedLength: emitted, fields });
        }
      }
    }

    // Public logs: { contractAddress, fields: string[] } — no emittedLength, use fields.length
    const publicLogDetails: { index: number; contractAddress: string | null; emittedLength: number; fields: string[] }[] = [];
    if (rawEffect && Array.isArray(rawEffect.publicLogs)) {
      for (let i = 0; i < rawEffect.publicLogs.length; i++) {
        const log = rawEffect.publicLogs[i] as Record<string, unknown>;
        const addr = typeof log?.contractAddress === "string" ? log.contractAddress : null;
        const fields = Array.isArray(log?.fields) ? (log.fields as string[]).map(String) : [];
        const emitted = fields.length;
        if (addr || emitted > 0) {
          publicLogDetails.push({ index: i, contractAddress: addr, emittedLength: emitted, fields });
        }
      }
    }

    // Collect all publicly visible addresses
    const l2ToL1Msgs = (tx.l2ToL1MsgDetails ?? []) as { recipient: string; senderContract: string }[];
    const addrSet = new Map<string, { address: string; source: string }>();
    const addAddr = (address: string, source: string) => {
      if (address && !addrSet.has(`${address}:${source}`)) {
        addrSet.set(`${address}:${source}`, { address, source });
      }
    };

    if (tx.feePayer) addAddr(tx.feePayer, "feePayer");
    const phaseCounters: Record<string, number> = {};
    for (const c of rawCalls) {
      const idx = phaseCounters[c.phase] ?? 0;
      phaseCounters[c.phase] = idx + 1;
      const label = c.phase === "teardown" ? "teardown" : `${c.phase}[${idx}]`;
      addAddr(c.contractAddress, `${label}.contractAddress`);
      if (c.msgSender) addAddr(c.msgSender, `${label}.msgSender`);
    }
    for (let mi = 0; mi < l2ToL1Msgs.length; mi++) {
      const msg = l2ToL1Msgs[mi];
      addAddr(msg.recipient, `l2ToL1Msgs[${mi}].recipient`);
      addAddr(msg.senderContract, `l2ToL1Msgs[${mi}].senderContract`);
    }

    const publicAddresses = [...addrSet.values()].map((a) => {
      const label = labels.find(
        (l) => l.address.toLowerCase() === a.address.toLowerCase()
      );
      return { ...a, label: label?.label ?? null };
    });

    // Fee payer usage percentage across all txs on this network
    const [feePayerCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.networkId, id), eq(transactions.feePayer, tx.feePayer)));
    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.networkId, id));
    const feePayerPct = totalCount.count > 0
      ? (Number(feePayerCount.count) / Number(totalCount.count)) * 100
      : 0;

    // Estimate tx cost in USD via L1 rollup contract + ETH price

    const feeService = feePricing?.get(id);
    const feePricingData = tx.actualFee
      ? await feeService?.estimateTxCostUsd(tx.actualFee) ?? null
      : null;


    // Strip large JSONB blobs from the response — they're only used server-side
    const { rawTx, rawTxEffect, ...txFields } = tx;

    return {
      tx: txFields,
      featureVector: migrateVector(fv?.vector ?? null),
      noteHashes: notes,
      nullifiers: nulls,
      publicDataWrites: resolvedPdws,
      publicCalls: resolvedCalls,
      clusterMemberships: latestMembership ? [latestMembership] : [],
      privacySet,
      similarTxs: similarTxs.map((stx) => ({
        ...stx,
        featureVector: migrateVector(stx.featureVector),
      })),
      privateLogDetails,
      publicLogDetails,
      contractClassLogDetails,
      publicAddresses,
      feePayerPct,
      feePricingData,
    };
  });

  // Fee payer distribution stats
  app.get<{
    Params: { id: string };
  }>("/api/networks/:id/txs/stats/fee-payers", async (request) => {
    const { id } = request.params;

    const rows = await db
      .select({
        address: transactions.feePayer,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(eq(transactions.networkId, id))
      .groupBy(transactions.feePayer)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    const labels = await db
      .select()
      .from(contractLabels)
      .where(eq(contractLabels.networkId, id));

    const feePayers = rows
      .filter((r) => r.address != null)
      .map((r) => {
        const label = labels.find(
          (l) => l.address.toLowerCase() === r.address!.toLowerCase()
        );
        return {
          address: r.address!,
          count: Number(r.count),
          label: label?.label ?? null,
        };
      });

    return { feePayers };
  });
}
