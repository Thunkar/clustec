import { describe, it, expect } from "vitest";
import { extractTxEffect } from "../extractor.js";

// Minimal mock that satisfies TxEffect shape
function makeMockTxEffect(overrides: {
  noteHashes?: number;
  nullifiers?: number;
  l2ToL1Msgs?: number;
  publicDataWrites?: number;
  privateLogs?: number;
  publicLogs?: number;
  contractClassLogs?: number;
} = {}) {
  const ZERO = "0x" + "0".repeat(64);
  const nonZero = (i: number) => "0x" + String(i + 1).padStart(64, "0");

  const makeArr = (count: number) => {
    const items = [];
    for (let i = 0; i < count; i++) items.push({ toString: () => nonZero(i) });
    return items;
  };

  const makeZeroArr = (count: number) => {
    const items = [];
    for (let i = 0; i < count; i++) items.push({ toString: () => ZERO });
    return items;
  };

  const noteHashCount = overrides.noteHashes ?? 0;
  const nullifierCount = overrides.nullifiers ?? 1; // always at least 1 (the tx nullifier)
  const l2ToL1Count = overrides.l2ToL1Msgs ?? 0;
  const pdwCount = overrides.publicDataWrites ?? 0;
  const privateLogCount = overrides.privateLogs ?? 0;
  const publicLogCount = overrides.publicLogs ?? 0;
  const contractClassLogCount = overrides.contractClassLogs ?? 0;

  return {
    txHash: { toString: () => "0xabcdef" },
    revertCode: { getCode: () => 0 },
    transactionFee: { toString: () => "0x1000" },
    noteHashes: [...makeArr(noteHashCount), ...makeZeroArr(16 - noteHashCount)],
    nullifiers: [...makeArr(nullifierCount), ...makeZeroArr(16 - nullifierCount)],
    l2ToL1Msgs: [...makeArr(l2ToL1Count), ...makeZeroArr(2 - l2ToL1Count)],
    publicDataWrites: [
      ...Array.from({ length: pdwCount }, (_, i) => ({
        leafSlot: { toString: () => nonZero(i) },
        value: { toString: () => nonZero(i + 100) },
      })),
    ],
    privateLogs: Array.from({ length: privateLogCount }, () => ({
      emittedLength: 15,
    })),
    publicLogs: Array.from({ length: publicLogCount }, () => ({
      fields: [1, 2, 3],
    })),
    contractClassLogs: Array.from({ length: contractClassLogCount }, () => ({})),
  } as any;
}

describe("extractTxEffect", () => {
  it("extracts shape counts from a minimal tx", () => {
    const effect = makeMockTxEffect({ nullifiers: 1 });
    const result = extractTxEffect(effect, 0);

    expect(result.txHash).toBe("0xabcdef");
    expect(result.txIndex).toBe(0);
    expect(result.revertCode).toBe(0);
    expect(result.numNoteHashes).toBe(0);
    expect(result.numNullifiers).toBe(1);
    expect(result.numL2ToL1Msgs).toBe(0);
    expect(result.numPublicDataWrites).toBe(0);
    expect(result.numPrivateLogs).toBe(0);
    expect(result.numPublicLogs).toBe(0);
    expect(result.numContractClassLogs).toBe(0);
  });

  it("counts non-zero note hashes and nullifiers", () => {
    const effect = makeMockTxEffect({
      noteHashes: 3,
      nullifiers: 5,
    });
    const result = extractTxEffect(effect, 1);

    expect(result.numNoteHashes).toBe(3);
    expect(result.numNullifiers).toBe(5);
    expect(result.noteHashes).toHaveLength(3);
    expect(result.nullifiers).toHaveLength(5);
  });

  it("calculates log sizes correctly", () => {
    const effect = makeMockTxEffect({
      privateLogs: 2,
      publicLogs: 3,
    });
    const result = extractTxEffect(effect, 0);

    expect(result.numPrivateLogs).toBe(2);
    expect(result.privateLogTotalSize).toBe(30); // 2 * 15
    expect(result.numPublicLogs).toBe(3);
    expect(result.publicLogTotalSize).toBe(9); // 3 * 3 fields
  });

  it("filters zero-valued public data writes", () => {
    const effect = makeMockTxEffect({ publicDataWrites: 4 });
    const result = extractTxEffect(effect, 0);

    expect(result.numPublicDataWrites).toBe(4);
    expect(result.publicDataWrites).toHaveLength(4);
  });

  it("handles a rich transaction with all side effect types", () => {
    const effect = makeMockTxEffect({
      noteHashes: 5,
      nullifiers: 3,
      l2ToL1Msgs: 2,
      publicDataWrites: 10,
      privateLogs: 4,
      publicLogs: 6,
      contractClassLogs: 1,
    });
    const result = extractTxEffect(effect, 7);

    expect(result.txIndex).toBe(7);
    expect(result.numNoteHashes).toBe(5);
    expect(result.numNullifiers).toBe(3);
    expect(result.numL2ToL1Msgs).toBe(2);
    expect(result.numPublicDataWrites).toBe(10);
    expect(result.numPrivateLogs).toBe(4);
    expect(result.numPublicLogs).toBe(6);
    expect(result.numContractClassLogs).toBe(1);
  });
});
