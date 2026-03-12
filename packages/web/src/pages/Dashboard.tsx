import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useNetworkStore } from "../stores/network";
import {
  useNetworkStats,
  useClusterRuns,
  useClusterDetail,
  useUmapPoints,
  useFeePayerStats,
} from "../api/hooks";
import { ScatterPlot3D } from "../components/ScatterPlot3D";
import {
  PageContainer,
  PageTitle,
  Grid,
  StatCard,
  StatValue,
  StatLabel,
  Card,
  Loading,
} from "../components/ui";
import { useLabelResolver } from "../hooks/useAddressResolver";
import { theme } from "../lib/theme";
import styled from "@emotion/styled";

const TopRow = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: stretch;
  flex-shrink: 0;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const PieCard = styled(Card)`
  padding: ${theme.spacing.md};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-shrink: 0;

  @media (max-width: 768px) {
    justify-content: center;
    padding: ${theme.spacing.sm};
    gap: ${theme.spacing.sm};
  }
`;

const Legend = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const DashboardContainer = styled(PageContainer)`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;

  @media (max-width: 768px) {
    height: auto;
    overflow: auto;
  }
`;

const PlotSection = styled.div`
  margin-top: ${theme.spacing.md};
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  @media (max-width: 768px) {
    margin-top: ${theme.spacing.sm};
  }
`;

const PlotCaption = styled.p`
  color: ${theme.colors.textMuted};
  margin-bottom: ${theme.spacing.sm};
  font-size: ${theme.fontSize.xs};

  @media (max-width: 768px) {
    display: none;
  }
`;

const PieChartBox = styled.div`
  flex-shrink: 0;
  width: 150px;
  height: 150px;

  @media (max-width: 768px) {
    width: 90px;
    height: 90px;
  }
`;

const MobileTitle = styled(PageTitle)`
  @media (max-width: 768px) {
    font-size: ${theme.fontSize.lg};
    margin-bottom: ${theme.spacing.sm};
  }
`;

export function Dashboard() {
  const { selectedNetwork } = useNetworkStore();
  const navigate = useNavigate();
  const resolveLabel = useLabelResolver();

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
        const label = resolveLabel(fp.address);
        const name = label ?? `${fp.address.slice(0, 10)}...`;
        significant.push({ name, value: fp.count, address: fp.address });
      } else {
        otherCount += fp.count;
      }
    }
    if (otherCount > 0) {
      significant.push({ name: "Other", value: otherCount, address: "" });
    }
    return significant;
  }, [feePayerData, resolveLabel]);

  if (isLoading) return <Loading />;

  return (
    <DashboardContainer>
      <MobileTitle>Dashboard</MobileTitle>

      <TopRow>
        <Grid columns={2} style={{ flex: 1 }}>
          <StatCard>
            <StatValue>
              {Number(stats?.blockCount ?? 0).toLocaleString()}
            </StatValue>
            <StatLabel>Blocks</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>
              {Number(stats?.txCount ?? 0).toLocaleString()}
            </StatValue>
            <StatLabel>Transactions</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>
              {stats?.proposedBlock?.toLocaleString() ?? "—"}
            </StatValue>
            <StatLabel>Last Block</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>{detail?.run?.numClusters ?? "—"}</StatValue>
            <StatLabel>Clusters</StatLabel>
            <span
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
              }}
            >
              {detail?.run?.numOutliers ?? 0} outlier txs
            </span>
          </StatCard>
        </Grid>

        {pieData.length > 0 && (
          <PieCard>
            <PieChartBox>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="90%"
                    innerRadius="45%"
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          theme.colors.cluster[i % theme.colors.cluster.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: theme.colors.bgCard,
                      border: `1px solid ${theme.colors.border}`,
                      fontSize: theme.fontSize.xs,
                      color: theme.colors.text,
                    }}
                    labelStyle={{ color: theme.colors.text }}
                    itemStyle={{ color: theme.colors.text }}
                    formatter={(value: number) => [
                      value.toLocaleString(),
                      "txs",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </PieChartBox>
            <Legend>
              <StatLabel style={{ marginBottom: theme.spacing.xs }}>
                Fee Payers
              </StatLabel>
              {pieData.map((d, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: theme.fontSize.sm,
                    lineHeight: "20px",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background:
                        theme.colors.cluster[i % theme.colors.cluster.length],
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      color: theme.colors.textMuted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.name}
                  </span>
                  <span
                    style={{
                      color: theme.colors.text,
                      flexShrink: 0,
                      marginLeft: "auto",
                    }}
                  >
                    {d.value}
                  </span>
                </div>
              ))}
            </Legend>
          </PieCard>
        )}
      </TopRow>

      {/* 3D UMAP Projection */}
      {umapData?.points && umapData.points.length > 0 && (
        <PlotSection>
          <PlotCaption>
            3D cluster visualization. Drag to rotate, scroll to zoom, click a
            point to view.
          </PlotCaption>
          <Card
            style={{
              padding: theme.spacing.sm,
              overflow: "hidden",
              flex: 1,
              minHeight: 400,
            }}
          >
            <ScatterPlot3D
              points={umapData.points}
              height="100%"
              onClusterClick={(clusterId) =>
                navigate(`/privacy-sets?cluster=${clusterId}`)
              }
              onOutlierClick={(p) => navigate(`/tx/${p.txHash}`)}
            />
          </Card>
        </PlotSection>
      )}
    </DashboardContainer>
  );
}
