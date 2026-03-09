import { describe, it, expect } from "vitest";
import { computeFeatureVector, FEATURE_DIM, NUMERIC_DIM } from "../features.js";
import type { ExtractedPendingData } from "../types.js";

function makeTx(overrides: Partial<ExtractedPendingData> = {}): ExtractedPendingData {
  return {
    txHash: "0xabc",
    numNoteHashes: 0,
    numNullifiers: 1,
    numL2ToL1Msgs: 0,
    numPrivateLogs: 0,
    numContractClassLogs: 0,
    gasLimitDa: null,
    gasLimitL2: null,
    maxFeePerDaGas: null,
    maxFeePerL2Gas: null,
    numSetupCalls: 0,
    numAppCalls: 0,
    hasTeardown: false,
    totalPublicCalldataSize: 0,
    publicCalls: [],
    feePayer: "0x" + "ab".repeat(32),
    expirationTimestamp: null,
    anchorBlockTimestamp: null,
    l2ToL1MsgDetails: [],
    ...overrides,
  };
}

describe("computeFeatureVector", () => {
  it("produces a 14-dimensional vector (13 numeric + 1 categorical)", () => {
    const vector = computeFeatureVector(makeTx());
    expect(vector).toHaveLength(FEATURE_DIM);
    expect(FEATURE_DIM).toBe(14);
    expect(NUMERIC_DIM).toBe(13);
  });

  it("encodes numeric features in the correct positions", () => {
    const tx = makeTx({
      numNoteHashes: 3,
      numNullifiers: 5,
      numL2ToL1Msgs: 1,
      numPrivateLogs: 2,
      numContractClassLogs: 1,
      gasLimitDa: 100,
      gasLimitL2: 200,
      maxFeePerDaGas: 10,
      maxFeePerL2Gas: 20,
      numSetupCalls: 1,
      numAppCalls: 2,
      totalPublicCalldataSize: 50,
      expirationTimestamp: 1000124,
      anchorBlockTimestamp: 1000100, // delta = 24
    });
    const vector = computeFeatureVector(tx);

    expect(vector[0]).toBe(3);   // numNoteHashes
    expect(vector[1]).toBe(5);   // numNullifiers
    expect(vector[2]).toBe(1);   // numL2ToL1Msgs
    expect(vector[3]).toBe(2);   // numPrivateLogs
    expect(vector[4]).toBe(1);   // numContractClassLogs
    expect(vector[5]).toBe(100); // gasLimitDa
    expect(vector[6]).toBe(200); // gasLimitL2
    expect(vector[7]).toBe(10);  // maxFeePerDaGas
    expect(vector[8]).toBe(20);  // maxFeePerL2Gas
    expect(vector[9]).toBe(1);   // numSetupCalls
    expect(vector[10]).toBe(2);  // numAppCalls
    expect(vector[11]).toBe(50); // totalPublicCalldataSize
    expect(vector[12]).toBe(24); // expirationDelta
  });

  it("includes fee payer address at position 13", () => {
    const addr = "0x" + "cd".repeat(32);
    const vector = computeFeatureVector(makeTx({ feePayer: addr }));
    expect(vector[13]).toBe(addr);
  });

  it("preserves different fee payer addresses", () => {
    const addrA = "0x" + "aa".repeat(32);
    const addrB = "0x" + "bb".repeat(32);
    const vA = computeFeatureVector(makeTx({ feePayer: addrA }));
    const vB = computeFeatureVector(makeTx({ feePayer: addrB }));
    expect(vA[13]).toBe(addrA);
    expect(vB[13]).toBe(addrB);
    expect(vA[13]).not.toBe(vB[13]);
  });

  it("uses 0 for null gas values and null expiration", () => {
    const vector = computeFeatureVector(makeTx());
    expect(vector[5]).toBe(0);  // gasLimitDa
    expect(vector[6]).toBe(0);  // gasLimitL2
    expect(vector[7]).toBe(0);  // maxFeePerDaGas
    expect(vector[8]).toBe(0);  // maxFeePerL2Gas
    expect(vector[12]).toBe(0); // expirationDelta (null → 0)
  });

  it("computes expiration delta from anchor block", () => {
    const vector = computeFeatureVector(makeTx({
      expirationTimestamp: 1000048,
      anchorBlockTimestamp: 1000000,
    }));
    expect(vector[12]).toBe(48);
  });

  it("uses 0 when only one of expiration/anchor is present", () => {
    const v1 = computeFeatureVector(makeTx({ expirationTimestamp: 100 }));
    expect(v1[12]).toBe(0);
    const v2 = computeFeatureVector(makeTx({ anchorBlockTimestamp: 100 }));
    expect(v2[12]).toBe(0);
  });

  it("produces different vectors for differently shaped txs", () => {
    const simple = computeFeatureVector(
      makeTx({ numNullifiers: 1, numNoteHashes: 0 }),
    );
    const complex = computeFeatureVector(
      makeTx({ numNullifiers: 5, numNoteHashes: 3, numPrivateLogs: 2 }),
    );

    expect(simple).not.toEqual(complex);
    expect(complex[0]).toBeGreaterThan(simple[0] as number);
    expect(complex[1]).toBeGreaterThan(simple[1] as number);
  });
});
