import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useNetworkStore } from "../stores/network";
import {
  useNetworkStats,
  useClusterRuns, useClusterDetail, useUmapPoints, useFeePayerStats,
} from "../api/hooks";
import { ScatterPlot3D } from "../components/ScatterPlot3D";
import {
  PageContainer, PageTitle, Grid, StatCard, StatValue, StatLabel,
  Card, Loading,
} from "../components/ui";
import { useAddressResolver } from "../hooks/useAddressResolver";
import { theme } from "../lib/theme";

export function Dashboard() {
  const { selectedNetwork } = useNetworkStore();
  const navigate = useNavigate();
  const resolveAddress = useAddressResolver();

  const { data: stats, isLoading } = useNetworkStats(selectedNetwork);

  const { data: runs } = useClusterRuns(selectedNetwork);
  const latestRun = runs?.[0];
  const runId = latestRun?.id ?? 0;
  const { data: detail } = useClusterDetail(selectedNetwork, runId);
  const { data: umapData } = useUmapPoints(selectedNetwork, runId);
  const { data: feePayerData } = useFeePayerStats(selectedNetwork);

  const pieData = useMemo(() => {
    if (!feePayerData?.feePayers?.length) return [];
    const total = feePayerData.feePayers.reduce((s, f) => s + f.count, 0);
    const threshold = total * 0.02;
    const significant: { name: string; value: number; address: string }[] = [];
    let otherCount = 0;
    for (const fp of feePayerData.feePayers) {
      if (fp.count >= threshold) {
        const resolved = resolveAddress(fp.address);
        const name = resolved !== fp.address ? resolved : `${fp.address.slice(0, 10)}...`;
        significant.push({ name, value: fp.count, address: fp.address });
      } else {
        otherCount += fp.count;
      }
    }
    if (otherCount > 0) {
      significant.push({ name: "Other", value: otherCount, address: "" });
    }
    return significant;
  }, [feePayerData, resolveAddress]);

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
          <StatLabel>Clusters / Outliers</StatLabel>
          <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
            {detail?.run?.numOutliers ?? 0} outlier txs
          </span>
        </StatCard>
        <StatCard style={{ padding: theme.spacing.sm, overflow: "hidden" }}>
          <StatLabel style={{ marginBottom: theme.spacing.xs }}>Fee Payers</StatLabel>
          {pieData.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm }}>
              <div style={{ flexShrink: 0, width: 80, height: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={35}
                      innerRadius={18}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={theme.colors.cluster[i % theme.colors.cluster.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: theme.colors.bgCard, border: `1px solid ${theme.colors.border}`, fontSize: theme.fontSize.xs, color: theme.colors.text }}
                      labelStyle={{ color: theme.colors.text }}
                      itemStyle={{ color: theme.colors.text }}
                      formatter={(value: number) => [value.toLocaleString(), "txs"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ overflow: "hidden", flex: 1 }}>
                {pieData.slice(0, 4).map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.colors.cluster[i % theme.colors.cluster.length], flexShrink: 0 }} />
                    <span style={{ color: theme.colors.textMuted, overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
                  </div>
                ))}
                {pieData.length > 4 && (
                  <div style={{ fontSize: "10px", color: theme.colors.textMuted }}>+{pieData.length - 4} more</div>
                )}
              </div>
            </div>
          ) : (
            <StatValue>—</StatValue>
          )}
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
