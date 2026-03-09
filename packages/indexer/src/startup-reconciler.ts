import type { AztecNode } from "@aztec/stdlib/interfaces/client";
import { TxHash } from "@aztec/stdlib/tx";
import { eq, and, notInArray } from "drizzle-orm";
import {
  type Db,
  transactions,
  noteHashes,
  nullifiers,
  publicDataWrites,
} from "@clustec/common";
import { extractFromTxEffect, extractFromReceipt } from "./extractor.js";

const STATUS_ORDER: Record<string, number> = {
  dropped: 0,
  pending: 1,
  proposed: 2,
  checkpointed: 3,
  proven: 4,
  finalized: 5,
};

const BATCH_SIZE = 20;

async function reconcileTx(
  networkId: string,
  node: AztecNode,
  db: Db,
  tx: { id: number; txHash: string; status: string; hasPendingData: boolean },
): Promise<void> {
  const hash = TxHash.fromString(tx.txHash);
  const receipt = await node.getTxReceipt(hash);
  const receiptData = extractFromReceipt(receipt);

  const dbOrder = STATUS_ORDER[tx.status] ?? -1;
  const receiptOrder = STATUS_ORDER[receiptData.status] ?? -1;

  // Receipt is not more advanced — nothing to do
  if (receiptOrder <= dbOrder) {
    return;
  }

  // Dropped while pending
  if (receiptData.status === "dropped" && tx.status === "pending") {
    await db
      .update(transactions)
      .set({
        status: "dropped",
        error: receiptData.error,
      })
      .where(eq(transactions.id, tx.id));
    console.log(
      `[${networkId}] Reconciled ${tx.txHash.slice(0, 10)}… pending → dropped`,
    );
    return;
  }

  // Tx was mined while indexer was down (pending → proposed/checkpointed/proven/finalized)
  if (tx.status === "pending" && receiptOrder >= STATUS_ORDER["proposed"]) {
    // Try to get full TxEffect for mined data
    const indexedEffect = await node.getTxEffect(hash);

    if (indexedEffect) {
      const mined = extractFromTxEffect(
        indexedEffect.data,
        indexedEffect.txIndexInBlock,
      );

      // Update tx row with block info and execution data
      await db
        .update(transactions)
        .set({
          status: receiptData.status as typeof transactions.status.enumValues[number],
          blockNumber: receiptData.blockNumber,
          txIndex: mined.txIndex,
          executionResult: mined.executionResult,
          actualFee: mined.actualFee,
          numPublicDataWrites: mined.numPublicDataWrites,
          numPublicLogs: mined.numPublicLogs,
          privateLogTotalSize: mined.privateLogTotalSize,
          publicLogTotalSize: mined.publicLogTotalSize,
          proposedAt: new Date(),
        })
        .where(eq(transactions.id, tx.id));

      // Insert side-effect rows
      const inserts: Promise<unknown>[] = [];

      if (mined.noteHashes.length > 0) {
        inserts.push(
          db.insert(noteHashes).values(
            mined.noteHashes.map((value, pos) => ({
              txId: tx.id,
              value,
              position: pos,
            })),
          ),
        );
      }

      if (mined.nullifiers.length > 0) {
        inserts.push(
          db.insert(nullifiers).values(
            mined.nullifiers.map((value, pos) => ({
              txId: tx.id,
              value,
              position: pos,
            })),
          ),
        );
      }

      if (mined.publicDataWrites.length > 0) {
        inserts.push(
          db.insert(publicDataWrites).values(
            mined.publicDataWrites.map((w, pos) => ({
              txId: tx.id,
              leafSlot: w.leafSlot,
              value: w.value,
              position: pos,
            })),
          ),
        );
      }

      await Promise.all(inserts);

      console.log(
        `[${networkId}] Reconciled ${tx.txHash.slice(0, 10)}… pending → ${receiptData.status} (with TxEffect)`,
      );
    } else {
      // No effect available — just update status from receipt
      await db
        .update(transactions)
        .set({
          status: receiptData.status as typeof transactions.status.enumValues[number],
          blockNumber: receiptData.blockNumber,
          executionResult: receiptData.executionResult as typeof transactions.executionResult.enumValues[number] | null,
          actualFee: receiptData.transactionFee,
          error: receiptData.error,
          proposedAt: new Date(),
        })
        .where(eq(transactions.id, tx.id));

      console.log(
        `[${networkId}] Reconciled ${tx.txHash.slice(0, 10)}… pending → ${receiptData.status} (no TxEffect)`,
      );
    }
    return;
  }

  // Status advanced (e.g., proposed → finalized) — just update the status
  await db
    .update(transactions)
    .set({
      status: receiptData.status as typeof transactions.status.enumValues[number],
    })
    .where(eq(transactions.id, tx.id));

  console.log(
    `[${networkId}] Reconciled ${tx.txHash.slice(0, 10)}… ${tx.status} → ${receiptData.status}`,
  );
}

export async function reconcileOnStartup(
  networkId: string,
  node: AztecNode,
  db: Db,
): Promise<void> {
  const staleTxs = await db
    .select({
      id: transactions.id,
      txHash: transactions.txHash,
      status: transactions.status,
      hasPendingData: transactions.hasPendingData,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.networkId, networkId),
        notInArray(transactions.status, ["finalized", "dropped"]),
      ),
    );

  if (staleTxs.length === 0) {
    console.log(`[${networkId}] No stale transactions to reconcile.`);
    return;
  }

  console.log(
    `[${networkId}] Reconciling ${staleTxs.length} non-finalized transactions…`,
  );

  for (let i = 0; i < staleTxs.length; i += BATCH_SIZE) {
    const batch = staleTxs.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((tx) => reconcileTx(networkId, node, db, tx)),
    );
  }

  console.log(
    `[${networkId}] Reconciled ${staleTxs.length} transactions on startup.`,
  );
}
