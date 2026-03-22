import { useState, useMemo } from "react";
import styled from "@emotion/styled";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { theme } from "../lib/theme";
import { useNetworkStore } from "../stores/network";
import { useFeeHistory, useFeeSpread, useCurrentFees } from "../api/hooks";
import type { FeeHistoryPoint, FeeSpreadBucket } from "../lib/api";
import {
  PageContainer,
  PageTitle,
  Card,
  Grid,
  StatCard,
  StatValue,
  StatLabel,
  Loading,
} from "../components/ui";

type TimeRange = "100" | "500" | "1000" | "5000" | "all";

const RANGE_LABELS: Record<TimeRange, string> = {
  "100": "100 blocks",
  "500": "500 blocks",
  "1000": "1K blocks",
  "5000": "5K blocks",
  all: "All",
};

function resolutionForRange(range: TimeRange): string {
  switch (range) {
    case "100": return "raw";
    case "500": return "raw";
    case "1000": return "10";
    case "5000": return "50";
    case "all": return "100";
  }
}

function spreadBucketForRange(range: TimeRange): number {
  switch (range) {
    case "100": return 5;
    case "500": return 10;
    case "1000": return 20;
    case "5000": return 50;
    case "all": return 100;
  }
}

/** Parse bigint string to number (raw units — Fee Juice per mana for base fees, raw Fee Juice for tx fees) */
function toNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Format raw Fee Juice amount with compact notation */
function formatFeeJuice(v: number | null): string {
  if (v == null) return "-";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (v >= 1) return v.toFixed(0);
  if (v > 0) return v.toExponential(2);
  return "0";
}

/** Format raw Fee Juice with full precision for stat cards */
function formatFeeJuiceFull(v: number | null): string {
  if (v == null) return "-";
  return v.toLocaleString();
}

/** Convert raw Fee Juice amount to USD via ethPerFeeAsset and ethUsdPrice */
function feeToUsd(rawFeeJuice: number, ethPerFeeAssetE12: string, ethUsdPrice: number): number {
  const ethPerFeeAsset = Number(ethPerFeeAssetE12) / 1e12;
  const feeJuiceInEth = (rawFeeJuice / 1e18) * ethPerFeeAsset;
  return feeJuiceInEth * ethUsdPrice;
}

function formatUsd(v: number): string {
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  if (v >= 0.000001) return `$${v.toFixed(8)}`;
  return `$${v.toExponential(3)}`;
}

