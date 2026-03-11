const BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function deleteJson(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
}

// ── Types ──

export interface Network {
  id: string;
  name: string;
  nodeUrl: string;
  chainId: number;
  createdAt: string;
}

export interface NetworkStats {
  network: Network;
  blockCount: string;
  txCount: string;
  proposedBlock: number;
  checkpointedBlock: number;
  provenBlock: number;
  finalizedBlock: number;
}

export interface Block {
  id: number;
  networkId: string;
  blockNumber: number;
  blockHash: string | null;
  timestamp: number | null;
  slotNumber: number | null;
  numTxs: number;
  totalFees: string | null;
  totalManaUsed: string | null;
}

export type TxStatus = "dropped" | "pending" | "proposed" | "checkpointed" | "proven" | "finalized";
export type TxExecutionResult = "success" | "app_logic_reverted" | "teardown_reverted" | "both_reverted";

export interface Transaction {
  id: number;
  networkId: string;
  txHash: string;
  status: TxStatus;
  executionResult: TxExecutionResult | null;
  error: string | null;
  blockNumber: number | null;
  txIndex: number | null;
  actualFee: string | null;
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPrivateLogs: number;
  numContractClassLogs: number;
  gasLimitDa: number | null;
  gasLimitL2: number | null;
  maxFeePerDaGas: number | null;
  maxFeePerL2Gas: number | null;
  numSetupCalls: number;
  numAppCalls: number;
  hasTeardown: boolean;
  totalPublicCalldataSize: number;
  feePayer: string;
  expirationTimestamp: number | null;
  anchorBlockTimestamp: number | null;
  numPublicDataWrites: number | null;
  numPublicLogs: number | null;
  privateLogTotalSize: number | null;
  publicLogTotalSize: number | null;
  hasPendingData: boolean;
  firstSeenAt: string;
  proposedAt: string | null;
  createdAt: string;
}

export interface ClusterRun {
  id: number;
  networkId: string;
  algorithm: string;
  params: Record<string, unknown>;
  numClusters: number | null;
  numOutliers: number | null;
  computedAt: string;
}

export interface UmapPoint {
  txId: number;
  txHash: string;
  x: number;
  y: number;
  z: number | null;
  clusterId: number | null;
  outlierScore: number | null;
}

export interface OutlierEntry {
  txId: number;
  txHash: string;
  outlierScore: number | null;
  clusterId: number;
  clusterSize: number;
  blockNumber: number | null;
  numNoteHashes: number;
  numNullifiers: number;
  numPublicDataWrites: number | null;
  numPrivateLogs: number;
  numPublicLogs: number | null;
}

export interface ClusterSize {
  clusterId: number;
  count: string;
  avgOutlierScore: number | null;
  maxOutlierScore: number | null;
}

export interface ContractLabel {
  id: number;
  networkId: string;
  address: string;
  label: string;
  contractType: string | null;
}

export interface PublicCall {
  contractAddress: string;
  functionSelector: string | null;
  phase: "setup" | "app" | "teardown";
  msgSender: string | null;
  isStaticCall: boolean;
  calldataSize: number;
  calldata: string[];
  label: string | null;
  contractType: string | null;
}

export interface NoteHash {
  id: number;
  txId: number;
  value: string;
  position: number;
}

export interface Nullifier {
  id: number;
  txId: number;
  value: string;
  position: number;
}

export interface ResolvedContract {
  address: string;
  label: string | null;
  contractType: string | null;
  storageSlotIndex: number | string;
}

export interface PublicDataWrite {
  id: number;
  txId: number;
  leafSlot: string;
  value: string;
  position: number;
  resolvedContract: ResolvedContract | null;
}

export interface SlotWrite {
  txId: number;
  txHash: string;
  blockNumber: number | null;
  blockTimestamp: number | null;
  isFocalTx: boolean;
}

export interface SlotTimeline {
  leafSlot: string;
  resolvedContract: ResolvedContract | null;
  writes: SlotWrite[];
}

export interface TxGraphData {
  slots: SlotTimeline[];
}

export interface SimilarTx {
  txHash: string;
  blockNumber: number | null;
  status: string;
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
  expirationTimestamp: number | null;
  feePayer: string;
  outlierScore: number | null;
  featureVector: (number | string)[] | null;
}

export interface PrivateLogDetail {
  index: number;
  emittedLength: number;
}

export interface ContractClassLogDetail {
  index: number;
  contractAddress: string | null;
  contractClassId: string | null;
  emittedLength: number;
}

export interface PublicLogDetail {
  index: number;
  contractAddress: string | null;
  emittedLength: number;
}

export interface PublicAddress {
  address: string;
  source: string;
  label: string | null;
}

export interface FeePayerStat {
  address: string;
  count: number;
  label: string | null;
}

export interface PrivacySet {
  clusterId: number;
  clusterSize: number;
  totalTxsAnalyzed: number;
  outlierScore: number | null;
}

export interface FeePricingData {
  costUsd: number;
  costEth: number;
  costFpa: number;
  ethUsdPrice: number;
  ethPerFeeAssetE12: string;
}

