import { describe, it, expect } from "vitest";
import { computeFeatureVector, FEATURE_DIM } from "../features.js";
import type { ExtractedPendingTx } from "../extractor.js";

function makeTx(overrides: Partial<ExtractedPendingTx> = {}): ExtractedPendingTx {
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
    feePayer: null,
    expirationTimestamp: null,
    l2ToL1MsgDetails: [],
    ...overrides,
  };
}

describe("computeFeatureVector", () => {
  it("produces an 18-dimensional vector", () => {
    const vector = computeFeatureVector(makeTx());
    expect(vector).toHaveLength(FEATURE_DIM);
    expect(FEATURE_DIM).toBe(18);
  });

  it("encodes shape counts in the correct positions", () => {
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
      hasTeardown: true,
      totalPublicCalldataSize: 50,
      publicCalls: [
        { contractAddress: "0xa", functionSelector: "0x1", msgSender: "0xb", isStaticCall: false, phase: "setup", calldataSize: 10, calldata: [] },
        { contractAddress: "0xa", functionSelector: "0x2", msgSender: "0xb", isStaticCall: true, phase: "app", calldataSize: 20, calldata: [] },
        { contractAddress: "0xc", functionSelector: "0x3", msgSender: "0xb", isStaticCall: false, phase: "app", calldataSize: 20, calldata: [] },
      ],
      feePayer: "0xfee",
      l2ToL1MsgDetails: [{ recipient: "0xr", senderContract: "0xs" }],
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
    expect(vector[11]).toBe(1);  // hasTeardown
    expect(vector[12]).toBe(50); // totalPublicCalldataSize
    expect(vector[13]).toBe(3);  // numPublicCalls
    expect(vector[14]).toBe(1);  // hasFeePayer
    expect(vector[15]).toBe(1);  // numL2ToL1MsgDetails
    expect(vector[16]).toBe(1);  // numStaticCalls
    expect(vector[17]).toBe(2);  // numDistinctContracts
  });

  it("uses 0 for null gas values", () => {
    const vector = computeFeatureVector(makeTx());
    expect(vector[5]).toBe(0); // gasLimitDa
    expect(vector[6]).toBe(0); // gasLimitL2
    expect(vector[7]).toBe(0); // maxFeePerDaGas
    expect(vector[8]).toBe(0); // maxFeePerL2Gas
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
