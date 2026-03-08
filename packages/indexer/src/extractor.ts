import type { TxEffect, Tx } from "@aztec/stdlib/tx";

export interface ContractInteraction {
  contractAddress: string;
  source: "public_log" | "contract_class_log" | "public_data_write";
}

export interface ExtractedTx {
  txHash: string;
  txIndex: number;
  revertCode: number;
  transactionFee: string;

  // Shape counts
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPublicDataWrites: number;
  numPrivateLogs: number;
  numPublicLogs: number;
  numContractClassLogs: number;
  privateLogTotalSize: number;
  publicLogTotalSize: number;

  // Side effects for cross-tx analysis
  noteHashes: string[];
  nullifiers: string[];
  publicDataWrites: { leafSlot: string; value: string }[];

  // Contract interactions extracted from logs
  contractInteractions: ContractInteraction[];

  // Raw data
  rawTxEffect: unknown;
}

const ZERO_ADDRESS = "0x" + "0".repeat(64);

function extractContractInteractions(effect: TxEffect): ContractInteraction[] {
  const seen = new Set<string>();
  const interactions: ContractInteraction[] = [];

  for (const log of effect.publicLogs) {
    const addr = log.contractAddress.toString();
    const key = `${addr}:public_log`;
    if (addr !== ZERO_ADDRESS && !seen.has(key)) {
      seen.add(key);
      interactions.push({ contractAddress: addr, source: "public_log" });
    }
  }

  for (const log of effect.contractClassLogs) {
    const addr = log.contractAddress.toString();
    const key = `${addr}:contract_class_log`;
    if (addr !== ZERO_ADDRESS && !seen.has(key)) {
      seen.add(key);
      interactions.push({ contractAddress: addr, source: "contract_class_log" });
    }
  }

  return interactions;
}

export function extractTxEffect(
  effect: TxEffect,
  txIndex: number
): ExtractedTx {
  const noteHashes = effect.noteHashes
    .map((h) => h.toString())
    .filter((h) => h !== "0x" + "0".repeat(64));

  const nullifiers = effect.nullifiers
    .map((h) => h.toString())
    .filter((h) => h !== "0x" + "0".repeat(64));

  const l2ToL1Msgs = effect.l2ToL1Msgs.filter(
    (m) => m.toString() !== "0x" + "0".repeat(64)
  );

  const pdws = effect.publicDataWrites.filter(
    (w) =>
      w.leafSlot.toString() !== "0x" + "0".repeat(64) ||
      w.value.toString() !== "0x" + "0".repeat(64)
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
    transactionFee: effect.transactionFee.toString(),

    numNoteHashes: noteHashes.length,
    numNullifiers: nullifiers.length,
    numL2ToL1Msgs: l2ToL1Msgs.length,
    numPublicDataWrites: pdws.length,
    numPrivateLogs: effect.privateLogs.filter((l) => l.emittedLength > 0)
      .length,
    numPublicLogs: effect.publicLogs.length,
    numContractClassLogs: effect.contractClassLogs.length,
    privateLogTotalSize,
    publicLogTotalSize,

    noteHashes,
    nullifiers,
    publicDataWrites: pdws.map((w) => ({
      leafSlot: w.leafSlot.toString(),
      value: w.value.toString(),
    })),

    contractInteractions: extractContractInteractions(effect),

    rawTxEffect: JSON.parse(JSON.stringify(effect)),
  };
}

export interface PublicCallInfo {
  contractAddress: string;
  msgSender: string;
  isStaticCall: boolean;
  phase: "setup" | "app" | "teardown";
}

export interface L2ToL1MsgInfo {
  /** Ethereum recipient address */
  recipient: string;
  /** Aztec contract that emitted the message */
  senderContract: string;
}

export interface ExtractedPublicInputs {
  feePayer: string | null;
  expirationTimestamp: number | null;
  gasLimitDa: number | null;
  gasLimitL2: number | null;
  maxFeePerDaGas: number | null;
  maxFeePerL2Gas: number | null;

  // Gas used after private execution
  gasUsedDa: number | null;
  gasUsedL2: number | null;

  // Public call structure
  numSetupCalls: number;
  numAppCalls: number;
  hasTeardown: boolean;
  publicCalls: PublicCallInfo[];

  // L2→L1 messages with recipients (from accumulated data, not tx effect)
  l2ToL1Msgs: L2ToL1MsgInfo[];

  rawPublicInputs: unknown;
}

const ZERO_ADDR_66 = "0x" + "0".repeat(64);
const ZERO_ETH_ADDR = "0x" + "0".repeat(40);

export function extractPublicInputs(tx: Tx): ExtractedPublicInputs {
  const data = tx.data;
  const gasSettings = data.constants?.txContext?.gasSettings;

  // Extract public call requests
  const publicCalls: PublicCallInfo[] = [];

  const setupCalls = data.getNonRevertiblePublicCallRequests();
  for (const call of setupCalls) {
    publicCalls.push({
      contractAddress: call.contractAddress.toString(),
      msgSender: call.msgSender.toString(),
      isStaticCall: call.isStaticCall,
      phase: "setup",
    });
  }

  const appCalls = data.getRevertiblePublicCallRequests();
  for (const call of appCalls) {
    publicCalls.push({
      contractAddress: call.contractAddress.toString(),
      msgSender: call.msgSender.toString(),
      isStaticCall: call.isStaticCall,
      phase: "app",
    });
  }

  const teardownCall = data.getTeardownPublicCallRequest();
  if (teardownCall) {
    publicCalls.push({
      contractAddress: teardownCall.contractAddress.toString(),
      msgSender: teardownCall.msgSender.toString(),
      isStaticCall: teardownCall.isStaticCall,
      phase: "teardown",
    });
  }

  // Extract L2→L1 messages with recipients from accumulated data
  const l2ToL1Msgs: L2ToL1MsgInfo[] = [];
  if (data.forPublic) {
    const allMsgs = [
      ...data.forPublic.nonRevertibleAccumulatedData.l2ToL1Msgs,
      ...data.forPublic.revertibleAccumulatedData.l2ToL1Msgs,
    ];
    for (const scopedMsg of allMsgs) {
      const recipient = scopedMsg.message.recipient.toString();
      const senderContract = scopedMsg.contractAddress.toString();
      if (recipient !== ZERO_ETH_ADDR && senderContract !== ZERO_ADDR_66) {
        l2ToL1Msgs.push({ recipient, senderContract });
      }
    }
  }

  return {
    feePayer: data.feePayer?.toString() ?? null,
    expirationTimestamp: data.expirationTimestamp
      ? Number(data.expirationTimestamp)
      : null,
    gasLimitDa: gasSettings?.gasLimits?.daGas ?? null,
    gasLimitL2: gasSettings?.gasLimits?.l2Gas ?? null,
    maxFeePerDaGas: gasSettings?.maxFeesPerGas?.feePerDaGas != null
      ? Number(gasSettings.maxFeesPerGas.feePerDaGas)
      : null,
    maxFeePerL2Gas: gasSettings?.maxFeesPerGas?.feePerL2Gas != null
      ? Number(gasSettings.maxFeesPerGas.feePerL2Gas)
      : null,

    gasUsedDa: data.gasUsed?.daGas ?? null,
    gasUsedL2: data.gasUsed?.l2Gas ?? null,

    numSetupCalls: setupCalls.length,
    numAppCalls: appCalls.length,
    hasTeardown: !!teardownCall,
    publicCalls,

    l2ToL1Msgs,

    rawPublicInputs: JSON.parse(JSON.stringify(data)),
  };
}
