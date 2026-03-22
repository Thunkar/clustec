import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  ReferenceArea,
  Bar,
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
  const queryClient = useQueryClient();
  const [range, setRange] = useState<TimeRange>("500");

  // Zoom state: drag-select on any chart to zoom all three
  const [zoomFrom, setZoomFrom] = useState<number | null>(null);
  const [zoomTo, setZoomTo] = useState<number | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null); // drag start block
  const [selectEnd, setSelectEnd] = useState<number | null>(null); // drag current block

  const handleMouseDown = useCallback((e: { activeLabel?: string }) => {
    if (e?.activeLabel) setSelecting(Number(e.activeLabel));
  }, []);
  const handleMouseMove = useCallback((e: { activeLabel?: string }) => {
    if (selecting != null && e?.activeLabel) setSelectEnd(Number(e.activeLabel));
  }, [selecting]);
  const handleMouseUp = useCallback(() => {
    if (selecting != null && selectEnd != null && selecting !== selectEnd) {
      const lo = Math.min(selecting, selectEnd);
      const hi = Math.max(selecting, selectEnd);
      setZoomFrom(lo);
      setZoomTo(hi);
    }
    setSelecting(null);
    setSelectEnd(null);
  }, [selecting, selectEnd]);
  const resetZoom = useCallback(() => {
    setZoomFrom(null);
    setZoomTo(null);
  }, []);
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["networks", selectedNetwork, "fees"] });
  }, [queryClient, selectedNetwork]);

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

  const rangeReady = range === "all" || fromBlock != null;
  const { data: historyData, isLoading: historyLoading } = useFeeHistory(
    rangeReady ? selectedNetwork : "",
    historyOpts,
  );
  const { data: spreadData, isLoading: spreadLoading } = useFeeSpread(
    rangeReady ? selectedNetwork : "",
    spreadOpts,
  );

  // Build padded chart data covering the full selected range
  const { priceChartData, costChartData } = useMemo(() => {
    const start = fromBlock ?? 0;
    const end = latestBlock ?? start;
    const spreadBucket = spreadBucketForRange(range);

    // Index history data by block number (coerce to number — SQL may return strings)
    const historyByBlock = new Map<number, FeeHistoryPoint>();
    for (const p of historyData?.data ?? []) {
      historyByBlock.set(Number(p.blockNumber), p);
    }

    // Index spread data by bucket
    const spreadByBucket = new Map<number, FeeSpreadBucket>();
    for (const b of spreadData?.data ?? []) {
      spreadByBucket.set(Number(b.bucket), b);
    }

    // Chart 1: Fee Per Mana — base fee + tx bid spread, per spread bucket
    // We merge block base fees (averaged over the bucket) with tx bid percentiles
    const priceRows: {
      block: number;
      baseDa: number | null;
      baseL2: number | null;
      medianBidL2: number | null;
      p25BidL2: number | null;
      p75BidL2: number | null;
      medianBidDa: number | null;
      medianManaL2: number | null;
      medianManaDa: number | null;
    }[] = [];

    // Chart 2: Total Fee Paid + utilization
    const costRows: {
      block: number;
      medianFee: number | null;
      p25Fee: number | null;
      p75Fee: number | null;
      minFee: number | null;
      maxFee: number | null;
      txCount: number;
    }[] = [];

    const startSpread = Math.floor(start / spreadBucket) * spreadBucket;
    for (let b = startSpread; b <= end; b += spreadBucket) {
      const s = spreadByBucket.get(b);

      // Average block base fees within this bucket window
      let sumDa = 0, sumL2 = 0, countFee = 0;
      for (let blk = b; blk < b + spreadBucket && blk <= end; blk++) {
        const h = historyByBlock.get(blk);
        if (h?.feePerDaGas != null && h?.feePerL2Gas != null) {
          sumDa += Number(h.feePerDaGas);
          sumL2 += Number(h.feePerL2Gas);
          countFee++;
        }
      }

      priceRows.push({
        block: b,
        baseDa: countFee > 0 ? sumDa / countFee : null,
        baseL2: countFee > 0 ? sumL2 / countFee : null,
        medianBidL2: s ? toNum(s.medianMaxFeePerL2Gas) : null,
        p25BidL2: s ? toNum(s.p25MaxFeePerL2Gas) : null,
        p75BidL2: s ? toNum(s.p75MaxFeePerL2Gas) : null,
        medianBidDa: s ? toNum(s.medianMaxFeePerDaGas) : null,
        medianManaL2: s ? toNum(s.medianGasLimitL2) : null,
        medianManaDa: s ? toNum(s.medianGasLimitDa) : null,
      });

      // Aggregate tx count from history blocks in this bucket
      let txs = 0;
      for (let blk = b; blk < b + spreadBucket && blk <= end; blk++) {
        const h = historyByBlock.get(blk);
        if (h) txs += h.numTxs ?? 0;
      }

      costRows.push({
        block: b,
        medianFee: s ? toNum(s.medianActualFee) : null,
        p25Fee: s ? toNum(s.p25ActualFee) : null,
        p75Fee: s ? toNum(s.p75ActualFee) : null,
        minFee: s ? toNum(s.minActualFee) : null,
        maxFee: s ? toNum(s.maxActualFee) : null,
        txCount: s ? Number(s.txCount) : txs,
      });
    }

    // Apply zoom filter
    const inZoom = (block: number) =>
      (zoomFrom == null || block >= zoomFrom) && (zoomTo == null || block <= zoomTo);

    return {
      priceChartData: priceRows.filter((r) => inZoom(r.block)),
      costChartData: costRows.filter((r) => inZoom(r.block)),
    };
  }, [historyData, spreadData, fromBlock, latestBlock, range, zoomFrom, zoomTo]);

  // Shared drag-to-zoom props for all ComposedCharts
  const zoomProps = {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
  };

  // Selection overlay element (rendered inside each chart when dragging)
  const selectionOverlay = selecting != null && selectEnd != null ? (
    <ReferenceArea
      x1={Math.min(selecting, selectEnd)}
      x2={Math.max(selecting, selectEnd)}
      fill={theme.colors.primary}
      fillOpacity={0.15}
      stroke={theme.colors.primary}
      strokeOpacity={0.4}
    />
  ) : null;

  const isZoomed = zoomFrom != null || zoomTo != null;

  // Current stats
  const currentDaFee = toNum(currentData?.block?.feePerDaGas);
  const currentL2Fee = toNum(currentData?.block?.feePerL2Gas);
  const ethPrice = currentData?.pricing?.ethUsdPrice ?? null;
  const ethPerFeeAssetE12 = currentData?.pricing?.ethPerFeeAssetE12 ?? null;

  return (
    <FeesContainer>
      <Header>
        <PageTitle>Fee Analytics</PageTitle>
        <HeaderControls>
        <RefreshButton onClick={refresh} title="Refresh data">↻</RefreshButton>
        {isZoomed && (
          <ResetZoomButton onClick={resetZoom}>Reset Zoom</ResetZoomButton>
        )}
        <RangeSelector>
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
            <RangeButton
              key={r}
              active={range === r}
              onClick={() => { setRange(r); resetZoom(); }}
            >
              {RANGE_LABELS[r]}
            </RangeButton>
          ))}
        </RangeSelector>
        </HeaderControls>
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

      {/* Chart 1: Fee Per Mana — base fee vs tx bids */}
      <ChartCard>
        <ChartTitle>Fee Per Mana</ChartTitle>
        <ChartSubtitle>Block base fee vs what txs bid (Fee Juice per mana). Band = p25–p75 of L2 bids. Dashed = mana limits.</ChartSubtitle>
        {(historyLoading || spreadLoading || !rangeReady) ? (
          <Loading />
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={priceChartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }} {...zoomProps}>
              <defs>
                <linearGradient id="gradBidL2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.colors.accent} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={theme.colors.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
              <XAxis dataKey="block" stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `#${v}`} />
              <YAxis yAxisId="fee" stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => formatFeeJuice(v)} />
              <YAxis yAxisId="mana" orientation="right" stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => formatFeeJuice(v)} />
              <Tooltip
                contentStyle={{ background: theme.colors.bgCard, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: 11, fontFamily: "monospace" }}
                labelFormatter={(v) => `Block #${v}`}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    baseL2: "Base Fee (L2)",
                    baseDa: "Base Fee (DA)",
                    medianBidL2: "Median Bid (L2)",
                    p25BidL2: "P25 Bid (L2)",
                    p75BidL2: "P75 Bid (L2)",
                    medianBidDa: "Median Bid (DA)",
                    medianManaL2: "Median L2 Mana Limit",
                    medianManaDa: "Median DA Mana Limit",
                  };
                  const isMana = name === "medianManaL2" || name === "medianManaDa";
                  return [`${formatFeeJuiceFull(value)}${isMana ? "" : " FJ/mana"}`, labels[name] ?? name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => {
                const m: Record<string, string> = {
                  baseL2: "L2 Base Fee", baseDa: "DA Base Fee",
                  medianBidL2: "Median L2 Bid", p75BidL2: "P75 L2 Bid", p25BidL2: "P25 L2 Bid",
                  medianBidDa: "Median DA Bid",
                  medianManaL2: "L2 Mana Limit", medianManaDa: "DA Mana Limit",
                };
                return m[v] ?? v;
              }} />
              {/* L2 bid spread band (p25-p75) */}
              <Area yAxisId="fee" type="monotone" dataKey="p75BidL2" stroke="none" fill="url(#gradBidL2)" connectNulls name="p75BidL2" />
              <Area yAxisId="fee" type="monotone" dataKey="p25BidL2" stroke="none" fill={theme.colors.bgCard} connectNulls name="p25BidL2" />
              {/* Base fees */}
              <Line yAxisId="fee" type="monotone" dataKey="baseL2" stroke={theme.colors.accent} strokeWidth={2} dot={false} connectNulls name="baseL2" />
              <Line yAxisId="fee" type="monotone" dataKey="baseDa" stroke={theme.colors.primary} strokeWidth={2} dot={false} connectNulls name="baseDa" />
              {/* Median bids */}
              <Line yAxisId="fee" type="monotone" dataKey="medianBidL2" stroke={theme.colors.accent} strokeWidth={1} strokeDasharray="6 3" dot={false} connectNulls name="medianBidL2" />
              <Line yAxisId="fee" type="monotone" dataKey="medianBidDa" stroke={theme.colors.primary} strokeWidth={1} strokeDasharray="6 3" dot={false} connectNulls name="medianBidDa" />
              {/* Mana limits on right axis */}
              <Line yAxisId="mana" type="monotone" dataKey="medianManaL2" stroke={theme.colors.success} strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls name="medianManaL2" />
              <Line yAxisId="mana" type="monotone" dataKey="medianManaDa" stroke={theme.colors.warning} strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls name="medianManaDa" />
              {selectionOverlay}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Chart 2: Total Fee Paid + utilization */}
      <ChartCard>
        <ChartTitle>Total Fee Paid</ChartTitle>
        <ChartSubtitle>Actual tx fee distribution (Fee Juice). Band = p25–p75, line = median. Bar = txs per bucket.</ChartSubtitle>
        {(historyLoading || spreadLoading || !rangeReady) ? (
          <Loading />
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={costChartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }} {...zoomProps}>
              <defs>
                <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.colors.success} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={theme.colors.success} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
              <XAxis dataKey="block" stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `#${v}`} />
              <YAxis yAxisId="fee" stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => formatFeeJuice(v)} />
              <YAxis yAxisId="txs" orientation="right" stroke={theme.colors.textMuted} fontSize={10} />
              <Tooltip
                contentStyle={{ background: theme.colors.bgCard, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: 11, fontFamily: "monospace" }}
                labelFormatter={(v) => `Block #${v}`}
                formatter={(value: number, name: string) => {
                  if (name === "txCount") return [`${value}`, "Txs"];
                  const labels: Record<string, string> = { medianFee: "Median", p25Fee: "P25", p75Fee: "P75", minFee: "Min", maxFee: "Max" };
                  return [`${formatFeeJuiceFull(value)} FJ`, labels[name] ?? name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => {
                const m: Record<string, string> = { medianFee: "Median Fee", p25Fee: "P25", p75Fee: "P75", minFee: "Min", maxFee: "Max", txCount: "Tx Count" };
                return m[v] ?? v;
              }} />
              {/* Tx count as subtle area on right axis */}
              <Bar yAxisId="txs" dataKey="txCount" fill={theme.colors.primary} fillOpacity={0.2} stroke={theme.colors.primary} strokeOpacity={0.4} strokeWidth={0.5} name="txCount" />
              {/* Min-max whiskers */}
              <Line yAxisId="fee" type="monotone" dataKey="maxFee" stroke={theme.colors.warning} strokeWidth={0.8} strokeDasharray="3 3" dot={false} connectNulls name="maxFee" />
              <Line yAxisId="fee" type="monotone" dataKey="minFee" stroke={theme.colors.accent} strokeWidth={0.8} strokeDasharray="3 3" dot={false} connectNulls name="minFee" />
              {/* P25-P75 band */}
              <Area yAxisId="fee" type="monotone" dataKey="p75Fee" stroke="none" fill="url(#gradCost)" connectNulls name="p75Fee" />
              <Area yAxisId="fee" type="monotone" dataKey="p25Fee" stroke="none" fill={theme.colors.bgCard} connectNulls name="p25Fee" />
              {/* Median line */}
              <Line yAxisId="fee" type="monotone" dataKey="medianFee" stroke={theme.colors.success} strokeWidth={2} dot={false} connectNulls name="medianFee" />
              {selectionOverlay}
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

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const RefreshButton = styled.button`
  padding: 4px 10px;
  background: ${theme.colors.bgCard};
  color: ${theme.colors.textMuted};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.sm};
  cursor: pointer;
  font-size: ${theme.fontSize.md};
  line-height: 1;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: ${theme.colors.text};
    background: ${theme.colors.bgHover};
  }
`;

const ResetZoomButton = styled.button`
  padding: 6px 12px;
  background: ${theme.colors.bgHover};
  color: ${theme.colors.warning};
  border: 1px solid ${theme.colors.warning}44;
  border-radius: ${theme.radius.sm};
  cursor: pointer;
  font-size: ${theme.fontSize.xs};
  font-family: monospace;
  transition: background 0.15s;

  &:hover {
    background: ${theme.colors.warning}22;
  }
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

