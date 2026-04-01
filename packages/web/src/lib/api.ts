import { useAuthStore } from "../stores/auth.js";

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

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  detail: { error?: string; stderr?: string; stdout?: string } | null;
  constructor(status: number, statusText: string, detail: ApiError["detail"]) {
    super(detail?.error ?? `API error: ${status} ${statusText}`);
    this.detail = detail;
  }
}

async function postJsonAuth<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    let detail = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, res.statusText, detail);
  }
  return res.json();
}

async function deleteJsonAuth(path: string): Promise<void>;
async function deleteJsonAuth<T>(path: string, expectJson: true): Promise<T>;
async function deleteJsonAuth<T>(path: string, expectJson?: boolean): Promise<T | void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  if (expectJson) return res.json() as Promise<T>;
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
  txHash: string | null;
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

export interface NearbyWrite {
  txHash: string;
  blockNumber: number | null;
  blockTimestamp: number | null;
  isFocalTx: boolean;
}

export interface SlotSummary {
  leafSlot: string;
  resolvedContract: ResolvedContract | null;
  totalWrites: number;
  focalBlockNumber: number | null;
  blockRange: { min: number; max: number };
  histogram: number[];
  focalBin: number | null;
  nearbyWrites: NearbyWrite[];
}

export interface TxGraphData {
  slots: SlotSummary[];
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
  hasTeardown: boolean;
  totalPublicCalldataSize: number;
  expirationTimestamp: number | null;
  feePayer: string;
  outlierScore: number | null;
  featureVector: (number | string)[] | null;
}

export interface PrivateLogDetail {
  index: number;
  emittedLength: number;
  fields: string[];
}

export interface ContractClassLogDetail {
  index: number;
  contractAddress: string | null;
  contractClassId: string | null;
  emittedLength: number;
  fields: string[];
}

export interface PublicLogDetail {
  index: number;
  contractAddress: string | null;
  emittedLength: number;
  fields: string[];
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
  hasTeardown: boolean;
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
  feePayer: string;
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPrivateLogs: number;
  numPublicLogs: number | null;
  numSetupCalls: number;
  numAppCalls: number;
  hasTeardown: boolean;
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

export type FeatureWeights = Record<string, number>;

export type NormalizationMode = "minmax" | "rank";

export interface AnalysisConfig {
  minClusterSize: number;
  nNeighbors: number;
  minDist: number;
  weights: FeatureWeights;
  normalization: NormalizationMode;
}

export interface FeatureStat {
  name: string;
  type: "numeric" | "categorical";
  unique: number;
  min?: number;
  max?: number;
  std?: number;
  p50?: number;
  dominantPct?: number;
  topValues?: { value: string; count: number; pct: number }[];
}

export interface FeatureStatsData {
  totalVectors: number;
  features: FeatureStat[];
}

export const FEATURE_NAMES = [
  "numNoteHashes",
  "numNullifiers",
  "numL2ToL1Msgs",
  "numPrivateLogs",
  "numContractClassLogs",
  "numPublicLogs",
  "gasLimitDa",
  "gasLimitL2",
  "maxFeePerDaGas",
  "maxFeePerL2Gas",
  "numSetupCalls",
  "numAppCalls",
  "hasTeardown",
  "totalPublicCalldataSize",
  "expirationDelta",
  "feePayer",
] as const;

export const DEFAULT_WEIGHTS: FeatureWeights = Object.fromEntries(
  FEATURE_NAMES.map((name) => [
    name,
    (name === "maxFeePerDaGas" || name === "maxFeePerL2Gas") ? 0.25 : 1.0,
  ]),
);

export const FEATURE_LABELS: Record<string, { label: string; group: string }> = {
  numNoteHashes: { label: "Note hashes", group: "Shape" },
  numNullifiers: { label: "Nullifiers", group: "Shape" },
  numL2ToL1Msgs: { label: "L2→L1 msgs", group: "Shape" },
  numPrivateLogs: { label: "Private logs", group: "Shape" },
  numContractClassLogs: { label: "Class logs", group: "Shape" },
  numPublicLogs: { label: "Public logs", group: "Shape" },
  gasLimitDa: { label: "DA mana limit", group: "Mana" },
  gasLimitL2: { label: "L2 mana limit", group: "Mana" },
  maxFeePerDaGas: { label: "Max fee/DA mana", group: "Fees" },
  maxFeePerL2Gas: { label: "Max fee/L2 mana", group: "Fees" },
  numSetupCalls: { label: "Setup calls", group: "Calls" },
  numAppCalls: { label: "App calls", group: "Calls" },
  hasTeardown: { label: "Has teardown", group: "Calls" },
  totalPublicCalldataSize: { label: "Calldata size", group: "Calls" },
  expirationDelta: { label: "Expiration delta", group: "Timing" },
  feePayer: { label: "Fee payer", group: "Identity" },
};

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
  page: number;
  limit: number;
  totalPages: number;
}

