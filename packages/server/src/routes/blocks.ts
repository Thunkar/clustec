import type { FastifyInstance } from "fastify";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { type Db, blocks, transactions, networks, checkpoints } from "@clustec/common";

export function registerBlockRoutes(app: FastifyInstance, db: Db) {
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string };
  }>("/api/networks/:id/blocks", async (request) => {
    const { id } = request.params;
    const page = parseInt(request.query.page ?? "1", 10);
    const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 100);
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(blocks)
      .where(eq(blocks.networkId, id))
      .orderBy(desc(blocks.blockNumber))
      .limit(limit)
      .offset(offset);

    return { data: rows, page, limit };
  });

  app.get<{
    Params: { id: string; blockNumber: string };
  }>("/api/networks/:id/blocks/:blockNumber", async (request) => {
    const { id, blockNumber } = request.params;
    const num = parseInt(blockNumber, 10);

    const [block] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.networkId, id), eq(blocks.blockNumber, num)))
      .limit(1);

    if (!block) {
      return { error: "Block not found" };
    }

    const txs = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.networkId, id), eq(transactions.blockNumber, num)));

    return { block, transactions: txs };
  });

  // ── Block history: per-block data for charts ──────────────
  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; limit?: string };
  }>("/api/networks/:id/blocks/history", async (request) => {
    const { id } = request.params;
    const limitParam = request.query.limit ? parseInt(request.query.limit, 10) : null;
    const limit = limitParam ? Math.min(limitParam, 10000) : 10000;

    const conditions = [eq(blocks.networkId, id)];
    if (request.query.from) conditions.push(gte(blocks.blockNumber, parseInt(request.query.from, 10)));
    if (request.query.to) conditions.push(lte(blocks.blockNumber, parseInt(request.query.to, 10)));

    // When no 'from' is specified, fetch the latest N blocks (DESC then reverse)
    const needsReverse = !request.query.from && !request.query.to;

    const rows = await db
      .select({
        blockNumber: blocks.blockNumber,
        timestamp: blocks.timestamp,
        slotNumber: blocks.slotNumber,
        numTxs: blocks.numTxs,
        totalFees: blocks.totalFees,
        totalManaUsed: blocks.totalManaUsed,
        feePerDaGas: blocks.feePerDaGas,
        feePerL2Gas: blocks.feePerL2Gas,
        coinbase: blocks.coinbase,
      })
      .from(blocks)
      .where(and(...conditions))
      .orderBy(needsReverse ? desc(blocks.blockNumber) : blocks.blockNumber)
      .limit(limit);

    if (needsReverse) rows.reverse();

    return { data: rows };
  });

  // ── Block stats: aggregated analytics ─────────────────────
  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string };
  }>("/api/networks/:id/blocks/stats", async (request) => {
    const { id } = request.params;

    const conditions = [eq(blocks.networkId, id)];
    if (request.query.from) conditions.push(gte(blocks.blockNumber, parseInt(request.query.from, 10)));
    if (request.query.to) conditions.push(lte(blocks.blockNumber, parseInt(request.query.to, 10)));

    const [row] = await db.execute<{
      block_count: number;
      min_block: number;
      max_block: number;
      min_timestamp: number;
      max_timestamp: number;
      avg_txs: string;
      max_txs: number;
      total_txs: number;
      avg_mana: string;
      max_mana: string;
      avg_fees: string;
      total_fees: string;
      empty_blocks: number;
      proposer_count: number;
    }>(sql`
      SELECT
        count(*)::int AS block_count,
        min(block_number)::int AS min_block,
        max(block_number)::int AS max_block,
        min("timestamp")::bigint AS min_timestamp,
        max("timestamp")::bigint AS max_timestamp,
        avg(num_txs)::text AS avg_txs,
        max(num_txs)::int AS max_txs,
        sum(num_txs)::int AS total_txs,
        avg(total_mana_used::numeric)::text AS avg_mana,
        max(total_mana_used::numeric)::text AS max_mana,
        avg(total_fees::numeric)::text AS avg_fees,
        sum(total_fees::numeric)::text AS total_fees,
        count(*) FILTER (WHERE num_txs = 0)::int AS empty_blocks,
        count(DISTINCT coinbase)::int AS proposer_count
      FROM blocks
      WHERE ${and(...conditions)}
    `);

    if (!row || row.block_count === 0) return { data: null };

    const blockCount = row.block_count;
    const timespan = blockCount > 1 ? Number(row.max_timestamp) - Number(row.min_timestamp) : 0;

    // Compute avg block time only for sequential block numbers (skip gaps from missing blocks)
    const [avgBt] = await db.execute<{ avg_bt: string }>(sql`
      SELECT avg(dt)::text AS avg_bt FROM (
        SELECT "timestamp" - lag("timestamp") OVER (ORDER BY block_number) AS dt,
               block_number - lag(block_number) OVER (ORDER BY block_number) AS bn_gap
        FROM blocks WHERE ${and(...conditions)}
      ) sub WHERE bn_gap = 1 AND dt IS NOT NULL
    `);
    const avgBlockTime = avgBt?.avg_bt ? +Number(avgBt.avg_bt).toFixed(1) : 0;

    // Missed slots
    const [slotGap] = await db.execute<{ missed: number }>(sql`
      SELECT coalesce(sum(next_slot - slot_number - 1), 0)::int AS missed FROM (
        SELECT slot_number, lead(slot_number) OVER (ORDER BY slot_number) AS next_slot
        FROM blocks
        WHERE ${and(...conditions)}
      ) sub
      WHERE next_slot IS NOT NULL AND next_slot - slot_number > 1
    `);

    // Sequencer distribution
    const proposers = await db
      .select({
        coinbase: blocks.coinbase,
        count: sql<number>`count(*)::int`,
      })
      .from(blocks)
      .where(and(...conditions))
      .groupBy(blocks.coinbase)
      .orderBy(desc(sql`count(*)`));

    return {
      data: {
        blockCount,
        blockRange: { from: row.min_block, to: row.max_block },
        timespan,
        avgBlockTime: +avgBlockTime.toFixed(1),
        avgTxsPerBlock: +Number(row.avg_txs).toFixed(2),
        maxTxsPerBlock: row.max_txs,
        totalTxs: row.total_txs,
        avgManaPerBlock: row.avg_mana,
        maxManaPerBlock: row.max_mana,
        avgFeesPerBlock: row.avg_fees,
        totalFees: row.total_fees,
        emptyBlocks: row.empty_blocks,
        emptyBlockPct: +(row.empty_blocks / blockCount * 100).toFixed(1),
        proposerCount: row.proposer_count,
        missedSlots: slotGap?.missed ?? 0,
        proposers: proposers.map((p) => ({
          coinbase: p.coinbase,
          blockCount: p.count,
          share: +(p.count / blockCount * 100).toFixed(1),
        })),
      },
    };
  });

  // ── Network config: protocol constants from node ──────────
  app.get<{
    Params: { id: string };
  }>("/api/networks/:id/blocks/config", async (request) => {
    const { id } = request.params;

    const [network] = await db
      .select({ nodeUrl: networks.nodeUrl })
      .from(networks)
      .where(eq(networks.id, id))
      .limit(1);

    if (!network?.nodeUrl) return { data: null };

    const nodeUrl = process.env[`NODE_URL_${id.toUpperCase()}`] || network.nodeUrl;
    if (!nodeUrl) return { data: null };

    try {
      const res = await fetch(nodeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "node_getConfig", params: [], id: 1 }),
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as { result?: Record<string, unknown> };

      if (!data.result) return { data: null };

      const cfg = data.result;
      return {
        data: {
          maxL2BlockGas: cfg.maxL2BlockGas ?? null,
          maxDABlockGas: cfg.maxDABlockGas ?? null,
          maxTxsPerBlock: cfg.maxTxsPerBlock ?? null,
          maxTxsPerCheckpoint: cfg.maxTxsPerCheckpoint ?? null,
          minTxsPerBlock: cfg.minTxsPerBlock ?? null,
          aztecSlotDuration: cfg.aztecSlotDuration ?? null,
          ethereumSlotDuration: cfg.ethereumSlotDuration ?? null,
          aztecEpochDuration: cfg.aztecEpochDuration ?? null,
        },
      };
    } catch {
      return { data: null };
    }
  });

  // ── Checkpoint history ────────────────────────────────────
  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; limit?: string };
  }>("/api/networks/:id/checkpoints/history", async (request) => {
    const { id } = request.params;
    const limitParam = request.query.limit ? parseInt(request.query.limit, 10) : 500;
    const limit = Math.min(limitParam, 2000);

    const conditions = [eq(checkpoints.networkId, id)];
    if (request.query.from) conditions.push(gte(checkpoints.checkpointNumber, parseInt(request.query.from, 10)));
    if (request.query.to) conditions.push(lte(checkpoints.checkpointNumber, parseInt(request.query.to, 10)));

    const needsReverse = !request.query.from && !request.query.to;

    const rows = await db
      .select({
        checkpointNumber: checkpoints.checkpointNumber,
        slotNumber: checkpoints.slotNumber,
        startBlock: checkpoints.startBlock,
        endBlock: checkpoints.endBlock,
        blockCount: checkpoints.blockCount,
        totalManaUsed: checkpoints.totalManaUsed,
        totalFees: checkpoints.totalFees,
        coinbase: checkpoints.coinbase,
        attestationCount: checkpoints.attestationCount,
        l1BlockNumber: checkpoints.l1BlockNumber,
        l1Timestamp: checkpoints.l1Timestamp,
        provenAt: checkpoints.provenAt,
        finalizedAt: checkpoints.finalizedAt,
      })
      .from(checkpoints)
      .where(and(...conditions))
      .orderBy(needsReverse ? desc(checkpoints.checkpointNumber) : checkpoints.checkpointNumber)
      .limit(limit);

    if (needsReverse) rows.reverse();

    return { data: rows };
  });

  // ── Checkpoint stats ──────────────────────────────────────
  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string };
  }>("/api/networks/:id/checkpoints/stats", async (request) => {
    const { id } = request.params;

    const conditions = [eq(checkpoints.networkId, id)];
    if (request.query.from) conditions.push(gte(checkpoints.checkpointNumber, parseInt(request.query.from, 10)));
    if (request.query.to) conditions.push(lte(checkpoints.checkpointNumber, parseInt(request.query.to, 10)));

    const [row] = await db.execute<{
      count: number;
      avg_blocks: string;
      max_blocks: number;
      avg_mana: string;
      avg_fees: string;
      avg_attestations: string;
      proven_count: number;
      finalized_count: number;
      min_cp: number;
      max_cp: number;
    }>(sql`
      SELECT
        count(*)::int AS count,
        avg(block_count)::text AS avg_blocks,
        max(block_count)::int AS max_blocks,
        avg(total_mana_used::numeric)::text AS avg_mana,
        avg(total_fees::numeric)::text AS avg_fees,
        avg(attestation_count)::text AS avg_attestations,
        count(*) FILTER (WHERE proven_at IS NOT NULL)::int AS proven_count,
        count(*) FILTER (WHERE finalized_at IS NOT NULL)::int AS finalized_count,
        min(checkpoint_number)::int AS min_cp,
        max(checkpoint_number)::int AS max_cp
      FROM checkpoints
      WHERE ${and(...conditions)}
    `);

    if (!row || row.count === 0) return { data: null };

    return {
      data: {
        checkpointCount: row.count,
        range: { from: row.min_cp, to: row.max_cp },
        avgBlocksPerCheckpoint: +Number(row.avg_blocks).toFixed(2),
        maxBlocksPerCheckpoint: row.max_blocks,
        avgManaPerCheckpoint: row.avg_mana,
        avgFeesPerCheckpoint: row.avg_fees,
        avgAttestations: +Number(row.avg_attestations).toFixed(1),
        provenCount: row.proven_count,
        finalizedCount: row.finalized_count,
        provenPct: +(row.proven_count / row.count * 100).toFixed(1),
        finalizedPct: +(row.finalized_count / row.count * 100).toFixed(1),
      },
    };
  });
}