export function Fees() {
  const { selectedNetwork } = useNetworkStore();
  const [range, setRange] = useState<TimeRange>("500");

  const resolution = resolutionForRange(range);
  const { data: currentData } = useCurrentFees(selectedNetwork);

  // Compute from/to block range based on latest block
  const latestBlock = currentData?.block?.blockNumber ?? null;
  const rangeBlocks = range === "all" ? null : parseInt(range, 10);
  const fromBlock = latestBlock != null && rangeBlocks != null
    ? Math.max(0, latestBlock - rangeBlocks)
    : undefined;

  const historyOpts = useMemo(
    () => ({ from: fromBlock, resolution }),
    [fromBlock, resolution],
  );

  const spreadOpts = useMemo(
    () => ({
      from: fromBlock,
      bucketSize: spreadBucketForRange(range),
    }),
    [fromBlock, range],
  );

  const { data: historyData, isLoading: historyLoading } = useFeeHistory(selectedNetwork, historyOpts);
  const { data: spreadData, isLoading: spreadLoading } = useFeeSpread(selectedNetwork, spreadOpts);

  // Transform history data for charts — split into fee data and utilization data
  const allHistoryData = useMemo(() => {
    if (!historyData?.data) return [];
    return historyData.data.map((p: FeeHistoryPoint) => ({
      block: p.blockNumber,
      timestamp: p.timestamp,
      daGas: toNum(p.feePerDaGas),
      l2Gas: toNum(p.feePerL2Gas),
      totalFees: toNum(p.totalFees),
      numTxs: p.numTxs,
    }));
  }, [historyData]);

  // Base fee chart: only rows with fee data
  const feeChartData = useMemo(
    () => allHistoryData.filter((d) => d.daGas != null || d.l2Gas != null),
    [allHistoryData],
  );

  // Transform spread data for chart
  const spreadChartData = useMemo(() => {
    if (!spreadData?.data) return [];
    return spreadData.data.map((b: FeeSpreadBucket) => ({
      block: b.bucket,
      txCount: b.txCount,
      avgFee: toNum(b.avgActualFee),
      minFee: toNum(b.minActualFee),
      maxFee: toNum(b.maxActualFee),
      p25: toNum(b.p25ActualFee),
      median: toNum(b.medianActualFee),
      p75: toNum(b.p75ActualFee),
    }));
  }, [spreadData]);

  // Current stats
  const currentDaFee = toNum(currentData?.block?.feePerDaGas);
  const currentL2Fee = toNum(currentData?.block?.feePerL2Gas);
  const ethPrice = currentData?.pricing?.ethUsdPrice ?? null;
  const ethPerFeeAssetE12 = currentData?.pricing?.ethPerFeeAssetE12 ?? null;

  return (
    <FeesContainer>
      <Header>
        <PageTitle>Fee Analytics</PageTitle>
        <RangeSelector>
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
            <RangeButton
              key={r}
              active={range === r}
              onClick={() => setRange(r)}
            >
              {RANGE_LABELS[r]}
            </RangeButton>
          ))}
        </RangeSelector>
      </Header>

      {/* Current stats */}
      <Grid columns={3}>
        <StatCard>
          <StatLabel>Base Fee (DA Mana)</StatLabel>
          <StatValue style={{ color: theme.colors.primary }}>
            {formatFeeJuiceFull(currentDaFee)} <Unit>FJ/mana</Unit>
          </StatValue>
          {ethPrice != null && ethPerFeeAssetE12 != null && currentDaFee != null && (
            <SubStat>
              ~{formatUsd(feeToUsd(currentDaFee, ethPerFeeAssetE12, ethPrice))} / mana
            </SubStat>
          )}
        </StatCard>
        <StatCard>
          <StatLabel>Base Fee (L2 Mana)</StatLabel>
          <StatValue style={{ color: theme.colors.accent }}>
            {formatFeeJuiceFull(currentL2Fee)} <Unit>FJ/mana</Unit>
          </StatValue>
          {ethPrice != null && ethPerFeeAssetE12 != null && currentL2Fee != null && (
            <SubStat>
              ~{formatUsd(feeToUsd(currentL2Fee, ethPerFeeAssetE12, ethPrice))} / mana
            </SubStat>
          )}
        </StatCard>
        <StatCard>
          <StatLabel>ETH / USD</StatLabel>
          <StatValue>
            {ethPrice != null ? `$${ethPrice.toLocaleString()}` : "-"}
          </StatValue>
          {currentData?.block && (
            <SubStat>Block #{currentData.block.blockNumber}</SubStat>
          )}
        </StatCard>
      </Grid>

      {/* Base fee evolution chart */}
      <ChartCard>
        <ChartTitle>Base Fee Evolution</ChartTitle>
        <ChartSubtitle>Fee Juice per mana, per block</ChartSubtitle>
        {historyLoading ? (
          <Loading />
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={feeChartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <defs>
                <linearGradient id="gradDa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.colors.primary} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={theme.colors.primary} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradL2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.colors.accent} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={theme.colors.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
              <XAxis
                dataKey="block"
                stroke={theme.colors.textMuted}
                fontSize={10}
                tickFormatter={(v) => `#${v}`}
              />
              <YAxis
                stroke={theme.colors.textMuted}
                fontSize={10}
                tickFormatter={(v) => formatFeeJuice(v)}
              />
              <Tooltip
                contentStyle={{
                  background: theme.colors.bgCard,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.sm,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                labelFormatter={(v) => `Block #${v}`}
                formatter={(value: number, name: string) => [
                  `${formatFeeJuiceFull(value)} FJ/mana`,
                  name === "daGas" ? "DA Mana" : "L2 Mana",
                ]}
              />
              <Legend
                formatter={(value) => (value === "daGas" ? "DA Mana" : "L2 Mana")}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="daGas"
                stroke={theme.colors.primary}
                fill="url(#gradDa)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="l2Gas"
                stroke={theme.colors.accent}
                fill="url(#gradL2)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Fee spread chart */}
      <ChartCard>
        <ChartTitle>Transaction Fee Spread</ChartTitle>
        <ChartSubtitle>What txs actually paid (Fee Juice). Band shows p25–p75, line shows median.</ChartSubtitle>
        {spreadLoading ? (
          <Loading />
        ) : spreadChartData.length === 0 ? (
          <EmptyState>No transaction fee data available</EmptyState>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={spreadChartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <defs>
                <linearGradient id="gradSpread" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.colors.success} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={theme.colors.success} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
              <XAxis
                dataKey="block"
                stroke={theme.colors.textMuted}
                fontSize={10}
                tickFormatter={(v) => `#${v}`}
              />
              <YAxis
                stroke={theme.colors.textMuted}
                fontSize={10}
                tickFormatter={(v) => formatFeeJuice(v)}
              />
              <Tooltip
                contentStyle={{
                  background: theme.colors.bgCard,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.sm,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                labelFormatter={(v) => `Block #${v}`}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    p25: "P25",
                    median: "Median",
                    p75: "P75",
                    minFee: "Min",
                    maxFee: "Max",
                    avgFee: "Average",
                  };
                  return [`${formatFeeJuiceFull(value)} FJ`, labels[name] ?? name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* Min-max whisker lines */}
              <Line
                type="monotone"
                dataKey="maxFee"
                stroke={theme.colors.textMuted}
                strokeWidth={0.5}
                strokeDasharray="3 3"
                dot={false}
                connectNulls
                name="maxFee"
              />
              <Line
                type="monotone"
                dataKey="minFee"
                stroke={theme.colors.textMuted}
                strokeWidth={0.5}
                strokeDasharray="3 3"
                dot={false}
                connectNulls
                name="minFee"
              />
              {/* P25-P75 band */}
              <Area
                type="monotone"
                dataKey="p75"
                stroke="none"
                fill="url(#gradSpread)"
                connectNulls
                name="p75"
              />
              <Area
                type="monotone"
                dataKey="p25"
                stroke="none"
                fill={theme.colors.bgCard}
                connectNulls
                name="p25"
              />
              {/* Median line */}
              <Line
                type="monotone"
                dataKey="median"
                stroke={theme.colors.success}
                strokeWidth={2}
                dot={false}
                connectNulls
                name="median"
              />
              {/* Average line */}
              <Line
                type="monotone"
                dataKey="avgFee"
                stroke={theme.colors.warning}
                strokeWidth={1}
                strokeDasharray="4 2"
                dot={false}
                connectNulls
                name="avgFee"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Txs per block alongside fees */}
      <ChartCard>
        <ChartTitle>Block Utilization</ChartTitle>
        <ChartSubtitle>Transactions per block and total fees collected (Fee Juice)</ChartSubtitle>
        {historyLoading ? (
          <Loading />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={allHistoryData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
              <XAxis
                dataKey="block"
                stroke={theme.colors.textMuted}
                fontSize={10}
                tickFormatter={(v) => `#${v}`}
              />
              <YAxis
                yAxisId="txs"
                stroke={theme.colors.textMuted}
                fontSize={10}
              />
              <YAxis
                yAxisId="fees"
                hide
              />
              <Tooltip
                contentStyle={{
                  background: theme.colors.bgCard,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.sm,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                labelFormatter={(v) => `Block #${v}`}
                formatter={(value: number, name: string) => {
                  if (name === "numTxs") return [`${value}`, "Txs"];
                  return [`${formatFeeJuice(value)} FJ`, "Total Fees"];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                yAxisId="txs"
                type="monotone"
                dataKey="numTxs"
                stroke={theme.colors.primary}
                fill={theme.colors.primary}
                fillOpacity={0.15}
                strokeWidth={1}
                dot={false}
                connectNulls
                name="numTxs"
              />
              <Line
                yAxisId="fees"
                type="monotone"
                dataKey="totalFees"
                stroke={theme.colors.warning}
                strokeWidth={1.5}
                dot={false}
                connectNulls
                name="totalFees"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </FeesContainer>
  );
}

// ── Styled ──

const FeesContainer = styled(PageContainer)`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const RangeSelector = styled.div`
  display: flex;
  gap: 2px;
  background: ${theme.colors.bgCard};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.md};
  padding: 2px;
`;

const RangeButton = styled.button<{ active: boolean }>`
  padding: 6px 12px;
  background: ${(p) => (p.active ? theme.colors.primary : "transparent")};
  color: ${(p) => (p.active ? "#fff" : theme.colors.textMuted)};
  border: none;
  border-radius: ${theme.radius.sm};
  cursor: pointer;
  font-size: ${theme.fontSize.xs};
  font-family: monospace;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${(p) => (p.active ? theme.colors.primaryHover : theme.colors.bgHover)};
    color: ${theme.colors.text};
  }
`;

const ChartCard = styled(Card)`
  padding: ${theme.spacing.md};
`;

const ChartTitle = styled.h3`
  margin: 0 0 4px;
  font-size: ${theme.fontSize.md};
  font-weight: 600;
  color: ${theme.colors.text};
`;

const ChartSubtitle = styled.p`
  margin: 0 0 ${theme.spacing.md};
  font-size: ${theme.fontSize.xs};
  color: ${theme.colors.textMuted};
`;

const Unit = styled.span`
  font-size: ${theme.fontSize.sm};
  color: ${theme.colors.textMuted};
  font-weight: 400;
`;

const SubStat = styled.div`
  font-size: ${theme.fontSize.xs};
  color: ${theme.colors.textMuted};
  margin-top: 2px;
  font-family: monospace;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.textMuted};
  font-size: ${theme.fontSize.sm};
`;
