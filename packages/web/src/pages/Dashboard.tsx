import { useNavigate } from "react-router-dom";
import { useNetworkStore } from "../stores/network";
import {
  useNetworkStats,
  useClusterRuns, useClusterDetail, useUmapPoints,
} from "../api/hooks";
import { ScatterPlot3D } from "../components/ScatterPlot3D";
import {
  PageContainer, PageTitle, Grid, StatCard, StatValue, StatLabel,
  SectionTitle, Card, Loading,
} from "../components/ui";
import { theme } from "../lib/theme";

export function Dashboard() {
  const { selectedNetwork } = useNetworkStore();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useNetworkStats(selectedNetwork);

  const { data: runs } = useClusterRuns(selectedNetwork);
  const latestRun = runs?.[0];
  const runId = latestRun?.id ?? 0;
  const { data: detail } = useClusterDetail(selectedNetwork, runId);
  const { data: umapData } = useUmapPoints(selectedNetwork, runId);

  if (isLoading) return <Loading />;

  return (
    <PageContainer style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <PageTitle>Dashboard</PageTitle>

      <Grid columns={5}>
        <StatCard>
          <StatValue>{Number(stats?.blockCount ?? 0).toLocaleString()}</StatValue>
          <StatLabel>Blocks</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{Number(stats?.txCount ?? 0).toLocaleString()}</StatValue>
          <StatLabel>Transactions</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{stats?.proposedBlock?.toLocaleString() ?? "—"}</StatValue>
          <StatLabel>Last Block</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{detail?.run?.numClusters ?? "—"}</StatValue>
          <StatLabel>Clusters</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{detail?.run?.numOutliers ?? "—"}</StatValue>
          <StatLabel>Outlier Txs</StatLabel>
        </StatCard>
      </Grid>

      {/* 3D UMAP Projection — fills remaining space */}
      {umapData?.points && umapData.points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginTop: theme.spacing.md }}>
          <p style={{ color: theme.colors.textMuted, marginBottom: theme.spacing.sm, fontSize: theme.fontSize.xs, flexShrink: 0 }}>
            3D visualization of transaction clusters. Each point is a transaction; colors represent clusters.
            Drag to rotate, scroll to zoom, click a point to view the transaction.
          </p>
          <Card style={{ padding: theme.spacing.sm, overflow: "hidden", flex: 1, minHeight: 0 }}>
            <ScatterPlot3D
              points={umapData.points}
              height="100%"
              onClusterClick={(clusterId) => navigate(`/privacy-sets?cluster=${clusterId}`)}
              onOutlierClick={(p) => navigate(`/tx/${p.txHash}`)}
            />
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
