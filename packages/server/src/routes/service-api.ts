import type { FastifyInstance } from "fastify";
import {
  type Db,
  blocks,
  transactions,
  clusterRuns,
  clusterMemberships,
  featureVectors,
} from "@clustec/common";
import { eq, and, gte, lte, isNotNull, desc, sql } from "drizzle-orm";

// Mirror of packages/indexer/src/features.ts dimensions
const NUMERIC_DIM = 14;
const FEATURE_DIM = 15;

const DIM_NAMES = [
  "numNoteHashes",
  "numNullifiers",
  "numL2ToL1Msgs",
  "numPrivateLogs",
  "numContractClassLogs",
  "numPublicLogs",
  "gasLimitDa",
  "gasLimitL2",
  "maxFeePerDaGas",
  "maxFeePerL2Gas",
  "numSetupCalls",
  "numAppCalls",
  "totalPublicCalldataSize",
  "expirationDelta",
  "feePayer",
] as const;

interface StatBlock {
  min: string;
  max: string;
  mean: string;
  median: string;
  p75: string;
}

function gowerDistance(a: (number | string)[], b: (number | string)[], ranges: number[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < NUMERIC_DIM; i++) {
    const ai = Number(a[i]);
    const bi = Number(b[i]);
    if (ranges[i] === 0) {
      sum += ai === bi ? 0 : 1;
    } else {
      sum += Math.abs(ai - bi) / ranges[i];
    }
    count++;
  }
  // Categorical dim (feePayer)
  sum += a[NUMERIC_DIM] === b[NUMERIC_DIM] ? 0 : 1;
  count++;
  return sum / count;
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

    // Get the target run
    let runId: number;
    if (request.query.runId) {
      runId = parseInt(request.query.runId, 10);
    } else {
      const [latest] = await db
        .select({ id: clusterRuns.id })
        .from(clusterRuns)
        .where(eq(clusterRuns.networkId, id))
        .orderBy(desc(clusterRuns.computedAt))
        .limit(1);
      if (!latest) return { error: "No cluster runs found", recommendations: [] };
      runId = latest.id;
    }

    // Fetch all memberships with their feature vectors (exclude outliers)
    const rows = await db
      .select({
        clusterId: clusterMemberships.clusterId,
        vector: featureVectors.vector,
      })
      .from(clusterMemberships)
      .innerJoin(featureVectors, eq(clusterMemberships.txId, featureVectors.txId))
      .where(
        and(
          eq(clusterMemberships.runId, runId),
          gte(clusterMemberships.clusterId, 0),
        ),
      );

    if (rows.length === 0) return { runId, recommendations: [] };

    // Group by cluster, compute centroids and ranges
    const clusterData = new Map<
      number,
      { vectors: (number | string)[][]; count: number }
    >();

    for (const row of rows) {
      const vec = row.vector as (number | string)[];
      let entry = clusterData.get(row.clusterId);
      if (!entry) {
        entry = { vectors: [], count: 0 };
        clusterData.set(row.clusterId, entry);
      }
      entry.vectors.push(vec);
      entry.count++;
    }

    // Compute global ranges for Gower normalization
    const allVectors = rows.map((r) => r.vector as (number | string)[]);
    const ranges: number[] = [];
    for (let d = 0; d < NUMERIC_DIM; d++) {
      const vals = allVectors.map((v) => Number(v[d]));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      ranges.push(max - min);
    }

    // For each cluster, compute centroid (median for numeric, mode for categorical)
    const recommendations: {
      clusterId: number;
      clusterSize: number;
      distance: number;
      score: number;
      centroid: (number | string)[];
      deltas: Record<
        string,
        { current: number | string; target: number | string }
      >;
    }[] = [];

    for (const [clusterId, data] of clusterData) {
      const centroid: (number | string)[] = [];

      // Numeric dims: median
      for (let d = 0; d < NUMERIC_DIM; d++) {
        const sorted = data.vectors.map((v) => Number(v[d])).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        centroid.push(
          sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid],
        );
      }

      // Categorical dim: mode
      const freqs = new Map<string, number>();
      for (const v of data.vectors) {
        const val = String(v[NUMERIC_DIM]);
        freqs.set(val, (freqs.get(val) ?? 0) + 1);
      }
      let modeCat = "";
      let modeCount = 0;
      for (const [val, count] of freqs) {
        if (count > modeCount) {
          modeCat = val;
          modeCount = count;
        }
      }
      centroid.push(modeCat);

      const distance = gowerDistance(inputVector, centroid, ranges);
      const score = data.count / (1 + distance);

      // Compute per-dimension deltas
      const deltas: Record<
        string,
        { current: number | string; target: number | string }
      > = {};

      for (let d = 0; d < FEATURE_DIM; d++) {
        const name = DIM_NAMES[d];
        const current = inputVector[d];
        const target = centroid[d];
        if (current !== target) {
          deltas[name] = { current, target };
        }
      }

      recommendations.push({
        clusterId,
        clusterSize: data.count,
        distance: Math.round(distance * 10000) / 10000,
        score: Math.round(score * 100) / 100,
        centroid,
        deltas,
      });
    }

    // Sort by score descending (biggest clusters with least distance first)
    recommendations.sort((a, b) => b.score - a.score);

    return {
      runId,
      recommendations: recommendations.slice(0, limit),
    };
  });
}
