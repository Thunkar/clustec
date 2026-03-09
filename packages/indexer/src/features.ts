import type { ExtractedPendingTx } from "./extractor.js";

/**
 * Computes a raw feature vector for a pending transaction.
 * Stored as-is; normalization/scaling happens in the Python analyzer.
 *
 * All dimensions are available for every indexed tx because we only
 * index txs caught from the mempool (full Tx objects).
 *
 * Dimensions (18):
 *  0: numNoteHashes
 *  1: numNullifiers
 *  2: numL2ToL1Msgs
 *  3: numPrivateLogs
 *  4: numContractClassLogs
 *  5: gasLimitDa
 *  6: gasLimitL2
 *  7: maxFeePerDaGas
 *  8: maxFeePerL2Gas
 *  9: numSetupCalls
 * 10: numAppCalls
 * 11: hasTeardown (0/1)
 * 12: totalPublicCalldataSize
 * 13: numPublicCalls (total across all phases)
 * 14: hasFeePayer (0/1) — whether a fee payer contract is used
 * 15: numL2ToL1MsgDetails
 * 16: numStaticCalls
 * 17: numDistinctContracts
 */
export const FEATURE_DIM = 18;

export function computeFeatureVector(tx: ExtractedPendingTx): number[] {
  const numStaticCalls = tx.publicCalls.filter((c) => c.isStaticCall).length;
  const distinctContracts = new Set(
    tx.publicCalls.map((c) => c.contractAddress)
  ).size;

  return [
    tx.numNoteHashes,
    tx.numNullifiers,
    tx.numL2ToL1Msgs,
    tx.numPrivateLogs,
    tx.numContractClassLogs,
    tx.gasLimitDa ?? 0,
    tx.gasLimitL2 ?? 0,
    tx.maxFeePerDaGas ?? 0,
    tx.maxFeePerL2Gas ?? 0,
    tx.numSetupCalls,
    tx.numAppCalls,
    tx.hasTeardown ? 1 : 0,
    tx.totalPublicCalldataSize,
    tx.publicCalls.length,
    tx.feePayer ? 1 : 0,
    tx.l2ToL1MsgDetails.length,
    numStaticCalls,
    distinctContracts,
  ];
}
