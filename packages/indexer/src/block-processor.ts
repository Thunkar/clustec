import type { AztecNode } from "@aztec/stdlib/interfaces/client";
import type { L2BlockStreamEvent } from "@aztec/stdlib/block";
import { L2TipsMemoryStore } from "@aztec/stdlib/block";
import { TxHash } from "@aztec/stdlib/tx";
import type { BlockNumber } from "@aztec/foundation/branded-types";
import { eq, and, gt, lte, inArray } from "drizzle-orm";
import {
  type Db,
  blocks,
  transactions,
  syncCursors,
  contractInteractions,
  featureVectors,
  noteHashes,
  nullifiers,
  publicDataWrites,
} from "@clustec/common";
import { extractFromTxEffect } from "./extractor.js";

/**
 * Extends L2TipsMemoryStore so it acts as both the local data provider
 * (tracking tips/hashes) and the event handler for L2BlockStream.
 *
 * Handles all block stream lifecycle events:
 *  - blocks-added:       upsert txs + side-effects, advance proposedBlock cursor
 *  - chain-checkpointed: promote proposed → checkpointed
 *  - chain-proven:       promote → proven
 *  - chain-finalized:    promote → finalized
 *  - chain-pruned:       revert or delete txs from pruned blocks
 */
export class BlockProcessor extends L2TipsMemoryStore {
  constructor(
    private readonly networkId: string,
    private readonly node: AztecNode,
    private readonly db: Db,
  ) {
    super();
  }

