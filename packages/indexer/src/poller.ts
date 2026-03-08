import type { AztecNode } from "@aztec/stdlib/interfaces/client";
import type { L2Block } from "@aztec/stdlib/block";
import { TxHash } from "@aztec/stdlib/tx";
import { BlockNumber } from "@aztec/foundation/branded-types";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  type Db,
  networks,
  syncCursors,
  blocks,
  transactions,
  noteHashes,
  nullifiers,
  publicDataWrites,
  contractInteractions,
  featureVectors,
} from "@clustec/common";
import type { NetworkConfig } from "./config.js";
import {
  extractTxEffect,
  extractPublicInputs,
  type ExtractedTx,
  type ExtractedPublicInputs,
} from "./extractor.js";
import { computeFeatureVector } from "./features.js";

export class Poller {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: NetworkConfig,
    private readonly node: AztecNode,
    private readonly db: Db
  ) {}

  async start(): Promise<void> {
    await this.ensureNetwork();
    this.running = true;
    console.log(
      `[${this.config.id}] Indexer started. Polling every ${this.config.pollIntervalMs}ms`
    );
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`[${this.config.id}] Indexer stopped.`);
  }

  private async ensureNetwork(): Promise<void> {
    const existing = await this.db
      .select()
      .from(networks)
      .where(eq(networks.id, this.config.id))
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(networks).values({
        id: this.config.id,
        name: this.config.name,
        nodeUrl: this.config.nodeUrl,
        chainId: this.config.chainId,
      });
      await this.db.insert(syncCursors).values({
        networkId: this.config.id,
        lastBlockNumber: 0,
      });
      console.log(`[${this.config.id}] Network registered in DB.`);
    }
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      await this.sync();
      await this.backfillPublicInputs();
    } catch (err) {
      console.error(`[${this.config.id}] Sync error:`, err);
    }

    if (this.running) {
      this.timer = setTimeout(() => this.poll(), this.config.pollIntervalMs);
    }
  }

  private async sync(): Promise<void> {
    const cursor = await this.db
      .select()
      .from(syncCursors)
      .where(eq(syncCursors.networkId, this.config.id))
      .limit(1);

    const lastIndexed = cursor[0]?.lastBlockNumber ?? 0;

    let tipBlockNumber: number;
    let provenBlockNumber: number;
    try {
      [tipBlockNumber, provenBlockNumber] = await Promise.all([
        this.node.getBlockNumber(),
        this.node.getProvenBlockNumber(),
      ]);
    } catch (err) {
      console.error(`[${this.config.id}] Failed to get block number:`, err);
      return;
    }

    if (tipBlockNumber <= lastIndexed) {
      return; // nothing new
    }

    const from = lastIndexed + 1;
    const lag = tipBlockNumber - from + 1;
    const limit = Math.min(this.config.batchSize, lag);

    console.log(
      `[${this.config.id}] Fetching blocks ${from}..${from + limit - 1} (tip: ${tipBlockNumber}, behind: ${lag})`
    );

    // Fire parallel getBlocks calls (max 50 each) within the same microtick
    // so the JSON-RPC client batches them into a single HTTP request
    const MAX_PER_CALL = 50;
    const numCalls = Math.ceil(limit / MAX_PER_CALL);
    const promises: Promise<L2Block[]>[] = [];
    for (let i = 0; i < numCalls; i++) {
      const callFrom = from + i * MAX_PER_CALL;
      const callLimit = Math.min(MAX_PER_CALL, from + limit - callFrom);
      if (callLimit <= 0) break;
      promises.push(this.node.getBlocks(BlockNumber(callFrom), callLimit));
    }
    const results = await Promise.all(promises);
    const l2Blocks = results.flat();
    if (l2Blocks.length === 0) return;

    const t0 = Date.now();
    await this.processBatch(l2Blocks, provenBlockNumber);
    const elapsed = Date.now() - t0;

    const lastProcessed = l2Blocks[l2Blocks.length - 1].number;
    await this.db
      .update(syncCursors)
      .set({
        lastBlockNumber: lastProcessed,
        updatedAt: new Date(),
      })
      .where(eq(syncCursors.networkId, this.config.id));

    const totalTxs = l2Blocks.reduce(
      (sum, b) => sum + b.body.txEffects.length,
      0
    );
    console.log(
      `[${this.config.id}] Indexed blocks ${from}..${lastProcessed} (${totalTxs} txs in ${elapsed}ms)`
    );
  }

  /**
   * Process a batch of blocks with bulk DB inserts.
   * When atTip, tries to fetch public inputs from the mempool.
   */
  private async processBatch(
    l2Blocks: L2Block[],
    provenBlockNumber: number
  ): Promise<void> {
    // 1. Extract all data in memory first
    const blockRows: (typeof blocks.$inferInsert)[] = [];
    const txRows: {
      values: typeof transactions.$inferInsert;
      extracted: ExtractedTx;
      publicInputs: ExtractedPublicInputs | null;
    }[] = [];

    for (const block of l2Blocks) {
      const blockHash = await block.hash();
      blockRows.push({
        networkId: this.config.id,
        blockNumber: block.number,
        blockHash: blockHash.toString(),
        timestamp: Number(block.header.globalVariables.timestamp),
        slotNumber: Number(block.header.globalVariables.slotNumber),
        numTxs: block.body.txEffects.length,
        totalFees: block.header.totalFees.toString(),
        totalManaUsed: block.header.totalManaUsed.toString(),
      });

      for (let i = 0; i < block.body.txEffects.length; i++) {
        const effect = block.body.txEffects[i];
        const extracted = extractTxEffect(effect, i);

        // Only attempt getTxByHash for unproven blocks (still in mempool)
        let publicInputs: ExtractedPublicInputs | null = null;
        if (block.number > provenBlockNumber) {
          try {
            const tx = await this.node.getTxByHash(effect.txHash);
            if (tx) {
              publicInputs = extractPublicInputs(tx);
            }
          } catch {
            // tx already left the pool
          }
        }

        txRows.push({
          values: {
            networkId: this.config.id,
            blockNumber: block.number,
            txHash: extracted.txHash,
            txIndex: extracted.txIndex,
            revertCode: extracted.revertCode,
            transactionFee: extracted.transactionFee,
            numNoteHashes: extracted.numNoteHashes,
            numNullifiers: extracted.numNullifiers,
            numL2ToL1Msgs: extracted.numL2ToL1Msgs,
            numPublicDataWrites: extracted.numPublicDataWrites,
            numPrivateLogs: extracted.numPrivateLogs,
            numPublicLogs: extracted.numPublicLogs,
            numContractClassLogs: extracted.numContractClassLogs,
            privateLogTotalSize: extracted.privateLogTotalSize,
            publicLogTotalSize: extracted.publicLogTotalSize,
            feePayer: publicInputs?.feePayer,
            expirationTimestamp: publicInputs?.expirationTimestamp,
            gasLimitDa: publicInputs?.gasLimitDa,
            gasLimitL2: publicInputs?.gasLimitL2,
            maxFeePerDaGas: publicInputs?.maxFeePerDaGas,
            maxFeePerL2Gas: publicInputs?.maxFeePerL2Gas,
            gasUsedDa: publicInputs?.gasUsedDa,
            gasUsedL2: publicInputs?.gasUsedL2,
            numSetupCalls: publicInputs?.numSetupCalls ?? 0,
            numAppCalls: publicInputs?.numAppCalls ?? 0,
            hasTeardown: publicInputs?.hasTeardown ?? false,
            publicCalls: publicInputs?.publicCalls ?? [],
            l2ToL1MsgDetails: publicInputs?.l2ToL1Msgs ?? [],
            rawTxEffect: extracted.rawTxEffect,
            rawPublicInputs: publicInputs?.rawPublicInputs,
          },
          extracted,
          publicInputs,
        });
      }
    }

    // 2. Bulk insert blocks
    if (blockRows.length > 0) {
      await this.db.insert(blocks).values(blockRows).onConflictDoNothing();
    }

    if (txRows.length === 0) return;

    // 3. Bulk insert transactions and get back IDs
    const insertedTxs = await this.db
      .insert(transactions)
      .values(txRows.map((r) => r.values))
      .onConflictDoNothing()
      .returning({ id: transactions.id, txHash: transactions.txHash });

    // Build txHash -> id map for the inserted rows
    const txIdMap = new Map<string, number>();
    for (const row of insertedTxs) {
      txIdMap.set(row.txHash, row.id);
    }

    // 4. Bulk insert side effects
    const noteHashRows: (typeof noteHashes.$inferInsert)[] = [];
    const nullifierRows: (typeof nullifiers.$inferInsert)[] = [];
    const pdwRows: (typeof publicDataWrites.$inferInsert)[] = [];
    const ciRows: (typeof contractInteractions.$inferInsert)[] = [];
    const fvRows: (typeof featureVectors.$inferInsert)[] = [];

    for (const { values, extracted } of txRows) {
      const txId = txIdMap.get(values.txHash!);
      if (!txId) continue; // already existed

      for (let pos = 0; pos < extracted.noteHashes.length; pos++) {
        noteHashRows.push({
          txId,
          value: extracted.noteHashes[pos],
          position: pos,
        });
      }

      for (let pos = 0; pos < extracted.nullifiers.length; pos++) {
        nullifierRows.push({
          txId,
          value: extracted.nullifiers[pos],
          position: pos,
        });
      }

      for (let pos = 0; pos < extracted.publicDataWrites.length; pos++) {
        const w = extracted.publicDataWrites[pos];
        pdwRows.push({
          txId,
          leafSlot: w.leafSlot,
          value: w.value,
          position: pos,
        });
      }

      for (const ci of extracted.contractInteractions) {
        ciRows.push({
          txId,
          contractAddress: ci.contractAddress,
          source: ci.source,
        });
      }

      fvRows.push({
        txId,
        vector: computeFeatureVector(extracted),
      });
    }

    // Fire all side-effect inserts in parallel
    const inserts: Promise<unknown>[] = [];
    if (noteHashRows.length > 0) {
      inserts.push(this.db.insert(noteHashes).values(noteHashRows));
    }
    if (nullifierRows.length > 0) {
      inserts.push(this.db.insert(nullifiers).values(nullifierRows));
    }
    if (pdwRows.length > 0) {
      inserts.push(this.db.insert(publicDataWrites).values(pdwRows));
    }
    if (ciRows.length > 0) {
      inserts.push(this.db.insert(contractInteractions).values(ciRows));
    }
    if (fvRows.length > 0) {
      inserts.push(
        this.db.insert(featureVectors).values(fvRows).onConflictDoNothing()
      );
    }
    await Promise.all(inserts);
  }

  /**
   * Retry fetching public inputs for recent txs that were indexed without them.
   */
  private async backfillPublicInputs(): Promise<void> {
    const missing = await this.db
      .select({ id: transactions.id, txHash: transactions.txHash })
      .from(transactions)
      .where(
        and(
          eq(transactions.networkId, this.config.id),
          isNull(transactions.feePayer)
        )
      )
      .orderBy(desc(transactions.blockNumber))
      .limit(50);

    if (missing.length === 0) return;

    let filled = 0;
    for (const row of missing) {
      try {
        const tx = await this.node.getTxByHash(TxHash.fromString(row.txHash));
        if (!tx) continue;
        const pi = extractPublicInputs(tx);
        await this.db
          .update(transactions)
          .set({
            feePayer: pi.feePayer,
            expirationTimestamp: pi.expirationTimestamp,
            gasLimitDa: pi.gasLimitDa,
            gasLimitL2: pi.gasLimitL2,
            maxFeePerDaGas: pi.maxFeePerDaGas,
            maxFeePerL2Gas: pi.maxFeePerL2Gas,
            gasUsedDa: pi.gasUsedDa,
            gasUsedL2: pi.gasUsedL2,
            numSetupCalls: pi.numSetupCalls,
            numAppCalls: pi.numAppCalls,
            hasTeardown: pi.hasTeardown,
            publicCalls: pi.publicCalls,
            l2ToL1MsgDetails: pi.l2ToL1Msgs,
            rawPublicInputs: pi.rawPublicInputs,
          })
          .where(eq(transactions.id, row.id));
        filled++;
      } catch {
        // Node doesn't have this tx anymore — skip
      }
    }

    if (filled > 0) {
      console.log(
        `[${this.config.id}] Backfilled public inputs for ${filled}/${missing.length} txs`
      );
    }
  }
}
