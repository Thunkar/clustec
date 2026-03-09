import type { FastifyInstance } from "fastify";
import type { AnyColumn } from "drizzle-orm";
import { eq, desc, asc, and, ne, or, sql, ilike } from "drizzle-orm";
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

// Allowed sort columns and directions
const SORT_COLUMNS: Record<string, AnyColumn> = {
  createdAt: transactions.createdAt,
  blockNumber: transactions.blockNumber,
  numNoteHashes: transactions.numNoteHashes,
  numNullifiers: transactions.numNullifiers,
  numPublicDataWrites: transactions.numPublicDataWrites,
  actualFee: transactions.actualFee,
  feePayer: transactions.feePayer,
  status: transactions.status,
};

export function registerTxRoutes(app: FastifyInstance, db: Db) {
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
    const sortDir = request.query.order === "asc" ? asc : desc;

    // Build conditions
    const conditions = [eq(transactions.networkId, id)];
    if (status) {
      conditions.push(eq(transactions.status, status as "pending" | "mined" | "finalized"));
    }
    if (feePayer) {
      conditions.push(eq(transactions.feePayer, feePayer));
    }

    // Fuzzy search: match against tx hash, fee payer, or JSONB public calls addresses
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(transactions.txHash, pattern),
          ilike(transactions.feePayer, pattern),
          // Search inside publicCalls JSONB - contract addresses and msg senders
          sql`${transactions.publicCalls}::text ILIKE ${pattern}`,
        )!,
      );
    }

    const where = and(...conditions);

    const [rows, [{ count: total }]] = await Promise.all([
      db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(sortDir(sortCol))
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
      db.select().from(clusterMemberships).where(eq(clusterMemberships.txId, tx.id)),
      db.select().from(contractLabels).where(eq(contractLabels.networkId, id)),
    ]);

    // Collect all known addresses for map-key resolution
    const rawCalls_ = (tx.publicCalls ?? []) as { contractAddress: string; msgSender: string }[];
    const knownAddresses = [
      ...(tx.feePayer ? [tx.feePayer] : []),
      ...rawCalls_.flatMap((c) => [c.contractAddress, c.msgSender]),
    ];

    // Resolve public data write leaf slots to contract + slot index
    const labelMap = new Map(labels.map((l) => [l.address, l.label]));
    const slotLookup = await buildSlotLookup(
      labels.map((l) => l.address),
      labelMap,
      knownAddresses
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
      blockNumber: number | null;
      status: string;
      numNoteHashes: number;
      numNullifiers: number;
      numPublicDataWrites: number | null;
      feePayer: string | null;
      outlierScore: number | null;
    }[] = [];

    if (latestMembership && latestMembership.clusterId !== -1) {
      similarTxs = await db
        .select({
          txHash: transactions.txHash,
          blockNumber: transactions.blockNumber,
          status: transactions.status,
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
      publicCalls: resolvedCalls,
      clusterMemberships: memberships,
      privacySet,
      similarTxs,
    };
  });
}
