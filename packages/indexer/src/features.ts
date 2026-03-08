import type { ExtractedTx } from "./extractor.js";

/**
 * Computes a raw feature vector for a transaction.
 * This is stored as-is; normalization/scaling happens in the Python analyzer.
 *
 * Only uses tx effect shape — the on-chain fingerprint that determines privacy.
 * Public inputs (gas settings, expiration, etc.) are NOT included because they
 * vary based on wallet configuration, not transaction behavior, and are only
 * available for transactions caught in the mempool.
 *
 * Dimensions:
 *  0: numNoteHashes
 *  1: numNullifiers
 *  2: numL2ToL1Msgs
 *  3: numPublicDataWrites
 *  4: numPrivateLogs
 *  5: numPublicLogs
 *  6: numContractClassLogs
 *  7: privateLogTotalSize
 *  8: publicLogTotalSize
 *  9: transactionFee (as number, may lose precision for huge values)
 * 10: revertCode
 */
export function computeFeatureVector(tx: ExtractedTx): number[] {
  return [
    tx.numNoteHashes,
    tx.numNullifiers,
    tx.numL2ToL1Msgs,
    tx.numPublicDataWrites,
    tx.numPrivateLogs,
    tx.numPublicLogs,
    tx.numContractClassLogs,
    tx.privateLogTotalSize,
    tx.publicLogTotalSize,
    parseFloat(tx.transactionFee) || 0,
    tx.revertCode,
  ];
}
