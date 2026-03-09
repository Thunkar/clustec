import type { Tx, TxEffect } from "@aztec/stdlib/tx";

export interface PublicCallInfo {
  contractAddress: string;
  functionSelector: string;
  msgSender: string;
  isStaticCall: boolean;
  phase: "setup" | "app" | "teardown";
  calldataSize: number;
  calldata: string[];
}

export interface L2ToL1MsgInfo {
  recipient: string;
  senderContract: string;
}

export interface ExtractedPendingTx {
  txHash: string;

  // Shape counts (from private kernel public inputs)
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPrivateLogs: number;
  numContractClassLogs: number;

  // Gas settings
  gasLimitDa: number | null;
  gasLimitL2: number | null;
  maxFeePerDaGas: number | null;
  maxFeePerL2Gas: number | null;

  // Public call structure
  numSetupCalls: number;
  numAppCalls: number;
  hasTeardown: boolean;
  totalPublicCalldataSize: number;
  publicCalls: PublicCallInfo[];

  // Queryable metadata
  feePayer: string | null;
  expirationTimestamp: number | null;

  // L2→L1 messages
  l2ToL1MsgDetails: L2ToL1MsgInfo[];
}

const ZERO_ADDR_66 = "0x" + "0".repeat(64);
const ZERO_ETH_ADDR = "0x" + "0".repeat(40);

/**
 * Extract all data from a full Tx object (available in mempool).
 */
export function extractPendingTx(tx: Tx): ExtractedPendingTx {
  const data = tx.data;
  const gasSettings = data.constants?.txContext?.gasSettings;

  // Shape counts from private kernel outputs
  const numNoteHashes = data.getNonEmptyNoteHashes().length;
  const numNullifiers = data.getNonEmptyNullifiers().length;
  const numPrivateLogs = data.getNonEmptyPrivateLogs().length;
  const numContractClassLogs =
    data.getNonEmptyContractClassLogsHashes().length;

  // L2→L1 messages from accumulated data
  const l2ToL1MsgDetails: L2ToL1MsgInfo[] = [];
  let numL2ToL1Msgs = 0;
  if (data.forPublic) {
    const allMsgs = [
      ...data.forPublic.nonRevertibleAccumulatedData.l2ToL1Msgs,
      ...data.forPublic.revertibleAccumulatedData.l2ToL1Msgs,
    ];
    for (const scopedMsg of allMsgs) {
      const recipient = scopedMsg.message.recipient.toString();
      const senderContract = scopedMsg.contractAddress.toString();
      if (recipient !== ZERO_ETH_ADDR && senderContract !== ZERO_ADDR_66) {
        l2ToL1MsgDetails.push({ recipient, senderContract });
        numL2ToL1Msgs++;
      }
    }
  }

  // Public calls with function selectors
  const publicCalls: PublicCallInfo[] = [];
  let totalPublicCalldataSize = 0;

  const setupCalls = tx.getNonRevertiblePublicCallRequestsWithCalldata();
  for (const call of setupCalls) {
    const calldataSize = call.calldata.length;
    totalPublicCalldataSize += calldataSize;
    publicCalls.push({
      contractAddress: call.request.contractAddress.toString(),
      functionSelector: call.functionSelector.toString(),
      msgSender: call.request.msgSender.toString(),
      isStaticCall: call.request.isStaticCall,
      phase: "setup",
      calldataSize,
      calldata: call.calldata.map((f) => f.toString()),
    });
  }

  const appCalls = tx.getRevertiblePublicCallRequestsWithCalldata();
  for (const call of appCalls) {
    const calldataSize = call.calldata.length;
    totalPublicCalldataSize += calldataSize;
    publicCalls.push({
      contractAddress: call.request.contractAddress.toString(),
      functionSelector: call.functionSelector.toString(),
      msgSender: call.request.msgSender.toString(),
      isStaticCall: call.request.isStaticCall,
      phase: "app",
      calldataSize,
      calldata: call.calldata.map((f) => f.toString()),
    });
  }

  const teardownCall = tx.getTeardownPublicCallRequestWithCalldata();
  if (teardownCall) {
    const calldataSize = teardownCall.calldata.length;
    totalPublicCalldataSize += calldataSize;
    publicCalls.push({
      contractAddress: teardownCall.request.contractAddress.toString(),
      functionSelector: teardownCall.functionSelector.toString(),
      msgSender: teardownCall.request.msgSender.toString(),
      isStaticCall: teardownCall.request.isStaticCall,
      phase: "teardown",
      calldataSize,
      calldata: teardownCall.calldata.map((f) => f.toString()),
    });
  }

  return {
    txHash: tx.getTxHash().toString(),
    numNoteHashes,
    numNullifiers,
    numL2ToL1Msgs,
    numPrivateLogs,
    numContractClassLogs,
    gasLimitDa: gasSettings?.gasLimits?.daGas ?? null,
    gasLimitL2: gasSettings?.gasLimits?.l2Gas ?? null,
    maxFeePerDaGas:
      gasSettings?.maxFeesPerGas?.feePerDaGas != null
        ? Number(gasSettings.maxFeesPerGas.feePerDaGas)
        : null,
    maxFeePerL2Gas:
      gasSettings?.maxFeesPerGas?.feePerL2Gas != null
        ? Number(gasSettings.maxFeesPerGas.feePerL2Gas)
        : null,
    numSetupCalls: setupCalls.length,
    numAppCalls: appCalls.length,
    hasTeardown: !!teardownCall,
    totalPublicCalldataSize,
    publicCalls,
    feePayer: data.feePayer?.toString() ?? null,
    expirationTimestamp: data.expirationTimestamp
      ? Number(data.expirationTimestamp)
      : null,
    l2ToL1MsgDetails,
  };
}

/**
 * Data extracted from a TxEffect when a transaction is mined.
 * Used to update pending tx records with execution results.
 */
export interface MinedTxData {
  txHash: string;
  txIndex: number;
  revertCode: number;
  actualFee: string;
  numPublicDataWrites: number;
  numPublicLogs: number;
  privateLogTotalSize: number;
  publicLogTotalSize: number;

  // Individual items for cross-tx analysis
  noteHashes: string[];
  nullifiers: string[];
  publicDataWrites: { leafSlot: string; value: string }[];
}

/**
 * Extract execution results from a mined TxEffect.
 */
export function extractMinedData(
  effect: TxEffect,
  txIndex: number
): MinedTxData {
  const ZERO = "0x" + "0".repeat(64);

  const noteHashes = effect.noteHashes
    .map((h) => h.toString())
    .filter((h) => h !== ZERO);

  const nullifiers = effect.nullifiers
    .map((h) => h.toString())
    .filter((h) => h !== ZERO);

  const pdws = effect.publicDataWrites.filter(
    (w) =>
      w.leafSlot.toString() !== ZERO || w.value.toString() !== ZERO
  );

  const privateLogTotalSize = effect.privateLogs.reduce(
    (acc, log) => acc + log.emittedLength,
    0
  );

  const publicLogTotalSize = effect.publicLogs.reduce(
    (acc, log) => acc + log.fields.length,
    0
  );

  return {
    txHash: effect.txHash.toString(),
    txIndex,
    revertCode: effect.revertCode.getCode(),
    actualFee: effect.transactionFee.toString(),
    numPublicDataWrites: pdws.length,
    numPublicLogs: effect.publicLogs.length,
    privateLogTotalSize,
    publicLogTotalSize,
    noteHashes,
    nullifiers,
    publicDataWrites: pdws.map((w) => ({
      leafSlot: w.leafSlot.toString(),
      value: w.value.toString(),
    })),
  };
}
