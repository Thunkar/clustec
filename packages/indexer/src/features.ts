/**
 * Computes a feature vector from transaction data.
 * Contains both numeric and categorical features; the Python
 * analyzer uses Gower distance to handle mixed types.
 *
 * Feature vectors are computed after a tx is mined (proposed),
 * so post-execution fields like numPublicLogs are available.
 *
 * Dimensions (15):
 *  0:  numNoteHashes           (numeric)
 *  1:  numNullifiers           (numeric)
 *  2:  numL2ToL1Msgs           (numeric)
 *  3:  numPrivateLogs          (numeric)
 *  4:  numContractClassLogs    (numeric)
 *  5:  numPublicLogs           (numeric)
 *  6:  gasLimitDa              (numeric)
 *  7:  gasLimitL2              (numeric)
 *  8:  maxFeePerDaGas          (numeric)
 *  9:  maxFeePerL2Gas          (numeric)
 * 10:  numSetupCalls           (numeric)
 * 11:  numAppCalls             (numeric)
 * 12:  totalPublicCalldataSize (numeric)
 * 13:  expirationDelta         (numeric) — expirationTimestamp - anchorBlockTimestamp
 * 14:  feePayer                (categorical) — AztecAddress of fee payer
 */
export const NUMERIC_DIM = 14;
export const FEATURE_DIM = 15;

export type FeatureVector = (number | string)[];

export interface FeatureInput {
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPrivateLogs: number;
  numContractClassLogs: number;
  numPublicLogs: number | null;
  gasLimitDa: number | null;
  gasLimitL2: number | null;
  maxFeePerDaGas: number | null;
  maxFeePerL2Gas: number | null;
  numSetupCalls: number;
  numAppCalls: number;
  totalPublicCalldataSize: number;
  feePayer: string;
  expirationTimestamp: number | null;
  anchorBlockTimestamp: number | null;
}

export function computeFeatureVector(tx: FeatureInput): FeatureVector {
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
    tx.numPublicLogs ?? 0,
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
