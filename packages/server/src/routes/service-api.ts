import type { FastifyInstance } from "fastify";
import {
  type Db,
  blocks,
  transactions,
} from "@clustec/common";
import { eq, and, gte, lte, isNotNull, desc, sql } from "drizzle-orm";
import { FEATURE_DIM, DIM_NAMES, gowerDistance, loadClusterCentroids } from "../lib/gower.ts";

interface StatBlock {
  min: string;
  max: string;
  mean: string;
  median: string;
  p75: string;
}

export function registerServiceApiRoutes(app: FastifyInstance, db: Db) {
  // ── Fee & gas stats for a configurable block window ──────────
  app.get<{
    Params: { id: string };
    Querystring: { blocks?: string; from?: string; to?: string };
  }>("/api/networks/:id/fees/stats", async (request) => {
    const { id } = request.params;
    const { from, to } = request.query;
    const blockWindow = parseInt(request.query.blocks ?? "100", 10);

    // If explicit range provided, use it; otherwise use latest N blocks
    let fromBlock: number | undefined;
    let toBlock: number | undefined;

    if (from || to) {
      fromBlock = from ? parseInt(from, 10) : undefined;
      toBlock = to ? parseInt(to, 10) : undefined;
    } else {
      const [latest] = await db
        .select({ blockNumber: blocks.blockNumber })
        .from(blocks)
        .where(eq(blocks.networkId, id))
        .orderBy(desc(blocks.blockNumber))
        .limit(1);
      if (!latest) return { error: "No blocks found", data: null };
      toBlock = latest.blockNumber;
      fromBlock = Math.max(0, toBlock - blockWindow);
    }

    const conditions = [
      eq(transactions.networkId, id),
      isNotNull(transactions.blockNumber),
      isNotNull(transactions.actualFee),
    ];
    if (fromBlock != null) conditions.push(gte(transactions.blockNumber, fromBlock));
    if (toBlock != null) conditions.push(lte(transactions.blockNumber, toBlock));

    const result = await db.execute<{
      tx_count: number;
      min_block: number;
      max_block: number;
      min_actual_fee: string;
      max_actual_fee: string;
      mean_actual_fee: string;
      median_actual_fee: string;
      p75_actual_fee: string;
      min_gas_limit_da: string;
      max_gas_limit_da: string;
      mean_gas_limit_da: string;
      median_gas_limit_da: string;
      p75_gas_limit_da: string;
      min_gas_limit_l2: string;
      max_gas_limit_l2: string;
      mean_gas_limit_l2: string;
      median_gas_limit_l2: string;
      p75_gas_limit_l2: string;
      min_max_fee_da: string;
      max_max_fee_da: string;
      mean_max_fee_da: string;
      median_max_fee_da: string;
      p75_max_fee_da: string;
      min_max_fee_l2: string;
      max_max_fee_l2: string;
      mean_max_fee_l2: string;
      median_max_fee_l2: string;
      p75_max_fee_l2: string;
    }>(sql`
      SELECT
        count(*)::int AS tx_count,
        min(block_number)::int AS min_block,
        max(block_number)::int AS max_block,

        min(actual_fee::numeric)::text AS min_actual_fee,
        max(actual_fee::numeric)::text AS max_actual_fee,
        avg(actual_fee::numeric)::text AS mean_actual_fee,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY actual_fee::numeric))::text AS median_actual_fee,
        (percentile_cont(0.75) WITHIN GROUP (ORDER BY actual_fee::numeric))::text AS p75_actual_fee,

        min(gas_limit_da::numeric)::text AS min_gas_limit_da,
        max(gas_limit_da::numeric)::text AS max_gas_limit_da,
        avg(gas_limit_da::numeric)::text AS mean_gas_limit_da,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY gas_limit_da::numeric))::text AS median_gas_limit_da,
        (percentile_cont(0.75) WITHIN GROUP (ORDER BY gas_limit_da::numeric))::text AS p75_gas_limit_da,

        min(gas_limit_l2::numeric)::text AS min_gas_limit_l2,
        max(gas_limit_l2::numeric)::text AS max_gas_limit_l2,
        avg(gas_limit_l2::numeric)::text AS mean_gas_limit_l2,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY gas_limit_l2::numeric))::text AS median_gas_limit_l2,
        (percentile_cont(0.75) WITHIN GROUP (ORDER BY gas_limit_l2::numeric))::text AS p75_gas_limit_l2,

        min(max_fee_per_da_gas::numeric)::text AS min_max_fee_da,
        max(max_fee_per_da_gas::numeric)::text AS max_max_fee_da,
        avg(max_fee_per_da_gas::numeric)::text AS mean_max_fee_da,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY max_fee_per_da_gas::numeric))::text AS median_max_fee_da,
        (percentile_cont(0.75) WITHIN GROUP (ORDER BY max_fee_per_da_gas::numeric))::text AS p75_max_fee_da,

        min(max_fee_per_l2_gas::numeric)::text AS min_max_fee_l2,
        max(max_fee_per_l2_gas::numeric)::text AS max_max_fee_l2,
        avg(max_fee_per_l2_gas::numeric)::text AS mean_max_fee_l2,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY max_fee_per_l2_gas::numeric))::text AS median_max_fee_l2,
        (percentile_cont(0.75) WITHIN GROUP (ORDER BY max_fee_per_l2_gas::numeric))::text AS p75_max_fee_l2
      FROM transactions
      WHERE ${and(...conditions)}
    `);

    const row = result[0];
    if (!row || row.tx_count === 0) {
      return { data: null, blockRange: { from: fromBlock, to: toBlock }, txCount: 0 };
    }

    const stat = (prefix: string): StatBlock => ({
      min: row[`min_${prefix}` as keyof typeof row] as string,
      max: row[`max_${prefix}` as keyof typeof row] as string,
      mean: row[`mean_${prefix}` as keyof typeof row] as string,
      median: row[`median_${prefix}` as keyof typeof row] as string,
      p75: row[`p75_${prefix}` as keyof typeof row] as string,
    });

    // Get latest base fees
    const [latestBlock] = await db
      .select({
        feePerDaGas: blocks.feePerDaGas,
        feePerL2Gas: blocks.feePerL2Gas,
      })
      .from(blocks)
      .where(eq(blocks.networkId, id))
      .orderBy(desc(blocks.blockNumber))
      .limit(1);

    return {
      blockRange: { from: row.min_block, to: row.max_block },
      txCount: row.tx_count,
      actualFee: stat("actual_fee"),
      gasLimitDa: stat("gas_limit_da"),
      gasLimitL2: stat("gas_limit_l2"),
      maxFeePerDaGas: stat("max_fee_da"),
      maxFeePerL2Gas: stat("max_fee_l2"),
      baseFee: latestBlock
        ? { da: latestBlock.feePerDaGas, l2: latestBlock.feePerL2Gas }
        : null,
    };
  });

  // ── Cluster recommendation: find best privacy sets for a given vector ──
  app.get<{
    Params: { id: string };
    Querystring: { vector: string; limit?: string; runId?: string };
  }>("/api/networks/:id/clusters/recommend", async (request) => {
    const { id } = request.params;
    const limit = Math.min(parseInt(request.query.limit ?? "5", 10), 20);

    let inputVector: (number | string)[];
    try {
      inputVector = JSON.parse(request.query.vector);
      if (!Array.isArray(inputVector) || inputVector.length !== FEATURE_DIM) {
        return { error: `vector must be a JSON array of ${FEATURE_DIM} elements` };
      }
    } catch {
      return { error: "Invalid JSON for vector parameter" };
    }

    const parsed = request.query.runId ? parseInt(request.query.runId, 10) : undefined;
    const result = await loadClusterCentroids(db, id, parsed);
    if (!result) return { error: "No cluster runs found", recommendations: [] };

    const { centroids, ranges, runId } = result;

    const recommendations = centroids.map((c) => {
      const distance = gowerDistance(inputVector, c.centroid, ranges);
      const score = c.count / (1 + distance);

      const deltas: Record<string, { current: number | string; target: number | string }> = {};
      for (let d = 0; d < FEATURE_DIM; d++) {
        const current = inputVector[d];
        const target = c.centroid[d];
        if (current !== target) {
          deltas[DIM_NAMES[d]] = { current, target };
        }
      }

      return {
        clusterId: c.clusterId,
        clusterSize: c.count,
        distance: Math.round(distance * 10000) / 10000,
        score: Math.round(score * 100) / 100,
        centroid: c.centroid,
        deltas,
      };
    });

    recommendations.sort((a, b) => b.score - a.score);

    return {
      runId,
      recommendations: recommendations.slice(0, limit),
    };
  });
}