export interface TxDetail {
  tx: Transaction;
  featureVector: (number | string)[] | null;
  noteHashes: NoteHash[];
  nullifiers: Nullifier[];
  publicDataWrites: PublicDataWrite[];
  publicCalls: PublicCall[];
  clusterMemberships: { runId: number; clusterId: number; membershipScore: number | null; outlierScore: number | null }[];
  privacySet: PrivacySet | null;
  similarTxs: SimilarTx[];
  privateLogDetails: PrivateLogDetail[];
  publicLogDetails: PublicLogDetail[];
  contractClassLogDetails: ContractClassLogDetail[];
  publicAddresses: PublicAddress[];
  feePayerPct: number;
  feePricingData: FeePricingData | null;
}

export interface ClusterMember {
  txId: number;
  txHash: string;
  status: string;
  membershipScore: number | null;
  outlierScore: number | null;
  blockNumber: number | null;
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
  expirationTimestamp: number | null;
  feePayer: string;
}

// ── Murder Board types ──

export interface MurderBoardTx {
  txHash: string;
  blockNumber: number | null;
  status: TxStatus;
  executionResult: TxExecutionResult | null;
  actualFee: string | null;
  roles: string[];
  clusterId: number | null;
  clusterSize: number | null;
  outlierScore: number | null;
  featureVector: (number | string)[] | null;
  feePayer: string;
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPrivateLogs: number;
  numPublicLogs: number | null;
  numSetupCalls: number;
  numAppCalls: number;
  totalPublicCalldataSize: number;
  createdAt: string;
}

export interface MurderBoardCluster {
  clusterId: number;
  clusterSize: number;
  txCount: number;
}

export interface MurderBoardFpc {
  address: string;
  label: string | null;
  contractType: string | null;
  txCount: number;
  networkShare: number;
}

export interface MurderBoardContract {
  address: string;
  label: string | null;
  contractType: string | null;
  callCount: number;
}

export interface PrivacyScoreFactor {
  name: string;
  impact: "good" | "bad" | "neutral";
  detail: string;
}

export interface MurderBoardData {
  address: string;
  totalTxs: number;
  networkTxCount: number;
  latestRunId: number | null;
  transactions: MurderBoardTx[];
  clusters: MurderBoardCluster[];
  fpcsUsed: MurderBoardFpc[];
  contractsInteracted: MurderBoardContract[];
  privacyScore: { score: number; factors: PrivacyScoreFactor[] } | null;
}

// ── API functions ──

export const api = {
  getNetworks: () => fetchJson<Network[]>("/networks"),
  getNetworkStats: (id: string) => fetchJson<NetworkStats>(`/networks/${id}/stats`),
  getBlocks: (id: string, page = 1, limit = 50) =>
    fetchJson<{ data: Block[]; page: number; limit: number }>(`/networks/${id}/blocks?page=${page}&limit=${limit}`),
  getBlock: (id: string, blockNumber: number) =>
    fetchJson<{ block: Block; transactions: Transaction[] }>(`/networks/${id}/blocks/${blockNumber}`),
  getTxs: (
    id: string,
    page = 1,
    limit = 50,
    filters?: { feePayer?: string; status?: string; search?: string; sort?: string; order?: string }
  ) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.feePayer) params.set("feePayer", filters.feePayer);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.sort) params.set("sort", filters.sort);
    if (filters?.order) params.set("order", filters.order);
    return fetchJson<{ data: Transaction[]; page: number; limit: number; total: number }>(
      `/networks/${id}/txs?${params.toString()}`
    );
  },
  getTxDetail: (id: string, hash: string) =>
    fetchJson<TxDetail>(`/networks/${id}/txs/${hash}`),
  getClusterRuns: (id: string) => fetchJson<ClusterRun[]>(`/networks/${id}/clusters`),
  getClusterDetail: (id: string, runId: number) =>
    fetchJson<{ run: ClusterRun; clusterSizes: ClusterSize[] }>(`/networks/${id}/clusters/${runId}`),
  getUmapPoints: (id: string, runId: number) =>
    fetchJson<{ runId: number; points: UmapPoint[] }>(`/networks/${id}/clusters/${runId}/umap`),
  getOutliers: (id: string, runId: number, limit = 50) =>
    fetchJson<{ runId: number; totalTxsAnalyzed: number; outliers: OutlierEntry[] }>(`/networks/${id}/clusters/${runId}/outliers?limit=${limit}`),
  getLabels: (id: string) => fetchJson<ContractLabel[]>(`/networks/${id}/labels`),
  addLabel: (id: string, data: { address: string; label: string; contractType?: string }) =>
    postJson<ContractLabel>(`/networks/${id}/labels`, data),
  deleteLabel: (id: string, labelId: number) => deleteJson(`/networks/${id}/labels/${labelId}`),
  getTxGraph: (id: string, hash: string) =>
    fetchJson<TxGraphData>(`/networks/${id}/txs/${hash}/graph`),
  getClusterMembers: (id: string, runId: number, clusterId: number) =>
    fetchJson<{ clusterId: number; members: ClusterMember[] }>(`/networks/${id}/clusters/${runId}/${clusterId}`),
  getFeePayerStats: (id: string) =>
    fetchJson<{ feePayers: FeePayerStat[] }>(`/networks/${id}/txs/stats/fee-payers`),
  getMurderBoard: (id: string, address: string) =>
    fetchJson<MurderBoardData>(`/networks/${id}/murder-board/${encodeURIComponent(address)}`),
};