// ── Fee types ──

export interface FeeHistoryPoint {
  blockNumber: number;
  timestamp: number | null;
  feePerDaGas: string | null;
  feePerL2Gas: string | null;
  totalFees: string | null;
  numTxs: number;
}

export interface FeeSpreadBucket {
  bucket: number;
  txCount: number;
  avgActualFee: string | null;
  minActualFee: string | null;
  maxActualFee: string | null;
  p25ActualFee: string | null;
  medianActualFee: string | null;
  p75ActualFee: string | null;
  medianMaxFeePerDaGas: string | null;
  medianMaxFeePerL2Gas: string | null;
  p25MaxFeePerL2Gas: string | null;
  p75MaxFeePerL2Gas: string | null;
  medianGasLimitDa: string | null;
  medianGasLimitL2: string | null;
}

export interface CurrentFees {
  block: FeeHistoryPoint | null;
  pricing: { ethUsdPrice: number; ethPerFeeAssetE12: string } | null;
}

// ── API functions ──

export interface BlockHistoryPoint {
  blockNumber: number;
  timestamp: number | null;
  slotNumber: number | null;
  numTxs: number;
  totalFees: string | null;
  totalManaUsed: string | null;
  feePerDaGas: string | null;
  feePerL2Gas: string | null;
  coinbase: string | null;
  checkpointNumber: number | null;
  indexWithinCheckpoint: number | null;
  cpStatus: "checkpointed" | "proven" | "finalized" | null;
  cpBlockCount: number | null;
  cpAttestations: number | null;
}

export interface BlockStatsData {
  blockCount: number;
  blockRange: { from: number; to: number };
  timespan: number;
  avgBlockTime: number;
  avgTxsPerBlock: number;
  maxTxsPerBlock: number;
  totalTxs: number;
  avgManaPerBlock: string;
  maxManaPerBlock: string;
  avgFeesPerBlock: string;
  totalFees: string;
  emptyBlocks: number;
  emptyBlockPct: number;
  proposerCount: number;
  missedSlots: number;
  proposers: { coinbase: string | null; blockCount: number; share: number }[];
}

export interface BlockConfigData {
  maxL2BlockGas: number | null;
  maxDABlockGas: number | null;
  maxTxsPerBlock: number | null;
  maxTxsPerCheckpoint: number | null;
  minTxsPerBlock: number | null;
  aztecSlotDuration: number | null;
  ethereumSlotDuration: number | null;
  aztecEpochDuration: number | null;
}

export interface CheckpointHistoryPoint {
  checkpointNumber: number;
  slotNumber: number | null;
  startBlock: number | null;
  endBlock: number | null;
  blockCount: number;
  totalManaUsed: string | null;
  totalFees: string | null;
  coinbase: string | null;
  attestationCount: number | null;
  l1BlockNumber: number | null;
  l1Timestamp: number | null;
  provenAt: string | null;
  finalizedAt: string | null;
}