  /**
   * Fall back to the node for block hashes not yet in the memory store.
   * Required for reorg detection on startup when skipFinalized is set.
   */
  override async getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    const stored = await super.getL2BlockHash(number);
    if (stored) return stored;
    const header = await this.node.getBlockHeader(number);
    if (!header) return undefined;
    const hash = await header.hash();
    return hash.toString();
  }

  override async handleBlockStreamEvent(
    event: L2BlockStreamEvent,
  ): Promise<void> {
    await super.handleBlockStreamEvent(event);

    switch (event.type) {
      case "blocks-added":
        await this.onBlocksAdded(event);
        break;
      case "chain-checkpointed":
        await this.onChainCheckpointed(event);
        break;
      case "chain-proven":
        await this.onChainProven(event);
        break;
      case "chain-finalized":
        await this.onChainFinalized(event);
        break;
      case "chain-pruned":
        await this.onChainPruned(event);
        break;
    }
  }

  // ── blocks-added ────────────────────────────────────────────

  private async onBlocksAdded(
    event: Extract<L2BlockStreamEvent, { type: "blocks-added" }>,
  ): Promise<void> {
    for (const block of event.blocks) {
      const blockHash = await block.hash();

      // 1. Insert block metadata
      await this.db
        .insert(blocks)
        .values({
          networkId: this.networkId,
          blockNumber: block.number,
          blockHash: blockHash.toString(),
          timestamp: Number(block.header.globalVariables.timestamp),
          slotNumber: Number(block.header.globalVariables.slotNumber),
          numTxs: block.body.txEffects.length,
          totalFees: block.header.totalFees.toString(),
          totalManaUsed: block.header.totalManaUsed.toString(),
        })
        .onConflictDoNothing();

      // 2. Process each tx effect
      for (let i = 0; i < block.body.txEffects.length; i++) {
        const effect = block.body.txEffects[i];
        const mined = extractFromTxEffect(effect, i);

        // Check if tx was already seen in mempool (has feePayer)
        const [existing] = await this.db
          .select({ feePayer: transactions.feePayer })
          .from(transactions)
          .where(and(eq(transactions.networkId, this.networkId), eq(transactions.txHash, mined.txHash)))
          .limit(1);

        let feePayer: string;
        if (existing?.feePayer) {
          feePayer = existing.feePayer;
        } else {
          // Block-first tx: fetch full Tx from node to get fee payer
          const fullTx = await this.node.getTxByHash(TxHash.fromString(mined.txHash));
          if (!fullTx) {
            console.warn(
              `[${this.networkId}] Skipping tx ${mined.txHash} in block ${block.number}: ` +
              `not in DB and not available from node (likely already finalized). ` +
              `This should not happen during normal operation — check startingBlock config.`
            );
            continue;
          }
          feePayer = fullTx.data.feePayer.toString();
        }

        // 2a. Upsert transaction (block-first: insert new or update existing pending row)
        const upserted = await this.db
          .insert(transactions)
          .values({
            networkId: this.networkId,
            txHash: mined.txHash,
            feePayer,
            status: "proposed",
            blockNumber: block.number,
            txIndex: mined.txIndex,
            executionResult: mined.executionResult,
            actualFee: mined.actualFee,
            numPublicDataWrites: mined.numPublicDataWrites,
            numPublicLogs: mined.numPublicLogs,
            privateLogTotalSize: mined.privateLogTotalSize,
            publicLogTotalSize: mined.publicLogTotalSize,
            rawTxEffect: JSON.parse(JSON.stringify(effect)),
            proposedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [transactions.networkId, transactions.txHash],
            set: {
              status: "proposed",
              feePayer,
              blockNumber: block.number,
              txIndex: mined.txIndex,
              executionResult: mined.executionResult,
              actualFee: mined.actualFee,
              numPublicDataWrites: mined.numPublicDataWrites,
              numPublicLogs: mined.numPublicLogs,
              privateLogTotalSize: mined.privateLogTotalSize,
              publicLogTotalSize: mined.publicLogTotalSize,
              rawTxEffect: JSON.parse(JSON.stringify(effect)),
              proposedAt: new Date(),
            },
          })
          .returning({ id: transactions.id });

        const txId = upserted[0].id;

        // 2b. Insert side-effect rows for cross-tx analysis
        const inserts: Promise<unknown>[] = [];

        if (mined.noteHashes.length > 0) {
          inserts.push(
            this.db.insert(noteHashes).values(
              mined.noteHashes.map((value, pos) => ({
                txId,
                value,
                position: pos,
              })),
            ),
          );
        }

        if (mined.nullifiers.length > 0) {
          inserts.push(
            this.db.insert(nullifiers).values(
              mined.nullifiers.map((value, pos) => ({
                txId,
                value,
                position: pos,
              })),
            ),
          );
        }

        if (mined.publicDataWrites.length > 0) {
          inserts.push(
            this.db.insert(publicDataWrites).values(
              mined.publicDataWrites.map((w, pos) => ({
                txId,
                leafSlot: w.leafSlot,
                value: w.value,
                position: pos,
              })),
            ),
          );
        }

        await Promise.all(inserts);
      }

      // 3. Update sync cursor
      await this.db
        .update(syncCursors)
        .set({
          proposedBlock: block.number,
          updatedAt: new Date(),
        })
        .where(eq(syncCursors.networkId, this.networkId));
    }

    const first = event.blocks[0].number;
    const last = event.blocks[event.blocks.length - 1].number;
    const totalTxs = event.blocks.reduce(
      (sum, b) => sum + b.body.txEffects.length,
      0,
    );
    console.log(
      `[${this.networkId}] Blocks ${first}..${last}: ${totalTxs} txs proposed`,
    );
  }

  // ── chain-checkpointed ──────────────────────────────────────

  private async onChainCheckpointed(
    event: Extract<L2BlockStreamEvent, { type: "chain-checkpointed" }>,
  ): Promise<void> {
    await this.db
      .update(transactions)
      .set({ status: "checkpointed" })
      .where(
        and(
          eq(transactions.networkId, this.networkId),
          eq(transactions.status, "proposed"),
          lte(transactions.blockNumber, event.block.number),
        ),
      );

    await this.db
      .update(syncCursors)
      .set({
        checkpointedBlock: event.block.number,
        updatedAt: new Date(),
      })
      .where(eq(syncCursors.networkId, this.networkId));

    console.log(
      `[${this.networkId}] Chain checkpointed at block ${event.block.number}`,
    );
  }

  // ── chain-proven ────────────────────────────────────────────

  private async onChainProven(
    event: Extract<L2BlockStreamEvent, { type: "chain-proven" }>,
  ): Promise<void> {
    await this.db
      .update(transactions)
      .set({ status: "proven" })
      .where(
        and(
          eq(transactions.networkId, this.networkId),
          inArray(transactions.status, ["proposed", "checkpointed"]),
          lte(transactions.blockNumber, event.block.number),
        ),
      );

    await this.db
      .update(syncCursors)
      .set({
        provenBlock: event.block.number,
        updatedAt: new Date(),
      })
      .where(eq(syncCursors.networkId, this.networkId));

    console.log(
      `[${this.networkId}] Chain proven at block ${event.block.number}`,
    );
  }

  // ── chain-finalized ─────────────────────────────────────────

  private async onChainFinalized(
    event: Extract<L2BlockStreamEvent, { type: "chain-finalized" }>,
  ): Promise<void> {
    await this.db
      .update(transactions)
      .set({ status: "finalized" })
      .where(
        and(
          eq(transactions.networkId, this.networkId),
          inArray(transactions.status, ["proposed", "checkpointed", "proven"]),
          lte(transactions.blockNumber, event.block.number),
        ),
      );

    await this.db
      .update(syncCursors)
      .set({
        finalizedBlock: event.block.number,
        updatedAt: new Date(),
      })
      .where(eq(syncCursors.networkId, this.networkId));

    console.log(
      `[${this.networkId}] Chain finalized at block ${event.block.number}`,
    );
  }

  // ── chain-pruned ────────────────────────────────────────────

  private async onChainPruned(
    event: Extract<L2BlockStreamEvent, { type: "chain-pruned" }>,
  ): Promise<void> {
    const prunedAfter = event.block.number;
    console.log(
      `[${this.networkId}] Chain pruned to block ${prunedAfter}, reverting...`,
    );

    // 1. Query all affected txs
    const affectedTxs = await this.db
      .select({
        id: transactions.id,
        hasPendingData: transactions.hasPendingData,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.networkId, this.networkId),
          gt(transactions.blockNumber, prunedAfter),
        ),
      );

    if (affectedTxs.length > 0) {
      const txsWithPending = affectedTxs.filter((t) => t.hasPendingData);
      const txsWithoutPending = affectedTxs.filter((t) => !t.hasPendingData);

      // 4. Delete side-effect rows for ALL affected txs
      for (const tx of affectedTxs) {
        await Promise.all([
          this.db.delete(noteHashes).where(eq(noteHashes.txId, tx.id)),
          this.db.delete(nullifiers).where(eq(nullifiers.txId, tx.id)),
          this.db
            .delete(publicDataWrites)
            .where(eq(publicDataWrites.txId, tx.id)),
        ]);
      }

      // 2. Txs WITH pending data: revert to pending, clear block-related fields
      if (txsWithPending.length > 0) {
        const pendingIds = txsWithPending.map((t) => t.id);
        await this.db
          .update(transactions)
          .set({
            status: "pending",
            blockNumber: null,
            txIndex: null,
            executionResult: null,
            actualFee: null,
            numPublicDataWrites: 0,
            numPublicLogs: 0,
            privateLogTotalSize: 0,
            publicLogTotalSize: 0,
            rawTxEffect: null,
            proposedAt: null,
          })
          .where(inArray(transactions.id, pendingIds));
      }

      // 3. Txs WITHOUT pending data: delete entirely (also clean up related rows first)
      if (txsWithoutPending.length > 0) {
        const deleteIds = txsWithoutPending.map((t) => t.id);

        // Delete dependent rows that reference these txs
        for (const tx of txsWithoutPending) {
          await Promise.all([
            this.db
              .delete(contractInteractions)
              .where(eq(contractInteractions.txId, tx.id)),
            this.db
              .delete(featureVectors)
              .where(eq(featureVectors.txId, tx.id)),
          ]);
        }

        await this.db
          .delete(transactions)
          .where(inArray(transactions.id, deleteIds));
      }
    }

    // 5. Delete pruned blocks
    await this.db
      .delete(blocks)
      .where(
        and(
          eq(blocks.networkId, this.networkId),
          gt(blocks.blockNumber, prunedAfter),
        ),
      );

    // 6. Reset sync cursor
    await this.db
      .update(syncCursors)
      .set({
        proposedBlock: prunedAfter,
        updatedAt: new Date(),
      })
      .where(eq(syncCursors.networkId, this.networkId));

    console.log(
      `[${this.networkId}] Reverted ${affectedTxs.length} txs from pruned blocks`,
    );
  }
}
