import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import {
  type Db,
  transactions,
  blocks,
  publicDataWrites,
  contractLabels,
  buildSlotLookup,
} from "@clustec/common";

const NUM_BINS = 24;
const NEARBY_RADIUS = 50; // blocks
const NEARBY_CAP = 10;

export function registerGraphRoutes(app: FastifyInstance, db: Db) {
  app.get<{
    Params: { id: string; hash: string };
  }>("/api/networks/:id/txs/:hash/graph", async (request, reply) => {
    const { id, hash } = request.params;

    // Find the focal transaction
    const [focalTx] = await db
      .select({
        id: transactions.id,
        txHash: transactions.txHash,
        blockNumber: transactions.blockNumber,
      })
      .from(transactions)
      .where(and(eq(transactions.networkId, id), eq(transactions.txHash, hash)))
      .limit(1);

    if (!focalTx) {
      return reply.status(404).send({ error: "Transaction not found" });
    }

    // Get all leaf slots written by this tx
    const focalSlots = await db
      .select({ leafSlot: publicDataWrites.leafSlot })
      .from(publicDataWrites)
      .where(eq(publicDataWrites.txId, focalTx.id));

    if (focalSlots.length === 0) {
      return { slots: [] };
    }

    const slotValues = focalSlots.map((s) => s.leafSlot);
    const slotIn = sql`${publicDataWrites.leafSlot} IN (${sql.join(
      slotValues.map((v) => sql`${v}`),
      sql`, `,
    )})`;

    // Get per-slot total write counts and block range in a single aggregation query
    const slotStats = await db
      .select({
        leafSlot: publicDataWrites.leafSlot,
        totalWrites: sql<number>`COUNT(*)`.as("total_writes"),
        minBlock: sql<number>`MIN(${transactions.blockNumber})`.as("min_block"),
        maxBlock: sql<number>`MAX(${transactions.blockNumber})`.as("max_block"),
      })
      .from(publicDataWrites)
      .innerJoin(
        transactions,
        sql`${transactions.id} = ${publicDataWrites.txId} AND ${transactions.networkId} = ${id}`,
      )
      .where(slotIn)
      .groupBy(publicDataWrites.leafSlot);

    const statsMap = new Map(slotStats.map((s) => [s.leafSlot, s]));

    // Get block numbers per slot for histogram binning (only block numbers, not full rows)
    const blockRows = await db
      .select({
        leafSlot: publicDataWrites.leafSlot,
        blockNumber: transactions.blockNumber,
      })
      .from(publicDataWrites)
      .innerJoin(
        transactions,
        sql`${transactions.id} = ${publicDataWrites.txId} AND ${transactions.networkId} = ${id}`,
      )
      .where(slotIn)
      .orderBy(transactions.blockNumber);

    // Get nearby writes (within ±NEARBY_RADIUS blocks of the focal tx)
    const focalBlock = focalTx.blockNumber;
    const nearbyRows = focalBlock != null
      ? await db
          .select({
            leafSlot: publicDataWrites.leafSlot,
            txHash: transactions.txHash,
            blockNumber: transactions.blockNumber,
            blockTimestamp: blocks.timestamp,
            txId: publicDataWrites.txId,
          })
          .from(publicDataWrites)
          .innerJoin(
            transactions,
            sql`${transactions.id} = ${publicDataWrites.txId} AND ${transactions.networkId} = ${id}`,
          )
          .leftJoin(
            blocks,
            and(
              eq(blocks.networkId, transactions.networkId),
              eq(blocks.blockNumber, transactions.blockNumber),
            ),
          )
          .where(
            and(
              slotIn,
              sql`${transactions.blockNumber} BETWEEN ${focalBlock - NEARBY_RADIUS} AND ${focalBlock + NEARBY_RADIUS}`,
            ),
          )
          .orderBy(transactions.blockNumber)
      : [];

    // Resolve leaf slots
    const labels = await db
      .select()
      .from(contractLabels)
      .where(eq(contractLabels.networkId, id));

    const knownAddresses: string[] = [];
    if (nearbyRows.length > 0) {
      const nearbyTxIds = [...new Set(nearbyRows.map((r) => r.txId))];
      const writerTxs = await db
        .select({ feePayer: transactions.feePayer, publicCalls: transactions.publicCalls })
        .from(transactions)
        .where(
          and(
            eq(transactions.networkId, id),
            sql`${transactions.id} IN (${sql.join(nearbyTxIds.map((tid) => sql`${tid}`), sql`, `)})`,
          ),
        );
      for (const t of writerTxs) {
        if (t.feePayer) knownAddresses.push(t.feePayer);
        const calls = (t.publicCalls ?? []) as { contractAddress: string; msgSender: string }[];
        for (const c of calls) {
          knownAddresses.push(c.contractAddress, c.msgSender);
        }
      }
    }

    const labelMap = new Map(labels.map((l) => [l.address, l.label]));
    const slotLookup = await buildSlotLookup(
      labels.map((l) => l.address),
      labelMap,
      knownAddresses,
    );

    // Build response per slot
    const slots = slotValues.map((leafSlot) => {
      const stats = statsMap.get(leafSlot);
      const totalWrites = stats ? Number(stats.totalWrites) : 0;
      const minBlock = stats ? Number(stats.minBlock) : 0;
      const maxBlock = stats ? Number(stats.maxBlock) : 0;
      const blockRange = maxBlock - minBlock || 1;

      // Build histogram
      const histogram = new Array(NUM_BINS).fill(0) as number[];
      const slotBlocks = blockRows.filter((r) => r.leafSlot === leafSlot);
      for (const r of slotBlocks) {
        if (r.blockNumber != null) {
          const bin = Math.min(
            Math.floor(((r.blockNumber - minBlock) / blockRange) * NUM_BINS),
            NUM_BINS - 1,
          );
          histogram[bin]++;
        }
      }

      // Focal bin
      const focalBin =
        focalBlock != null
          ? Math.min(
              Math.floor(((focalBlock - minBlock) / blockRange) * NUM_BINS),
              NUM_BINS - 1,
            )
          : null;

      // Nearby writes
      const slotNearby = nearbyRows
        .filter((r) => r.leafSlot === leafSlot)
        .slice(0, NEARBY_CAP)
        .map((r) => ({
          txHash: r.txHash,
          blockNumber: r.blockNumber,
          blockTimestamp: r.blockTimestamp,
          isFocalTx: r.txId === focalTx.id,
        }));

      // Resolve contract
      const preimage = slotLookup.get(leafSlot);
      const label = preimage
        ? labels.find(
            (l) => l.address.toLowerCase() === preimage.contractAddress.toLowerCase(),
          )
        : undefined;

      return {
        leafSlot,
        resolvedContract: preimage
          ? {
              address: preimage.contractAddress,
              label: preimage.contractLabel ?? label?.label ?? null,
              contractType: label?.contractType ?? null,
              storageSlotIndex: preimage.storageSlotIndex,
            }
          : null,
        totalWrites,
        focalBlockNumber: focalBlock,
        blockRange: { min: minBlock, max: maxBlock },
        histogram,
        focalBin,
        nearbyWrites: slotNearby,
      };
    });

    return { slots };
  });
}
