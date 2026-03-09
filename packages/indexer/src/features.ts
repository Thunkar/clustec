import type { ExtractedPendingData } from "./types.js";

/**
 * Computes a feature vector from pending transaction data.
 * Contains both numeric and categorical features; the Python
 * analyzer uses Gower distance to handle mixed types.
 *
 * Dimensions (14):
 *  0:  numNoteHashes           (numeric)
 *  1:  numNullifiers           (numeric)
 *  2:  numL2ToL1Msgs           (numeric)
 *  3:  numPrivateLogs          (numeric)
 *  4:  numContractClassLogs    (numeric)
 *  5:  gasLimitDa              (numeric)
 *  6:  gasLimitL2              (numeric)
 *  7:  maxFeePerDaGas          (numeric)
 *  8:  maxFeePerL2Gas          (numeric)
 *  9:  numSetupCalls           (numeric)
 * 10:  numAppCalls             (numeric)
 * 11:  totalPublicCalldataSize (numeric)
 * 12:  expirationDelta         (numeric) — expirationTimestamp - anchorBlockTimestamp
 * 13:  feePayer                (categorical) — AztecAddress of fee payer
 */
export const NUMERIC_DIM = 13;
export const FEATURE_DIM = 14;

export type FeatureVector = (number | string)[];

export function computeFeatureVector(tx: ExtractedPendingData): FeatureVector {
  const expirationDelta =
    tx.expirationTimestamp != null && tx.anchorBlockTimestamp != null
      ? tx.expirationTimestamp - tx.anchorBlockTimestamp
      : 0;

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
    tx.totalPublicCalldataSize,
    expirationDelta,
    tx.feePayer,
  ];
}
