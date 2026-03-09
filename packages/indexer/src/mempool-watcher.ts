import type { AztecNode } from "@aztec/stdlib/interfaces/client";
import {
  type Db,
  transactions,
  contractInteractions,
  featureVectors,
} from "@clustec/common";
import { extractFromTx } from "./extractor.js";
import { computeFeatureVector } from "./features.js";

export class MempoolWatcher {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seen = new Set<string>();
  private readonly MAX_SEEN = 10000;

  constructor(
    private readonly networkId: string,
    private readonly node: AztecNode,
    private readonly db: Db,
    private readonly pollIntervalMs: number = 500
  ) {}

  start(): void {
    this.running = true;
    console.log(
      `[${this.networkId}] Mempool watcher started (every ${this.pollIntervalMs}ms)`
    );
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      await this.fetchPendingTxs();
    } catch (err) {
      console.error(`[${this.networkId}] Mempool watcher error:`, err);
    }

    if (this.running) {
      this.timer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  private async fetchPendingTxs(): Promise<void> {
    const pendingTxs = await this.node.getPendingTxs();
    if (pendingTxs.length === 0) return;

    const newTxs = pendingTxs.filter(
      (tx) => !this.seen.has(tx.getTxHash().toString())
    );
    if (newTxs.length === 0) return;

    let processed = 0;
    for (const tx of newTxs) {
      const txHash = tx.getTxHash().toString();
      this.seen.add(txHash);

      // Bounded seen set: clear when exceeding threshold to prevent memory leaks
      if (this.seen.size > this.MAX_SEEN) {
        this.seen.clear();
      }

      try {
        const extracted = extractFromTx(tx);
        const vector = computeFeatureVector(extracted);

        const pendingFields = {
          numNoteHashes: extracted.numNoteHashes,
          numNullifiers: extracted.numNullifiers,
          numL2ToL1Msgs: extracted.numL2ToL1Msgs,
          numPrivateLogs: extracted.numPrivateLogs,
          numContractClassLogs: extracted.numContractClassLogs,
          gasLimitDa: extracted.gasLimitDa,
          gasLimitL2: extracted.gasLimitL2,
          maxFeePerDaGas: extracted.maxFeePerDaGas,
          maxFeePerL2Gas: extracted.maxFeePerL2Gas,
          numSetupCalls: extracted.numSetupCalls,
          numAppCalls: extracted.numAppCalls,
          hasTeardown: extracted.hasTeardown,
          totalPublicCalldataSize: extracted.totalPublicCalldataSize,
          feePayer: extracted.feePayer,
          expirationTimestamp: extracted.expirationTimestamp,
          publicCalls: extracted.publicCalls,
          l2ToL1MsgDetails: extracted.l2ToL1MsgDetails,
          rawTx: JSON.parse(JSON.stringify(tx)),
          hasPendingData: true,
        };

        // Upsert transaction: insert as pending, or update pending-data fields
        // if the block processor hasn't seen it yet.
        const result = await this.db
          .insert(transactions)
          .values({
            networkId: this.networkId,
            txHash: extracted.txHash,
            status: "pending",
            firstSeenAt: new Date(),
            ...pendingFields,
          })
          .onConflictDoUpdate({
            target: [transactions.networkId, transactions.txHash],
            set: pendingFields,
          })
          .returning({ id: transactions.id, status: transactions.status });

        const txId = result[0].id;
        const currentStatus = result[0].status;

        // If the block processor already promoted this tx beyond pending,
        // skip — block processor is the source of truth.
        if (currentStatus !== "pending") {
          processed++;
          continue;
        }

        // Insert contract interactions and feature vector in parallel
        const inserts: Promise<unknown>[] = [];

        if (extracted.publicCalls.length > 0) {
          inserts.push(
            this.db
              .insert(contractInteractions)
              .values(
                extracted.publicCalls.map((call) => ({
                  txId,
                  contractAddress: call.contractAddress,
                  functionSelector: call.functionSelector,
                  source: call.phase,
                }))
              )
              .onConflictDoNothing()
          );
        }

        inserts.push(
          this.db
            .insert(featureVectors)
            .values({ txId, vector })
            .onConflictDoUpdate({
              target: featureVectors.txId,
              set: { vector, computedAt: new Date() },
            })
        );

        await Promise.all(inserts);
        processed++;
      } catch (err) {
        console.error(
          `[${this.networkId}] Failed to process pending tx ${txHash}:`,
          err
        );
      }
    }

    if (processed > 0) {
      console.log(
        `[${this.networkId}] Processed ${processed} pending txs (${this.seen.size} total seen)`
      );
    }
  }
}
