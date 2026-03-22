import type { FastifyInstance } from "fastify";
import { eq, and, gte, lte, desc, sql, isNotNull } from "drizzle-orm";
import { type Db, blocks, transactions } from "@clustec/common";
import type { FeePricingService } from "../services/fee-pricing.ts";

export function registerFeeRoutes(
  app: FastifyInstance,
  db: Db,
  feePricing?: Map<string, FeePricingService>,
) {
  // ── Fee history: base fees per block over time ──────────────────
  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; resolution?: string };
  }>("/api/networks/:id/fees/history", async (request) => {
    const { id } = request.params;
    const { from, to, resolution = "raw" } = request.query;

    const conditions = [
      eq(blocks.networkId, id),
    ];
    if (from) conditions.push(gte(blocks.blockNumber, parseInt(from, 10)));
    if (to) conditions.push(lte(blocks.blockNumber, parseInt(to, 10)));

    if (resolution === "raw") {
      const rows = await db
        .select({
          blockNumber: blocks.blockNumber,
          timestamp: blocks.timestamp,
          feePerDaGas: blocks.feePerDaGas,
          feePerL2Gas: blocks.feePerL2Gas,
          totalFees: blocks.totalFees,
          numTxs: blocks.numTxs,
        })
        .from(blocks)
        .where(and(...conditions))
        .orderBy(blocks.blockNumber)
        .limit(2000);

      return { data: rows };
    }

    // Bucketed: group by N-block windows
    const bucketSize =
      resolution === "10" ? 10 : resolution === "50" ? 50 : resolution === "100" ? 100 : 10;

    const rows = await db
      .select({
        blockNumber: sql<number>`(${blocks.blockNumber} / ${bucketSize}) * ${bucketSize}`.as("block_number"),
        timestamp: sql<number>`avg(${blocks.timestamp})`.as("timestamp"),
        feePerDaGas: sql<string>`avg(${blocks.feePerDaGas}::numeric)::text`.as("fee_per_da_gas"),
        feePerL2Gas: sql<string>`avg(${blocks.feePerL2Gas}::numeric)::text`.as("fee_per_l2_gas"),
        totalFees: sql<string>`sum(${blocks.totalFees}::numeric)::text`.as("total_fees"),
        numTxs: sql<number>`sum(${blocks.numTxs})`.as("num_txs"),
      })
      .from(blocks)
      .where(and(...conditions))
      .groupBy(sql`block_number`)
      .orderBy(sql`block_number`)
      .limit(500);

    return { data: rows, bucketSize };
  });

  // ── Fee spread: what txs actually paid vs base fee ─────────────
  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; bucketSize?: string };
  }>("/api/networks/:id/fees/spread", async (request) => {
    const { id } = request.params;
    const { from, to } = request.query;
    const bucketSize = parseInt(request.query.bucketSize ?? "10", 10);

    const conditions = [
      eq(transactions.networkId, id),
      isNotNull(transactions.blockNumber),
      isNotNull(transactions.actualFee),
    ];
    if (from) conditions.push(gte(transactions.blockNumber, parseInt(from, 10)));
    if (to) conditions.push(lte(transactions.blockNumber, parseInt(to, 10)));

    const rows = await db
      .select({
        bucket: sql<number>`(${transactions.blockNumber} / ${bucketSize}) * ${bucketSize}`.as("bucket"),
        txCount: sql<number>`count(*)`.as("tx_count"),
        avgActualFee: sql<string>`avg(${transactions.actualFee}::numeric)::text`.as("avg_actual_fee"),
        minActualFee: sql<string>`min(${transactions.actualFee}::numeric)::text`.as("min_actual_fee"),
        maxActualFee: sql<string>`max(${transactions.actualFee}::numeric)::text`.as("max_actual_fee"),
        p25ActualFee: sql<string>`(percentile_cont(0.25) within group (order by ${transactions.actualFee}::numeric))::text`.as("p25_actual_fee"),
        medianActualFee: sql<string>`(percentile_cont(0.5) within group (order by ${transactions.actualFee}::numeric))::text`.as("median_actual_fee"),
        p75ActualFee: sql<string>`(percentile_cont(0.75) within group (order by ${transactions.actualFee}::numeric))::text`.as("p75_actual_fee"),
        avgMaxFeePerDaGas: sql<string>`avg(${transactions.maxFeePerDaGas}::numeric)::text`.as("avg_max_fee_da"),
        avgMaxFeePerL2Gas: sql<string>`avg(${transactions.maxFeePerL2Gas}::numeric)::text`.as("avg_max_fee_l2"),
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(sql`bucket`)
      .orderBy(sql`bucket`)
      .limit(500);

    return { data: rows, bucketSize };
  });

  // ── Current fees + ETH pricing ─────────────────────────────────
  app.get<{
    Params: { id: string };
  }>("/api/networks/:id/fees/current", async (request) => {
    const { id } = request.params;

    // Latest block with fee data
    const [latest] = await db
      .select({
        blockNumber: blocks.blockNumber,
        timestamp: blocks.timestamp,
        feePerDaGas: blocks.feePerDaGas,
        feePerL2Gas: blocks.feePerL2Gas,
        totalFees: blocks.totalFees,
        numTxs: blocks.numTxs,
      })
      .from(blocks)
      .where(and(eq(blocks.networkId, id), isNotNull(blocks.feePerDaGas)))
      .orderBy(desc(blocks.blockNumber))
      .limit(1);

    // Get ETH pricing if available
    const feeService = feePricing?.get(id);
    let pricing: {
      ethUsdPrice: number;
      ethPerFeeAssetE12: string;
    } | null = null;

    if (feeService?.enabled && latest?.totalFees) {
      const est = await feeService.estimateTxCostUsd(latest.totalFees);
      if (est) {
        pricing = {
          ethUsdPrice: est.ethUsdPrice,
          ethPerFeeAssetE12: est.ethPerFeeAssetE12,
        };
      }
    }

    return { block: latest ?? null, pricing };
  });
}
