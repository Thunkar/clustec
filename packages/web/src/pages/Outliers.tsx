import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import styled from "@emotion/styled";
import { useNetworkStore } from "../stores/network";
import { useClusterRuns, useClusterDetail, useClusterMembers, useOutliers } from "../api/hooks";
import { useMyTxs } from "../stores/my-txs";
import { useAddressResolver } from "../hooks/useAddressResolver";
import type { ClusterMember, ClusterSize } from "../lib/api";
import {
  PageContainer, PageTitle, Card, Table, TableWrapper, Loading, Badge, Flex, Button,
} from "../components/ui";
import { TxTable, type TxSortKey, type SortDir } from "../components/TxTable";
import { theme } from "../lib/theme";

type OverviewSortKey = "clusterId" | "count" | "avgOutlierScore";

const SortableHeader = styled.th<{ $active?: boolean }>`
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  &:hover { color: ${theme.colors.text}; }
  ${(p) => p.$active && `color: ${theme.colors.primary};`}
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.primary};
  cursor: pointer;
  font-size: ${theme.fontSize.sm};
  padding: 0;
  margin-bottom: ${theme.spacing.md};
  &:hover { text-decoration: underline; }
`;

const PAGE_SIZE = 50;

// ── Cluster Members View ──

function ClusterMembersView({
  clusterId, runId, networkId, totalTxs, clusterSize, onBack,
}: {
  clusterId: number; runId: number; networkId: string;
  totalTxs: number; clusterSize: number; onBack: () => void;
}) {
  const { data, isLoading } = useClusterMembers(networkId, runId, clusterId);
  const resolveAddress = useAddressResolver();
  const [sortKey, setSortKey] = useState<TxSortKey>("outlierScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const handleSort = (key: TxSortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const sorted = useMemo(() => {
    if (!data?.members) return [];
    return [...data.members].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      const bv = (b as unknown as Record<string, unknown>)[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data?.members, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pct = totalTxs > 0 ? (clusterSize / totalTxs) * 100 : 0;

  if (isLoading) return <Loading />;

  return (
    <>
      <BackButton onClick={onBack}>← Back to all clusters</BackButton>
      <Flex align="center" gap="12px" style={{ marginBottom: theme.spacing.md }}>
        <PageTitle style={{ margin: 0 }}>
          {clusterId === -1 ? "Outlier Transactions" : `Cluster ${clusterId}`}
        </PageTitle>
        <Badge color={
          clusterSize === 1 ? theme.colors.danger
            : clusterSize <= 5 ? theme.colors.warning
              : theme.colors.success
        }>
          {clusterSize.toLocaleString()} txs ({pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`} of network)
        </Badge>
      </Flex>
      <p style={{ color: theme.colors.textMuted, marginBottom: theme.spacing.md, fontSize: theme.fontSize.sm }}>
        {clusterId === -1
          ? "These transactions could not be grouped with any other transaction and are trivially identifiable."
          : `All ${clusterSize} transactions in this privacy set. Higher outlier scores indicate transactions that are more distinguishable within the cluster.`
        }
      </p>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <TxTable
          rows={paged}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          resolveAddress={resolveAddress}
          showOutlierScore
          showIndex
          pageOffset={(page - 1) * PAGE_SIZE}
        />
      </Card>
      {totalPages > 1 && (
        <Flex justify="center" gap="12px" style={{ marginTop: theme.spacing.md }}>
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
            Page {page} of {totalPages}
          </span>
          <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </Flex>
      )}
    </>
  );
}

// ── Clusters Overview ──

export function Outliers() {
  const { selectedNetwork } = useNetworkStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: runs } = useClusterRuns(selectedNetwork);
  const latestRunId = runs?.[0]?.id ?? 0;
  const { data: detail, isLoading } = useClusterDetail(selectedNetwork, latestRunId);
  const { data: outlierData } = useOutliers(selectedNetwork, latestRunId, 10000);

  const selectedCluster = searchParams.has("cluster")
    ? parseInt(searchParams.get("cluster")!, 10)
    : null;

  const [sortKey, setSortKey] = useState<OverviewSortKey>("count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const handleSort = (key: OverviewSortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "count" ? "asc" : "desc"); }
    setPage(1);
  };

  const totalTxs = outlierData?.totalTxsAnalyzed ?? 0;
  const clusterSizeMap = useMemo(() => {
    const m = new Map<number, number>();
    if (detail?.clusterSizes) {
      for (const c of detail.clusterSizes) {
        m.set(c.clusterId, Number(c.count));
      }
    }
    return m;
  }, [detail?.clusterSizes]);

  const sorted = useMemo(() => {
    if (!detail?.clusterSizes) return [];
    return [...detail.clusterSizes].sort((a, b) => {
      if (a.clusterId === -1 && b.clusterId !== -1) return -1;
      if (b.clusterId === -1 && a.clusterId !== -1) return 1;
      let av: number, bv: number;
      switch (sortKey) {
        case "clusterId": av = a.clusterId; bv = b.clusterId; break;
        case "count": av = Number(a.count); bv = Number(b.count); break;
        case "avgOutlierScore": av = a.avgOutlierScore ?? 0; bv = b.avgOutlierScore ?? 0; break;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [detail?.clusterSizes, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / 20);
  const paged = sorted.slice((page - 1) * 20, page * 20);
  const sortIndicator = (key: OverviewSortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (isLoading) return <Loading />;

  if (selectedCluster !== null) {
    const clusterSize = clusterSizeMap.get(selectedCluster) ?? 0;
    return (
      <PageContainer>
        <ClusterMembersView
          clusterId={selectedCluster}
          runId={latestRunId}
          networkId={selectedNetwork}
          totalTxs={totalTxs}
          clusterSize={clusterSize}
          onBack={() => setSearchParams({})}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageTitle>Privacy Sets</PageTitle>
      <p style={{ color: theme.colors.textMuted, marginBottom: theme.spacing.lg, fontSize: theme.fontSize.sm }}>
        Each cluster represents a privacy set — a group of transactions that look similar to each other.
        Larger clusters provide better privacy. Click a cluster to see its member transactions.
      </p>

      {!detail?.clusterSizes?.length ? (
        <Card>
          <p style={{ color: theme.colors.textMuted }}>No analysis data yet. Analysis runs automatically every 10 minutes.</p>
        </Card>
      ) : (
        <>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <SortableHeader $active={sortKey === "clusterId"} onClick={() => handleSort("clusterId")}>
                    Cluster{sortIndicator("clusterId")}
                  </SortableHeader>
                  <SortableHeader $active={sortKey === "count"} onClick={() => handleSort("count")}>
                    Privacy Set Size{sortIndicator("count")}
                  </SortableHeader>
                  <th>% of Network</th>
                  <SortableHeader $active={sortKey === "avgOutlierScore"} onClick={() => handleSort("avgOutlierScore")}>
                    Outlier Score (avg / max){sortIndicator("avgOutlierScore")}
                  </SortableHeader>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => {
                  const size = Number(c.count);
                  const isOutlier = c.clusterId === -1;
                  const pct = totalTxs > 0 ? (size / totalTxs) * 100 : 0;
                  return (
                    <tr
                      key={c.clusterId}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSearchParams({ cluster: String(c.clusterId) })}
                    >
                      <td>
                        {isOutlier ? (
                          <Badge color={theme.colors.outlier}>Outliers ({size.toLocaleString()} txs)</Badge>
                        ) : (
                          <Badge color={theme.colors.cluster[c.clusterId % theme.colors.cluster.length]}>
                            Cluster {c.clusterId}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Badge color={
                          isOutlier ? theme.colors.danger
                            : size <= 5 ? theme.colors.warning
                              : theme.colors.success
                        }>
                          {isOutlier ? `1 each (${size.toLocaleString()} txs)` : size.toLocaleString()}
                        </Badge>
                      </td>
                      <td style={{ color: pct < 1 ? theme.colors.danger : theme.colors.textMuted }}>
                        {pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`}
                      </td>
                      <td>
                        {isOutlier ? (
                          <span style={{ color: theme.colors.textMuted }}>—</span>
                        ) : (
                          <span>
                            {c.avgOutlierScore != null ? `${(c.avgOutlierScore * 100).toFixed(1)}%` : "0%"}
                            {" / "}
                            <span style={{ color: (c.maxOutlierScore ?? 0) > 0.3 ? theme.colors.warning : theme.colors.textMuted }}>
                              {c.maxOutlierScore != null ? `${(c.maxOutlierScore * 100).toFixed(1)}%` : "0%"}
                            </span>
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge color={
                          isOutlier || size === 1 ? theme.colors.danger
                            : size <= 3 ? theme.colors.warning
                              : theme.colors.success
                        }>
                          {isOutlier || size === 1 ? "Critical" : size <= 3 ? "High" : size <= 10 ? "Medium" : "Low"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            </TableWrapper>
          </Card>
          {totalPages > 1 && (
            <Flex justify="center" gap="12px" style={{ marginTop: theme.spacing.md }}>
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
                Page {page} of {totalPages}
              </span>
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </Flex>
          )}
        </>
      )}
    </PageContainer>
  );
}
