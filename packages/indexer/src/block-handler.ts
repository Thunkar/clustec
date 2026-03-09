import type { L2BlockStreamEvent } from "@aztec/stdlib/block";
import { L2TipsMemoryStore } from "@aztec/stdlib/block";
import { eq, and, gt } from "drizzle-orm";
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
import { extractMinedData } from "./extractor.js";

/**
 * Extends L2TipsMemoryStore so it acts as both the local data provider
 * (tracking tips/hashes) and the event handler (updating the DB).
 * This mirrors how PXE's BlockSynchronizer works — a single object
 * that is both handler and data provider for the L2BlockStream.
 */
export class BlockHandler extends L2TipsMemoryStore {
  constructor(
    private readonly networkId: string,
    private readonly db: Db
  ) {
    super();
  }

  override async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    // Update the in-memory tips store first so the stream advances
    await super.handleBlockStreamEvent(event);

    switch (event.type) {
      case "blocks-added":
        await this.onBlocksAdded(event);
        break;
      case "chain-pruned":
        await this.onChainPruned(event);
        break;
      case "chain-finalized":
        await this.onChainFinalized(event);
        break;
      // chain-checkpointed and chain-proven: no action needed
    }
  }

  private async onBlocksAdded(
    event: Extract<L2BlockStreamEvent, { type: "blocks-added" }>
  ): Promise<void> {
    for (const block of event.blocks) {
      const blockHash = await block.hash();

      // Insert block metadata
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

      // Process each tx effect
      for (let i = 0; i < block.body.txEffects.length; i++) {
        const effect = block.body.txEffects[i];
        const mined = extractMinedData(effect, i);

        // Update pending → mined
        const updated = await this.db
          .update(transactions)
          .set({
            status: "mined",
            blockNumber: block.number,
            txIndex: mined.txIndex,
            revertCode: mined.revertCode,
            actualFee: mined.actualFee,
            numPublicDataWrites: mined.numPublicDataWrites,
            numPublicLogs: mined.numPublicLogs,
            privateLogTotalSize: mined.privateLogTotalSize,
            publicLogTotalSize: mined.publicLogTotalSize,
            minedAt: new Date(),
          })
          .where(
            and(
              eq(transactions.networkId, this.networkId),
              eq(transactions.txHash, mined.txHash),
              eq(transactions.status, "pending")
            )
          )
          .returning({ id: transactions.id });

        if (updated.length === 0) continue;
        const txId = updated[0].id;

        // Insert side-effect rows for cross-tx analysis
        const inserts: Promise<unknown>[] = [];

        if (mined.noteHashes.length > 0) {
          inserts.push(
            this.db.insert(noteHashes).values(
              mined.noteHashes.map((value, pos) => ({
                txId,
                value,
                position: pos,
              }))
            )
          );
        }

        if (mined.nullifiers.length > 0) {
          inserts.push(
            this.db.insert(nullifiers).values(
              mined.nullifiers.map((value, pos) => ({
                txId,
                value,
                position: pos,
              }))
            )
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
              }))
            )
          );
        }

        await Promise.all(inserts);
      }

      // Update sync cursor
      await this.db
        .update(syncCursors)
        .set({
          lastBlockNumber: block.number,
          updatedAt: new Date(),
        })
        .where(eq(syncCursors.networkId, this.networkId));
    }

    const first = event.blocks[0].number;
    const last = event.blocks[event.blocks.length - 1].number;
    const totalTxs = event.blocks.reduce(
      (sum, b) => sum + b.body.txEffects.length,
      0
    );
    console.log(
      `[${this.networkId}] Blocks ${first}..${last}: ${totalTxs} txs mined`
    );
  }

  private async onChainPruned(
    event: Extract<L2BlockStreamEvent, { type: "chain-pruned" }>
  ): Promise<void> {
    const prunedAfter = event.block.number;
    console.log(
      `[${this.networkId}] Chain pruned to block ${prunedAfter}, reverting...`
    );

    // Find txs from pruned blocks
    const prunedTxs = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.networkId, this.networkId),
          gt(transactions.blockNumber, prunedAfter)
        )
      );

    if (prunedTxs.length > 0) {
      // Delete related rows for pruned txs
      for (const tx of prunedTxs) {
        await Promise.all([
          this.db.delete(contractInteractions).where(eq(contractInteractions.txId, tx.id)),
          this.db.delete(featureVectors).where(eq(featureVectors.txId, tx.id)),
          this.db.delete(noteHashes).where(eq(noteHashes.txId, tx.id)),
          this.db.delete(nullifiers).where(eq(nullifiers.txId, tx.id)),
          this.db.delete(publicDataWrites).where(eq(publicDataWrites.txId, tx.id)),
        ]);
      }

      // Delete the pruned transactions
      await this.db
        .delete(transactions)
        .where(
          and(
            eq(transactions.networkId, this.networkId),
            gt(transactions.blockNumber, prunedAfter)
          )
        );
    }

    // Delete pruned blocks
    await this.db
      .delete(blocks)
      .where(
        and(
          eq(blocks.networkId, this.networkId),
          gt(blocks.blockNumber, prunedAfter)
        )
      );

    // Update sync cursor
    await this.db
      .update(syncCursors)
      .set({
        lastBlockNumber: prunedAfter,
        updatedAt: new Date(),
      })
      .where(eq(syncCursors.networkId, this.networkId));

    console.log(
      `[${this.networkId}] Reverted ${prunedTxs.length} txs from pruned blocks`
    );
  }

  private async onChainFinalized(
    event: Extract<L2BlockStreamEvent, { type: "chain-finalized" }>
  ): Promise<void> {
    // Mark all mined txs up to this block as finalized
    await this.db
      .update(transactions)
      .set({ status: "finalized" })
      .where(
        and(
          eq(transactions.networkId, this.networkId),
          eq(transactions.status, "mined")
        )
      );

    console.log(
      `[${this.networkId}] Chain finalized at block ${event.block.number}`
    );
  }
}
