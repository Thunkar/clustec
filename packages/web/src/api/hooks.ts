import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export function useNetworks() {
  return useQuery({ queryKey: ["networks"], queryFn: api.getNetworks });
}

export function useNetworkStats(networkId: string) {
  return useQuery({
    queryKey: ["networks", networkId, "stats"],
    queryFn: () => api.getNetworkStats(networkId),
    enabled: !!networkId,
    refetchInterval: 10_000,
  });
}

export function useBlocks(networkId: string, page = 1) {
  return useQuery({
    queryKey: ["networks", networkId, "blocks", page],
    queryFn: () => api.getBlocks(networkId, page),
    enabled: !!networkId,
  });
}

export function useTxs(networkId: string, page = 1, contract?: string) {
  return useQuery({
    queryKey: ["networks", networkId, "txs", page, contract ?? ""],
    queryFn: () => api.getTxs(networkId, page, 50, contract),
    enabled: !!networkId,
  });
}

export function useTxDetail(networkId: string, hash: string) {
  return useQuery({
    queryKey: ["networks", networkId, "txs", hash],
    queryFn: () => api.getTxDetail(networkId, hash),
    enabled: !!networkId && !!hash,
  });
}

export function useClusterRuns(networkId: string) {
  return useQuery({
    queryKey: ["networks", networkId, "clusters"],
    queryFn: () => api.getClusterRuns(networkId),
    enabled: !!networkId,
  });
}

export function useClusterDetail(networkId: string, runId: number) {
  return useQuery({
    queryKey: ["networks", networkId, "clusters", runId],
    queryFn: () => api.getClusterDetail(networkId, runId),
    enabled: !!networkId && runId > 0,
  });
}

export function useUmapPoints(networkId: string, runId: number) {
  return useQuery({
    queryKey: ["networks", networkId, "clusters", runId, "umap"],
    queryFn: () => api.getUmapPoints(networkId, runId),
    enabled: !!networkId && runId > 0,
  });
}

export function useOutliers(networkId: string, runId: number, limit = 50) {
  return useQuery({
    queryKey: ["networks", networkId, "clusters", runId, "outliers", limit],
    queryFn: () => api.getOutliers(networkId, runId, limit),
    enabled: !!networkId && runId > 0,
  });
}

export function useLabels(networkId: string) {
  return useQuery({
    queryKey: ["networks", networkId, "labels"],
    queryFn: () => api.getLabels(networkId),
    enabled: !!networkId,
  });
}

export function useAddLabel(networkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { address: string; label: string; contractType?: string }) =>
      api.addLabel(networkId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks", networkId, "labels"] }),
  });
}

export function useDeleteLabel(networkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: number) => api.deleteLabel(networkId, labelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks", networkId, "labels"] }),
  });
}

export function useClusterMembers(networkId: string, runId: number, clusterId: number | null) {
  return useQuery({
    queryKey: ["networks", networkId, "clusters", runId, "members", clusterId],
    queryFn: () => api.getClusterMembers(networkId, runId, clusterId!),
    enabled: !!networkId && runId > 0 && clusterId !== null,
  });
}

export function useTxGraph(networkId: string, hash: string) {
  return useQuery({
    queryKey: ["networks", networkId, "txs", hash, "graph"],
    queryFn: () => api.getTxGraph(networkId, hash),
    enabled: !!networkId && !!hash,
  });
}


