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
  lastIndexedBlock: number;
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

export interface Transaction {
  id: number;
  networkId: string;
  blockNumber: number;
  txHash: string;
  txIndex: number;
  revertCode: number;
  transactionFee: string | null;
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPublicDataWrites: number;
  numPrivateLogs: number;
  numPublicLogs: number;
  numContractClassLogs: number;
  privateLogTotalSize: number;
  publicLogTotalSize: number;
  feePayer: string | null;
  expirationTimestamp: number | null;
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
  blockNumber: number;
  numNoteHashes: number;
  numNullifiers: number;
  numPublicDataWrites: number;
  numPrivateLogs: number;
  numPublicLogs: number;
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

export interface ResolvedContract {
  address: string;
  label: string | null;
  contractType: string | null;
  storageSlotIndex: number | string;
}

export interface SlotWrite {
  txId: number;
  txHash: string;
  blockNumber: number;
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
  blockNumber: number;
  numNoteHashes: number;
  numNullifiers: number;
  numPublicDataWrites: number;
  feePayer: string | null;
  outlierScore: number | null;
}

export interface PrivacySet {
  clusterId: number;
  clusterSize: number;
  totalTxsAnalyzed: number;
  outlierScore: number | null;
}

export interface ContractInteraction {
  id: number;
  txId: number;
  contractAddress: string;
  source: "public_log" | "contract_class_log" | "public_data_write";
  label: string | null;
  contractType: string | null;
}

export interface TxDetail {
  tx: Transaction;
  featureVector: number[] | null;
  noteHashes: { id: number; value: string; position: number }[];
  nullifiers: { id: number; value: string; position: number }[];
  publicDataWrites: {
    id: number;
    leafSlot: string;
    value: string;
    position: number;
    resolvedContract: ResolvedContract | null;
  }[];
  contractInteractions: ContractInteraction[];
  clusterMemberships: { runId: number; clusterId: number; membershipScore: number | null; outlierScore: number | null }[];
  privacySet: PrivacySet | null;
  similarTxs: SimilarTx[];
}

export interface ClusterMember {
  txId: number;
  txHash: string;
  membershipScore: number | null;
  outlierScore: number | null;
  blockNumber: number;
  numNoteHashes: number;
  numNullifiers: number;
  numPublicDataWrites: number;
  numPrivateLogs: number;
  numPublicLogs: number;
  numContractClassLogs: number;
  numL2ToL1Msgs: number;
}

// ── API functions ──

export const api = {
  getNetworks: () => fetchJson<Network[]>("/networks"),
  getNetworkStats: (id: string) => fetchJson<NetworkStats>(`/networks/${id}/stats`),
  getBlocks: (id: string, page = 1, limit = 50) =>
    fetchJson<{ data: Block[]; page: number; limit: number }>(`/networks/${id}/blocks?page=${page}&limit=${limit}`),
  getBlock: (id: string, blockNumber: number) =>
    fetchJson<{ block: Block; transactions: Transaction[] }>(`/networks/${id}/blocks/${blockNumber}`),
  getTxs: (id: string, page = 1, limit = 50, contract?: string) =>
    fetchJson<{ data: Transaction[]; page: number; limit: number }>(
      `/networks/${id}/txs?page=${page}&limit=${limit}${contract ? `&contract=${encodeURIComponent(contract)}` : ""}`
    ),
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
};
