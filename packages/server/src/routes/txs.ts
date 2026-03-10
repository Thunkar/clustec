import type { FastifyInstance } from "fastify";
import type { AnyColumn } from "drizzle-orm";
import { eq, desc, and, ne, or, sql, ilike } from "drizzle-orm";
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

    // Find similar transactions with their stored feature vectors
    let similarTxs: {
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
    }[] = [];

    if (latestMembership && latestMembership.clusterId !== -1) {
      similarTxs = await db
        .select({
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
          totalPublicCalldataSize: transactions.totalPublicCalldataSize,
          expirationTimestamp: transactions.expirationTimestamp,
          feePayer: transactions.feePayer,
          outlierScore: clusterMemberships.outlierScore,
          featureVector: featureVectors.vector,
        })
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
        .limit(20);
    }

    // Extract private log details from rawTxEffect
    const rawEffect = tx.rawTxEffect as Record<string, unknown> | null;
    const privateLogDetails: { index: number; emittedLength: number }[] = [];
    if (rawEffect && Array.isArray(rawEffect.privateLogs)) {
      for (let i = 0; i < rawEffect.privateLogs.length; i++) {
        const log = rawEffect.privateLogs[i] as Record<string, unknown>;
        const emitted = typeof log?.emittedLength === "number" ? log.emittedLength : 0;
        if (emitted > 0) {
          privateLogDetails.push({ index: i, emittedLength: emitted });
        }
      }
    }

    // Extract contract class log details from rawTxEffect
    const contractClassLogDetails: { index: number; contractAddress: string | null; contractClassId: string | null; emittedLength: number }[] = [];
    if (rawEffect && Array.isArray(rawEffect.contractClassLogs)) {
      for (let i = 0; i < rawEffect.contractClassLogs.length; i++) {
        const log = rawEffect.contractClassLogs[i] as Record<string, unknown>;
        const addr = typeof log?.contractAddress === "string" ? log.contractAddress : null;
        const emitted = typeof log?.emittedLength === "number" ? log.emittedLength : 0;
        // contractClassId is typically the first field in the log
        const fields = Array.isArray(log?.fields) ? log.fields as string[] : [];
        const contractClassId = fields.length > 0 ? String(fields[0]) : null;
        if (addr || emitted > 0) {
          contractClassLogDetails.push({ index: i, contractAddress: addr, contractClassId, emittedLength: emitted });
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
    for (let ci = 0; ci < rawCalls.length; ci++) {
      const c = rawCalls[ci];
      addAddr(c.contractAddress, `publicCalls[${ci}].contractAddress`);
      if (c.msgSender) addAddr(c.msgSender, `publicCalls[${ci}].msgSender`);
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
      privateLogDetails,
      contractClassLogDetails,
      publicAddresses,
      feePayerPct,
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
