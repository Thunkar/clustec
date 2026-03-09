import type { AztecNode } from "@aztec/stdlib/interfaces/client";
import {
  type Db,
  transactions,
  contractInteractions,
  featureVectors,
} from "@clustec/common";
import { extractPendingTx } from "./extractor.js";
import { computeFeatureVector } from "./features.js";

export class MempoolPoller {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seen = new Set<string>();

  constructor(
    private readonly networkId: string,
    private readonly node: AztecNode,
    private readonly db: Db,
    private readonly pollIntervalMs: number = 500
  ) {}

  start(): void {
    this.running = true;
    console.log(
      `[${this.networkId}] Mempool poller started (every ${this.pollIntervalMs}ms)`
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
      console.error(`[${this.networkId}] Mempool poll error:`, err);
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

    let inserted = 0;
    for (const tx of newTxs) {
      const txHash = tx.getTxHash().toString();
      this.seen.add(txHash);

      try {
        const extracted = extractPendingTx(tx);
        const vector = computeFeatureVector(extracted);

        // Insert transaction
        const result = await this.db
          .insert(transactions)
          .values({
            networkId: this.networkId,
            txHash: extracted.txHash,
            status: "pending",
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
          })
          .onConflictDoNothing()
          .returning({ id: transactions.id });

        if (result.length === 0) continue; // already existed
        const txId = result[0].id;

        // Insert contract interactions and feature vector in parallel
        const inserts: Promise<unknown>[] = [];

        if (extracted.publicCalls.length > 0) {
          inserts.push(
            this.db.insert(contractInteractions).values(
              extracted.publicCalls.map((call) => ({
                txId,
                contractAddress: call.contractAddress,
                functionSelector: call.functionSelector,
                source: call.phase,
              }))
            )
          );
        }

        inserts.push(
          this.db
            .insert(featureVectors)
            .values({ txId, vector })
            .onConflictDoNothing()
        );

        await Promise.all(inserts);
        inserted++;
      } catch (err) {
        console.error(
          `[${this.networkId}] Failed to process pending tx ${txHash}:`,
          err
        );
      }
    }

    if (inserted > 0) {
      console.log(
        `[${this.networkId}] Indexed ${inserted} new pending txs (${this.seen.size} total seen)`
      );
    }
  }
}
