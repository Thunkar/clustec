import type { FastifyInstance } from "fastify";
import { eq, desc, and, ne, sql, inArray, or } from "drizzle-orm";
import {
  type Db,
  transactions,
  featureVectors,
  noteHashes,
  nullifiers,
  publicDataWrites,
  clusterMemberships,
  contractLabels,
  contractInteractions,
  buildSlotLookup,
  computePublicDataTreeLeafSlot,
} from "@clustec/common";

export function registerTxRoutes(app: FastifyInstance, db: Db) {
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string; contract?: string };
  }>("/api/networks/:id/txs", async (request) => {
    const { id } = request.params;
    const page = parseInt(request.query.page ?? "1", 10);
    const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 100);
    const offset = (page - 1) * limit;
    const contractFilter = request.query.contract;

    if (contractFilter) {
      // 1. Find txs via contract_interactions table (from public logs)
      const ciTxIds = db
        .selectDistinct({ txId: contractInteractions.txId })
        .from(contractInteractions)
        .innerJoin(transactions, eq(transactions.id, contractInteractions.txId))
        .where(
          and(
            eq(transactions.networkId, id),
            eq(contractInteractions.contractAddress, contractFilter)
          )
        );

      // 2. Find txs via public data writes (slot-derived)
      const leafSlots: string[] = [];
      for (let i = 0; i <= 20; i++) {
        leafSlots.push(
          await computePublicDataTreeLeafSlot(contractFilter, BigInt(i))
        );
      }
      const pdwTxIds = db
        .selectDistinct({ txId: publicDataWrites.txId })
        .from(publicDataWrites)
        .innerJoin(transactions, eq(transactions.id, publicDataWrites.txId))
        .where(
          and(
            eq(transactions.networkId, id),
            inArray(publicDataWrites.leafSlot, leafSlots)
          )
        );

      // Union both sets via SQL
      const [ciRows, pdwRows] = await Promise.all([ciTxIds, pdwTxIds]);
      const txIdSet = new Set<number>();
      for (const r of ciRows) txIdSet.add(r.txId);
      for (const r of pdwRows) txIdSet.add(r.txId);

      if (txIdSet.size === 0) {
        return { data: [], page, limit };
      }

      const rows = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.networkId, id),
            inArray(transactions.id, [...txIdSet])
          )
        )
        .orderBy(desc(transactions.blockNumber))
        .limit(limit)
        .offset(offset);

      return { data: rows, page, limit };
    }

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.networkId, id))
      .orderBy(desc(transactions.blockNumber))
      .limit(limit)
      .offset(offset);

    return { data: rows, page, limit };
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
      interactions,
      labels,
    ] = await Promise.all([
      db.select().from(featureVectors).where(eq(featureVectors.txId, tx.id)).limit(1),
      db.select().from(noteHashes).where(eq(noteHashes.txId, tx.id)),
      db.select().from(nullifiers).where(eq(nullifiers.txId, tx.id)),
      db.select().from(publicDataWrites).where(eq(publicDataWrites.txId, tx.id)),
      db.select().from(clusterMemberships).where(eq(clusterMemberships.txId, tx.id)),
      db.select().from(contractInteractions).where(eq(contractInteractions.txId, tx.id)),
      db.select().from(contractLabels).where(eq(contractLabels.networkId, id)),
    ]);

    // Resolve public data write leaf slots to contract + slot index
    const labelMap = new Map(labels.map((l) => [l.address, l.label]));
    const slotLookup = await buildSlotLookup(
      labels.map((l) => l.address),
      labelMap
    );

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

    // Resolve contract interaction addresses to labels
    const resolvedInteractions = interactions.map((ci) => {
      const label = labels.find(
        (l) => l.address.toLowerCase() === ci.contractAddress.toLowerCase()
      );
      return {
        ...ci,
        label: label?.label ?? null,
        contractType: label?.contractType ?? null,
      };
    });

    // Get the latest cluster run membership for this tx
    const latestMembership = memberships.length > 0
      ? memberships.reduce((a, b) => (a.runId > b.runId ? a : b))
      : null;

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

    // Find similar transactions
    let similarTxs: {
      txHash: string;
      blockNumber: number;
      numNoteHashes: number;
      numNullifiers: number;
      numPublicDataWrites: number;
      feePayer: string | null;
      outlierScore: number | null;
    }[] = [];

    if (latestMembership && latestMembership.clusterId !== -1) {
      similarTxs = await db
        .select({
          txHash: transactions.txHash,
          blockNumber: transactions.blockNumber,
          numNoteHashes: transactions.numNoteHashes,
          numNullifiers: transactions.numNullifiers,
          numPublicDataWrites: transactions.numPublicDataWrites,
          feePayer: transactions.feePayer,
          outlierScore: clusterMemberships.outlierScore,
        })
        .from(clusterMemberships)
        .innerJoin(transactions, eq(transactions.id, clusterMemberships.txId))
        .where(
          and(
            eq(clusterMemberships.runId, latestMembership.runId),
            eq(clusterMemberships.clusterId, latestMembership.clusterId),
            ne(clusterMemberships.txId, tx.id)
          )
        )
        .limit(20);
    }

    return {
      tx,
      featureVector: fv?.vector ?? null,
      noteHashes: notes,
      nullifiers: nulls,
      publicDataWrites: resolvedPdws,
      contractInteractions: resolvedInteractions,
      clusterMemberships: memberships,
      privacySet,
      similarTxs,
    };
  });
}
