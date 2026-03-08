import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import styled from "@emotion/styled";
import { useNetworkStore } from "../stores/network";
import { useClusterRuns, useClusterDetail, useClusterMembers, useOutliers } from "../api/hooks";
import { useMyTxs } from "../stores/my-txs";
import type { OutlierEntry, ClusterMember, ClusterSize } from "../lib/api";
import {
  PageContainer, PageTitle, Card, Table, Truncate, Loading, Badge, Flex, Button,
} from "../components/ui";
import { theme } from "../lib/theme";

type MemberSortKey = "outlierScore" | "blockNumber" | "numNoteHashes" | "numNullifiers" | "numPublicDataWrites" | "numPrivateLogs" | "numPublicLogs" | "numContractClassLogs" | "numL2ToL1Msgs";
type OverviewSortKey = "clusterId" | "count" | "avgOutlierScore";
type SortDir = "asc" | "desc";

const SortableHeader = styled.th<{ $active?: boolean }>`
  cursor: pointer;
  user-select: none;
  white-space: nowrap;

  &:hover {
    color: ${theme.colors.text};
  }

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

  &:hover {
    text-decoration: underline;
  }
`;

const PAGE_SIZE = 50;

// ── Cluster Members View ──

function ClusterMembersView({
  clusterId,
  runId,
  networkId,
  totalTxs,
  clusterSize,
  onBack,
}: {
  clusterId: number;
  runId: number;
  networkId: string;
  totalTxs: number;
  clusterSize: number;
  onBack: () => void;
}) {
  const { data, isLoading } = useClusterMembers(networkId, runId, clusterId);
  const { isTracked } = useMyTxs();
  const [sortKey, setSortKey] = useState<MemberSortKey>("outlierScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const handleSort = (key: MemberSortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const sorted = useMemo(() => {
    if (!data?.members) return [];
    return [...data.members].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data?.members, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const sortIndicator = (key: MemberSortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const pct = totalTxs > 0 ? (clusterSize / totalTxs) * 100 : 0;

  if (isLoading) return <Loading />;

  return (
    <>
      <BackButton onClick={onBack}>← Back to all clusters</BackButton>
      <Flex align="center" gap="12px" style={{ marginBottom: theme.spacing.md }}>
        <PageTitle style={{ margin: 0 }}>
          {clusterId === -1 ? "Noise Transactions" : `Cluster ${clusterId}`}
        </PageTitle>
        <Badge color={
          clusterSize === 1 ? theme.colors.danger
            : clusterSize <= 5 ? theme.colors.warning
              : theme.colors.success
        }>
          {clusterSize} txs ({pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`} of network)
        </Badge>
      </Flex>
      <p style={{ color: theme.colors.textMuted, marginBottom: theme.spacing.md, fontSize: theme.fontSize.sm }}>
        {clusterId === -1
          ? "These transactions could not be grouped with any other transaction and are trivially identifiable."
          : `All ${clusterSize} transactions in this privacy set. Higher outlier scores indicate transactions that are more distinguishable within the cluster.`
        }
      </p>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Table>
          <thead>
            <tr>
              <th>#</th>
              <th>Tx Hash</th>
              <SortableHeader $active={sortKey === "outlierScore"} onClick={() => handleSort("outlierScore")}>
                Outlier Score{sortIndicator("outlierScore")}
              </SortableHeader>
              <SortableHeader $active={sortKey === "blockNumber"} onClick={() => handleSort("blockNumber")}>
                Block{sortIndicator("blockNumber")}
              </SortableHeader>
              <SortableHeader $active={sortKey === "numNoteHashes"} onClick={() => handleSort("numNoteHashes")}>
                Note Hashes{sortIndicator("numNoteHashes")}
              </SortableHeader>
              <SortableHeader $active={sortKey === "numNullifiers"} onClick={() => handleSort("numNullifiers")}>
                Nullifiers{sortIndicator("numNullifiers")}
              </SortableHeader>
              <SortableHeader $active={sortKey === "numPublicDataWrites"} onClick={() => handleSort("numPublicDataWrites")}>
                Public Data Writes{sortIndicator("numPublicDataWrites")}
              </SortableHeader>
              <SortableHeader $active={sortKey === "numPrivateLogs"} onClick={() => handleSort("numPrivateLogs")}>
                Private Logs{sortIndicator("numPrivateLogs")}
              </SortableHeader>
              <SortableHeader $active={sortKey === "numPublicLogs"} onClick={() => handleSort("numPublicLogs")}>
                Public Logs{sortIndicator("numPublicLogs")}
              </SortableHeader>
              <SortableHeader $active={sortKey === "numContractClassLogs"} onClick={() => handleSort("numContractClassLogs")}>
                Class Logs{sortIndicator("numContractClassLogs")}
              </SortableHeader>
              <SortableHeader $active={sortKey === "numL2ToL1Msgs"} onClick={() => handleSort("numL2ToL1Msgs")}>
                L2→L1 Msgs{sortIndicator("numL2ToL1Msgs")}
              </SortableHeader>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((m, i) => (
              <tr key={m.txId}>
                <td>{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td>
                  <Link to={`/tx/${m.txHash}`} style={{ color: theme.colors.primary, textDecoration: "none" }}>
                    <Truncate>{m.txHash}</Truncate>
                  </Link>
                </td>
                <td>
                  {m.outlierScore != null ? (
                    <Badge color={
                      m.outlierScore > 0.5 ? theme.colors.danger
                        : m.outlierScore > 0.2 ? theme.colors.warning
                          : theme.colors.success
                    }>
                      {(m.outlierScore * 100).toFixed(1)}%
                    </Badge>
                  ) : (
                    <span style={{ color: theme.colors.textMuted }}>—</span>
                  )}
                </td>
                <td>{m.blockNumber.toLocaleString()}</td>
                <td>{m.numNoteHashes}</td>
                <td>{m.numNullifiers}</td>
                <td>{m.numPublicDataWrites}</td>
                <td>{m.numPrivateLogs}</td>
                <td>{m.numPublicLogs}</td>
                <td>{m.numContractClassLogs}</td>
                <td>{m.numL2ToL1Msgs}</td>
                <td>
                  {isTracked(m.txHash) && <Badge color={theme.colors.warning}>Mine</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
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
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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
        m.set(c.clusterId, c.clusterId === -1 ? 1 : Number(c.count));
      }
    }
    return m;
  }, [detail?.clusterSizes]);

  const sorted = useMemo(() => {
    if (!detail?.clusterSizes) return [];
    return [...detail.clusterSizes].sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "clusterId":
          av = a.clusterId; bv = b.clusterId; break;
        case "count":
          av = a.clusterId === -1 ? 1 : Number(a.count);
          bv = b.clusterId === -1 ? 1 : Number(b.count); break;
        case "avgOutlierScore":
          av = a.clusterId === -1 ? -1 : (a.avgOutlierScore ?? 0);
          bv = b.clusterId === -1 ? -1 : (b.avgOutlierScore ?? 0); break;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [detail?.clusterSizes, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / 20);
  const paged = sorted.slice((page - 1) * 20, page * 20);
  const sortIndicator = (key: OverviewSortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (isLoading) return <Loading />;

  // Drill-down into a specific cluster
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
                  const size = c.clusterId === -1 ? 1 : Number(c.count);
                  const pct = totalTxs > 0 ? (size / totalTxs) * 100 : 0;
                  return (
                    <tr
                      key={c.clusterId}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSearchParams({ cluster: String(c.clusterId) })}
                    >
                      <td>
                        {c.clusterId === -1 ? (
                          <Badge color={theme.colors.outlier}>Noise ({c.count} txs)</Badge>
                        ) : (
                          <Badge color={theme.colors.cluster[c.clusterId % theme.colors.cluster.length]}>
                            Cluster {c.clusterId}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Badge color={
                          size === 1 ? theme.colors.danger
                            : size <= 5 ? theme.colors.warning
                              : theme.colors.success
                        }>
                          {size === 1 && c.clusterId === -1 ? `1 each (${c.count} txs)` : size.toLocaleString()}
                        </Badge>
                      </td>
                      <td style={{ color: pct < 1 ? theme.colors.danger : theme.colors.textMuted }}>
                        {pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`}
                      </td>
                      <td>
                        {c.clusterId === -1 ? (
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
                          size === 1 ? theme.colors.danger
                            : size <= 3 ? theme.colors.warning
                              : theme.colors.success
                        }>
                          {size === 1 ? "Critical" : size <= 3 ? "High" : size <= 10 ? "Medium" : "Low"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
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
