import { describe, it, expect } from "vitest";
import { extractMinedData } from "../extractor.js";

// Minimal mock that satisfies TxEffect shape for extractMinedData
function makeMockTxEffect(overrides: {
  noteHashes?: number;
  nullifiers?: number;
  publicDataWrites?: number;
  privateLogs?: number;
  publicLogs?: number;
} = {}) {
  const ZERO = "0x" + "0".repeat(64);
  const nonZero = (i: number) => "0x" + String(i + 1).padStart(64, "0");

  const noteHashCount = overrides.noteHashes ?? 0;
  const nullifierCount = overrides.nullifiers ?? 0;
  const pdwCount = overrides.publicDataWrites ?? 0;
  const privateLogCount = overrides.privateLogs ?? 0;
  const publicLogCount = overrides.publicLogs ?? 0;

  return {
    txHash: { toString: () => "0xabcdef" },
    revertCode: { getCode: () => 0 },
    transactionFee: { toString: () => "0x1000" },
    noteHashes: Array.from({ length: noteHashCount }, (_, i) => ({
      toString: () => nonZero(i + 200),
    })),
    nullifiers: Array.from({ length: nullifierCount }, (_, i) => ({
      toString: () => nonZero(i + 300),
    })),
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
  } as any;
}

describe("extractMinedData", () => {
  it("extracts basic mined data", () => {
    const effect = makeMockTxEffect();
    const result = extractMinedData(effect, 0);

    expect(result.txHash).toBe("0xabcdef");
    expect(result.txIndex).toBe(0);
    expect(result.revertCode).toBe(0);
    expect(result.actualFee).toBe("0x1000");
    expect(result.numPublicDataWrites).toBe(0);
    expect(result.numPublicLogs).toBe(0);
    expect(result.privateLogTotalSize).toBe(0);
    expect(result.publicLogTotalSize).toBe(0);
    expect(result.noteHashes).toEqual([]);
    expect(result.nullifiers).toEqual([]);
    expect(result.publicDataWrites).toEqual([]);
  });

  it("counts public data writes", () => {
    const effect = makeMockTxEffect({ publicDataWrites: 4 });
    const result = extractMinedData(effect, 2);

    expect(result.txIndex).toBe(2);
    expect(result.numPublicDataWrites).toBe(4);
    expect(result.publicDataWrites).toHaveLength(4);
  });

  it("extracts individual note hashes and nullifiers", () => {
    const effect = makeMockTxEffect({ noteHashes: 3, nullifiers: 2 });
    const result = extractMinedData(effect, 0);

    expect(result.noteHashes).toHaveLength(3);
    expect(result.nullifiers).toHaveLength(2);
  });

  it("calculates log sizes correctly", () => {
    const effect = makeMockTxEffect({
      privateLogs: 2,
      publicLogs: 3,
    });
    const result = extractMinedData(effect, 0);

    expect(result.numPublicLogs).toBe(3);
    expect(result.privateLogTotalSize).toBe(30); // 2 * 15
    expect(result.publicLogTotalSize).toBe(9); // 3 * 3 fields
  });

  it("handles a rich tx effect", () => {
    const effect = makeMockTxEffect({
      publicDataWrites: 10,
      privateLogs: 4,
      publicLogs: 6,
    });
    const result = extractMinedData(effect, 7);

    expect(result.txIndex).toBe(7);
    expect(result.numPublicDataWrites).toBe(10);
    expect(result.numPublicLogs).toBe(6);
    expect(result.privateLogTotalSize).toBe(60); // 4 * 15
    expect(result.publicLogTotalSize).toBe(18); // 6 * 3
  });
});
