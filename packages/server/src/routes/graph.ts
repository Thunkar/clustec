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

export function registerGraphRoutes(app: FastifyInstance, db: Db) {
  /**
   * Per-transaction slot timeline: for each public data write slot this tx
   * touches, return all other txs that wrote to the same slot, ordered by
   * block number. The focal tx is flagged so the UI can highlight it.
   */
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

    // Find all writes to these slots across the network, with block timestamps
    const writeRows = await db
      .select({
        leafSlot: publicDataWrites.leafSlot,
        txId: publicDataWrites.txId,
        txHash: transactions.txHash,
        blockNumber: transactions.blockNumber,
        blockTimestamp: blocks.timestamp,
      })
      .from(publicDataWrites)
      .innerJoin(
        transactions,
        sql`${transactions.id} = ${publicDataWrites.txId} AND ${transactions.networkId} = ${id}`
      )
      .leftJoin(
        blocks,
        and(
          eq(blocks.networkId, transactions.networkId),
          eq(blocks.blockNumber, transactions.blockNumber)
        )
      )
      .where(
        sql`${publicDataWrites.leafSlot} IN (${sql.join(
          slotValues.map((v) => sql`${v}`),
          sql`, `
        )})`
      )
      .orderBy(transactions.blockNumber);

    // Resolve leaf slots using known contract labels
    const labels = await db
      .select()
      .from(contractLabels)
      .where(eq(contractLabels.networkId, id));

    // Collect known addresses from txs that wrote to these slots
    const txIds = [...new Set(writeRows.map((r) => r.txId))];
    const writerTxs = txIds.length > 0
      ? await db
          .select({ feePayer: transactions.feePayer, publicCalls: transactions.publicCalls })
          .from(transactions)
          .where(sql`${transactions.id} IN (${sql.join(txIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];
    const knownAddresses = writerTxs.flatMap((t) => {
      const addrs: string[] = [];
      if (t.feePayer) addrs.push(t.feePayer);
      const calls = (t.publicCalls ?? []) as { contractAddress: string; msgSender: string }[];
      for (const c of calls) {
        addrs.push(c.contractAddress, c.msgSender);
      }
      return addrs;
    });

    const labelMap = new Map(labels.map((l) => [l.address, l.label]));
    const slotLookup = await buildSlotLookup(
      labels.map((l) => l.address),
      labelMap,
      knownAddresses
    );

    // Group by slot and build timeline entries
    const slotMap = new Map<string, {
      txId: number;
      txHash: string;
      blockNumber: number | null;
      blockTimestamp: number | null;
      isFocalTx: boolean;
    }[]>();

    for (const row of writeRows) {
      let entries = slotMap.get(row.leafSlot);
      if (!entries) {
        entries = [];
        slotMap.set(row.leafSlot, entries);
      }
      entries.push({
        txId: row.txId,
        txHash: row.txHash,
        blockNumber: row.blockNumber,
        blockTimestamp: row.blockTimestamp,
        isFocalTx: row.txId === focalTx.id,
      });
    }

    return {
      slots: [...slotMap.entries()].map(([leafSlot, entries]) => {
        const preimage = slotLookup.get(leafSlot);
        const label = preimage
          ? labels.find(
              (l) => l.address.toLowerCase() === preimage.contractAddress.toLowerCase()
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
          writes: entries,
        };
      }),
    };
  });
}
