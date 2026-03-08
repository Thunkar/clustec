import { describe, it, expect } from "vitest";
import { computeFeatureVector } from "../features.js";
import type { ExtractedTx } from "../extractor.js";

function makeTx(overrides: Partial<ExtractedTx> = {}): ExtractedTx {
  return {
    txHash: "0xabc",
    txIndex: 0,
    revertCode: 0,
    transactionFee: "1000",
    numNoteHashes: 0,
    numNullifiers: 1,
    numL2ToL1Msgs: 0,
    numPublicDataWrites: 0,
    numPrivateLogs: 0,
    numPublicLogs: 0,
    numContractClassLogs: 0,
    privateLogTotalSize: 0,
    publicLogTotalSize: 0,
    noteHashes: [],
    nullifiers: [],
    publicDataWrites: [],
    contractInteractions: [],
    rawTxEffect: {},
    ...overrides,
  };
}

describe("computeFeatureVector", () => {
  it("produces an 11-dimensional vector (tx effect shape only)", () => {
    const vector = computeFeatureVector(makeTx());
    expect(vector).toHaveLength(11);
  });

  it("encodes shape counts in the correct positions", () => {
    const tx = makeTx({
      numNoteHashes: 3,
      numNullifiers: 5,
      numL2ToL1Msgs: 1,
      numPublicDataWrites: 10,
      numPrivateLogs: 2,
      numPublicLogs: 4,
      numContractClassLogs: 1,
      privateLogTotalSize: 30,
      publicLogTotalSize: 12,
      transactionFee: "5000",
      revertCode: 1,
    });
    const vector = computeFeatureVector(tx);

    expect(vector[0]).toBe(3);   // numNoteHashes
    expect(vector[1]).toBe(5);   // numNullifiers
    expect(vector[2]).toBe(1);   // numL2ToL1Msgs
    expect(vector[3]).toBe(10);  // numPublicDataWrites
    expect(vector[4]).toBe(2);   // numPrivateLogs
    expect(vector[5]).toBe(4);   // numPublicLogs
    expect(vector[6]).toBe(1);   // numContractClassLogs
    expect(vector[7]).toBe(30);  // privateLogTotalSize
    expect(vector[8]).toBe(12);  // publicLogTotalSize
    expect(vector[9]).toBe(5000); // transactionFee
    expect(vector[10]).toBe(1);  // revertCode
  });

  it("does not include public inputs (gas settings, expiration)", () => {
    const vector = computeFeatureVector(makeTx());
    // Should only have 11 dimensions — no gas/expiration fields
    expect(vector).toHaveLength(11);
  });

  it("produces different vectors for differently shaped txs", () => {
    const simple = computeFeatureVector(
      makeTx({ numNullifiers: 1, numNoteHashes: 0 }),
    );
    const complex = computeFeatureVector(
      makeTx({ numNullifiers: 5, numNoteHashes: 3, numPrivateLogs: 2 }),
    );

    expect(simple).not.toEqual(complex);
    expect(complex[0]).toBeGreaterThan(simple[0]);
    expect(complex[1]).toBeGreaterThan(simple[1]);
  });
});