export interface CheckpointStatsData {
  checkpointCount: number;
  range: { from: number; to: number };
  avgBlocksPerCheckpoint: number;
  maxBlocksPerCheckpoint: number;
  avgManaPerCheckpoint: string;
  avgFeesPerCheckpoint: string;
  avgAttestations: number;
  provenCount: number;
  finalizedCount: number;
  provenPct: number;
  finalizedPct: number;
}

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
    postJsonAuth<ContractLabel>(`/networks/${id}/labels`, data),
  deleteLabel: (id: string, labelId: number) => deleteJsonAuth(`/networks/${id}/labels/${labelId}`),
  getAnalysisStatus: (networkId: string) =>
    fetchJson<{ scheduled: boolean; intervalMinutes: number; running: boolean; config: AnalysisConfig }>(`/networks/${networkId}/analyze/status`),
  login: (password: string) => postJson<{ token: string }>("/auth/login", { password }),
  triggerAnalysis: (
    networkId: string,
    params: Partial<AnalysisConfig>,
  ) => postJsonAuth<{ status: string; output: string }>(`/networks/${networkId}/analyze/trigger`, params),
  saveAnalysisConfig: (
    networkId: string,
    params: Partial<AnalysisConfig>,
  ) => postJsonAuth<{ config: AnalysisConfig }>(`/networks/${networkId}/analyze/config`, params),
  revertAnalysisConfig: (networkId: string) =>
    deleteJsonAuth<{ config: AnalysisConfig }>(`/networks/${networkId}/analyze/config`, true),
  getFeatureStats: (networkId: string) =>
    fetchJson<FeatureStatsData>(`/networks/${networkId}/analyze/feature-stats`),
  getTxGraph: (id: string, hash: string) =>
    fetchJson<TxGraphData>(`/networks/${id}/txs/${hash}/graph`),
  getClusterMembers: (id: string, runId: number, clusterId: number) =>
    fetchJson<{ clusterId: number; members: ClusterMember[] }>(`/networks/${id}/clusters/${runId}/${clusterId}`),
  getFeePayerStats: (id: string) =>
    fetchJson<{ feePayers: FeePayerStat[] }>(`/networks/${id}/txs/stats/fee-payers`),
  getMurderBoard: (id: string, address: string, opts?: { page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.page) params.set("page", String(opts.page));
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return fetchJson<MurderBoardData>(`/networks/${id}/murder-board/${encodeURIComponent(address)}${qs ? `?${qs}` : ""}`);
  },
  getFeeHistory: (id: string, opts?: { from?: number; to?: number; resolution?: string }) => {
    const params = new URLSearchParams();
    if (opts?.from != null) params.set("from", String(opts.from));
    if (opts?.to != null) params.set("to", String(opts.to));
    if (opts?.resolution) params.set("resolution", opts.resolution);
    return fetchJson<{ data: FeeHistoryPoint[]; bucketSize?: number }>(
      `/networks/${id}/fees/history?${params.toString()}`
    );
  },
  getFeeSpread: (id: string, opts?: { from?: number; to?: number; bucketSize?: number }) => {
    const params = new URLSearchParams();
    if (opts?.from != null) params.set("from", String(opts.from));
    if (opts?.to != null) params.set("to", String(opts.to));
    if (opts?.bucketSize != null) params.set("bucketSize", String(opts.bucketSize));
    return fetchJson<{ data: FeeSpreadBucket[]; bucketSize: number }>(
      `/networks/${id}/fees/spread?${params.toString()}`
    );
  },
  getCurrentFees: (id: string) => fetchJson<CurrentFees>(`/networks/${id}/fees/current`),
  getBlockHistory: (id: string, opts?: { from?: number; to?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.from != null) params.set("from", String(opts.from));
    if (opts?.to != null) params.set("to", String(opts.to));
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    return fetchJson<{ data: BlockHistoryPoint[] }>(`/networks/${id}/blocks/history?${params.toString()}`);
  },
  getBlockStats: (id: string, opts?: { from?: number; to?: number }) => {
    const params = new URLSearchParams();
    if (opts?.from != null) params.set("from", String(opts.from));
    if (opts?.to != null) params.set("to", String(opts.to));
    return fetchJson<{ data: BlockStatsData | null }>(`/networks/${id}/blocks/stats?${params.toString()}`);
  },
  getBlockConfig: (id: string) => fetchJson<{ data: BlockConfigData | null }>(`/networks/${id}/blocks/config`),
  getCheckpointHistory: (id: string, opts?: { from?: number; to?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.from != null) params.set("from", String(opts.from));
    if (opts?.to != null) params.set("to", String(opts.to));
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    return fetchJson<{ data: CheckpointHistoryPoint[] }>(`/networks/${id}/checkpoints/history?${params.toString()}`);
  },
  getCheckpointStats: (id: string) => fetchJson<{ data: CheckpointStatsData | null }>(`/networks/${id}/checkpoints/stats`),
};
