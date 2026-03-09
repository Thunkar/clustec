// Re-export status types from Aztec SDK for convenience
// TxStatus values: 'dropped', 'pending', 'proposed', 'checkpointed', 'proven', 'finalized'
// TxExecutionResult values: 'success', 'app_logic_reverted', 'teardown_reverted', 'both_reverted'

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

// Data extracted from the full Tx object (available in mempool, before execution)
export interface ExtractedPendingData {
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

  // Metadata
  feePayer: string;
  expirationTimestamp: number | null;
  anchorBlockTimestamp: number | null;
  l2ToL1MsgDetails: L2ToL1MsgInfo[];
}

// Data extracted from TxEffect (available after mining/proposing)
export interface ExtractedMinedData {
  txHash: string;
  txIndex: number;
  executionResult:
    | "success"
    | "app_logic_reverted"
    | "teardown_reverted"
    | "both_reverted";
  actualFee: string;

  // Execution result counts
  numPublicDataWrites: number;
  numPublicLogs: number;
  privateLogTotalSize: number;
  publicLogTotalSize: number;

  // Individual items for cross-tx analysis
  noteHashes: string[];
  nullifiers: string[];
  publicDataWrites: { leafSlot: string; value: string }[];
}

// Data extracted from TxReceipt (for status reconciliation)
export interface ExtractedReceiptData {
  txHash: string;
  status: string; // one of TxStatus values
  executionResult: string | null; // one of TxExecutionResult values or null
  error: string | null;
  blockNumber: number | null;
  transactionFee: string | null;
}
