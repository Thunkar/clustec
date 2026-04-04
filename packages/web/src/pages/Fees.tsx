import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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

import { formatFJ, formatFJCompact, formatPerManaCompact, formatFJPerMana } from "../lib/format";

function toNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
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
  const [searchParams, setSearchParams] = useSearchParams();

  const urlFrom = searchParams.get("from") ? parseInt(searchParams.get("from")!, 10) : null;
  const urlTo = searchParams.get("to") ? parseInt(searchParams.get("to")!, 10) : null;

  const [range, setRange] = useState<TimeRange>(() => {
    if (urlFrom != null && urlTo != null) {
      const diff = urlTo - urlFrom;
      if (diff <= 100) return "100";
      if (diff <= 500) return "500";
      if (diff <= 1000) return "1000";
      if (diff <= 5000) return "5000";
      return "all";
    }
    return "100";
  });

  // Zoom state: drag-select on any chart to zoom all three
  const [zoomFrom, setZoomFrom] = useState<number | null>(urlFrom);
  const [zoomTo, setZoomTo] = useState<number | null>(urlTo);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [selectEnd, setSelectEnd] = useState<number | null>(null);

  // Refs to avoid stale closures in recharts callbacks
  const selectingRef = useRef<number | null>(null);
  const selectEndRef = useRef<number | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ChartMouseEvent = any;
  const getBlock = (e: ChartMouseEvent): number | null => {
    if (!e) return null;
    if (e.activeLabel !== undefined && e.activeLabel !== null) return Number(e.activeLabel);
    const block = e.activePayload?.[0]?.payload?.block;
    if (block != null) return Number(block);
    return null;
  };
  const handleMouseDown = useCallback((e: ChartMouseEvent) => {
    const block = getBlock(e);
    if (block != null && !isNaN(block)) {
      selectingRef.current = block;
      selectEndRef.current = null;
      setSelecting(block);
      setSelectEnd(null);
    }
  }, []);
  const handleMouseMove = useCallback((e: ChartMouseEvent) => {
    if (selectingRef.current == null) return;
    const block = getBlock(e);
    if (block != null && !isNaN(block)) {
      selectEndRef.current = block;
      setSelectEnd(block);
    }
  }, []);
  const handleMouseUp = useCallback(() => {
    const start = selectingRef.current;
    const end = selectEndRef.current;
    if (start != null && end != null && start !== end) {
      setZoomFrom(Math.min(start, end));
      setZoomTo(Math.max(start, end));
    }
    selectingRef.current = null;
    selectEndRef.current = null;
    setSelecting(null);
    setSelectEnd(null);
  }, []);
  const resetZoom = useCallback(() => {
    setZoomFrom(null);
    setZoomTo(null);
  }, []);
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["networks", selectedNetwork, "fees"] });
  }, [queryClient, selectedNetwork]);

  const [offset, setOffset] = useState(0);

  const resolution = resolutionForRange(range);
  const { data: currentData } = useCurrentFees(selectedNetwork);

  // Compute from/to block range based on latest block
  const latestBlock = currentData?.block?.blockNumber ?? null;
  const rangeBlocks = range === "all" ? null : parseInt(range, 10);
  const windowEnd = latestBlock != null && rangeBlocks != null ? latestBlock - offset * rangeBlocks : null;
  const fromBlock = windowEnd != null ? Math.max(0, windowEnd - rangeBlocks!) : (range === "all" ? undefined : undefined);
  const toBlock = range !== "all" ? windowEnd ?? undefined : undefined;
  const isZoomed = zoomFrom != null || zoomTo != null;
  const canGoBack = range !== "all" && (isZoomed ? (zoomFrom ?? 0) > 0 : fromBlock != null && fromBlock > 0);
  const canGoForward = range !== "all" && (isZoomed ? (zoomTo ?? 0) < (latestBlock ?? 0) : offset > 0);

  const goBack = () => {
    if (!canGoBack) return;
    if (isZoomed && zoomFrom != null && zoomTo != null) {
      const span = zoomTo - zoomFrom;
      setZoomFrom(Math.max(0, zoomFrom - span));
      setZoomTo(Math.max(span, zoomTo - span));
    } else {
      setOffset((o) => o + 1);
    }
  };
  const goForward = () => {
    if (!canGoForward) return;
    if (isZoomed && zoomFrom != null && zoomTo != null) {
      const span = zoomTo - zoomFrom;
      setZoomFrom(zoomFrom + span);
      setZoomTo(zoomTo + span);
    } else {
      setOffset((o) => o - 1);
    }
  };

  // Sync URL with visible range + network
  const effectiveFrom = zoomFrom ?? fromBlock;
  const effectiveTo = zoomTo ?? toBlock;
  useEffect(() => {
    if (effectiveFrom != null && effectiveTo != null) {
      const next = new URLSearchParams(searchParams);
      next.set("from", String(effectiveFrom));
      next.set("to", String(effectiveTo));
      setSearchParams(next, { replace: true });
    } else if (range === "all") {
      const next = new URLSearchParams(searchParams);
      next.delete("from");
      next.delete("to");
      setSearchParams(next, { replace: true });
    }
  }, [effectiveFrom, effectiveTo, range, selectedNetwork, setSearchParams]);

  const historyOpts = useMemo(
    () => ({ from: fromBlock, to: toBlock, resolution }),
    [fromBlock, toBlock, resolution],
  );

  const spreadOpts = useMemo(
    () => ({
      from: fromBlock,
      to: toBlock,
      bucketSize: spreadBucketForRange(range),
    }),
    [fromBlock, toBlock, range],
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
      blockEnd: number;
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
      blockEnd: number;
      medianFee: number | null;
      p25Fee: number | null;
      p75Fee: number | null;
      minFee: number | null;
      maxFee: number | null;
      txCount: number;
    }[] = [];

    // When history is bucketed, each row key is a bucket start (e.g. 15500, 15510).
    // Collect all history rows whose key falls within each spread bucket range.
    const historyKeys = [...historyByBlock.keys()].sort((a, b) => a - b);

    const startSpread = Math.floor(start / spreadBucket) * spreadBucket;
    for (let b = startSpread; b <= end; b += spreadBucket) {
      const s = spreadByBucket.get(b);

      // Average block base fees from all history entries within [b, b+spreadBucket)
      let sumDa = 0, sumL2 = 0, countFee = 0;
      for (const hk of historyKeys) {
        if (hk < b) continue;
        if (hk >= b + spreadBucket) break;
        const h = historyByBlock.get(hk)!;
        if (h.feePerDaGas != null && h.feePerL2Gas != null) {
          sumDa += Number(h.feePerDaGas);
          sumL2 += Number(h.feePerL2Gas);
          countFee++;
        }
      }

      priceRows.push({
        block: b,
        blockEnd: Math.min(b + spreadBucket - 1, end),
        baseDa: countFee > 0 ? sumDa / countFee : null,
        baseL2: countFee > 0 ? sumL2 / countFee : null,
        medianBidL2: s ? toNum(s.medianMaxFeePerL2Gas) : null,
        p25BidL2: s ? toNum(s.p25MaxFeePerL2Gas) : null,
        p75BidL2: s ? toNum(s.p75MaxFeePerL2Gas) : null,
        medianBidDa: s ? toNum(s.medianMaxFeePerDaGas) : null,
        medianManaL2: s ? toNum(s.medianGasLimitL2) : null,
        medianManaDa: s ? toNum(s.medianGasLimitDa) : null,
      });

      // Aggregate tx count from history entries in this bucket
      let txs = 0;
      for (const hk of historyKeys) {
        if (hk < b) continue;
        if (hk >= b + spreadBucket) break;
        const h = historyByBlock.get(hk)!;
        txs += h.numTxs ?? 0;
      }

      costRows.push({
        block: b,
        blockEnd: Math.min(b + spreadBucket - 1, end),
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
      ifOverflow="extendDomain"
      yAxisId="fee"
    />
  ) : null;

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
        {range !== "all" && <NavButton disabled={!canGoBack} onClick={goBack}>&#x25C0;</NavButton>}
        <RangeSelector>
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
            <RangeButton
              key={r}
              active={range === r}
              onClick={() => { setRange(r); setOffset(0); resetZoom(); }}
            >
              {RANGE_LABELS[r]}
            </RangeButton>
          ))}
        </RangeSelector>
        {range !== "all" && <NavButton disabled={!canGoForward} onClick={goForward}>&#x25B6;</NavButton>}
        </HeaderControls>
      </Header>

      {/* Current stats */}
      <StatsRow>
        <CompactStatCard>
          <StatLabel>DA Base Fee</StatLabel>
          <StatValue style={{ color: theme.colors.primary }}>
            {formatFJPerMana(currentDaFee)} <Unit>FJ/mana</Unit>
          </StatValue>
          {ethPrice != null && ethPerFeeAssetE12 != null && currentDaFee != null && (
            <SubStat>~{formatUsd(feeToUsd(currentDaFee, ethPerFeeAssetE12, ethPrice))}/mana</SubStat>
          )}
        </CompactStatCard>
        <CompactStatCard>
          <StatLabel>L2 Base Fee</StatLabel>
          <StatValue style={{ color: theme.colors.accent }}>
            {formatFJPerMana(currentL2Fee)} <Unit>FJ/mana</Unit>
          </StatValue>
          {ethPrice != null && ethPerFeeAssetE12 != null && currentL2Fee != null && (
            <SubStat>~{formatUsd(feeToUsd(currentL2Fee, ethPerFeeAssetE12, ethPrice))}/mana</SubStat>
          )}
        </CompactStatCard>
        <CompactStatCard>
          <StatLabel>ETH / USD</StatLabel>
          <StatValue>
            {ethPrice != null ? `$${ethPrice.toLocaleString()}` : "-"}
          </StatValue>
          {currentData?.block && (
            <SubStat>Block #{currentData.block.blockNumber}</SubStat>
          )}
        </CompactStatCard>
      </StatsRow>

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
              <XAxis dataKey="block" type="number" domain={["dataMin", "dataMax"]} stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `#${v}`} />
              <YAxis yAxisId="fee" stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => formatPerManaCompact(v)} />
              <YAxis yAxisId="mana" orientation="right" stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => formatPerManaCompact(v)} />
              <Tooltip
                contentStyle={{ background: theme.colors.bgCard, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: 11, fontFamily: "monospace" }}
                labelFormatter={(v, payload) => {
                  const row = payload?.[0]?.payload;
                  if (row?.blockEnd != null && row.blockEnd !== v) return `Blocks #${v}–#${row.blockEnd}`;
                  return `Block #${v}`;
                }}
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
                  return [isMana ? Number(value).toLocaleString() : `${formatFJPerMana(value)} FJ/mana`, labels[name] ?? name];
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
              <XAxis dataKey="block" type="number" domain={["dataMin", "dataMax"]} stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `#${v}`} />
              <YAxis yAxisId="fee" stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => formatFJCompact(v)} />
              <YAxis yAxisId="txs" orientation="right" stroke={theme.colors.textMuted} fontSize={10} />
              <Tooltip
                contentStyle={{ background: theme.colors.bgCard, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: 11, fontFamily: "monospace" }}
                labelFormatter={(v, payload) => {
                  const row = payload?.[0]?.payload;
                  if (row?.blockEnd != null && row.blockEnd !== v) return `Blocks #${v}–#${row.blockEnd}`;
                  return `Block #${v}`;
                }}
                formatter={(value: number, name: string) => {
                  if (name === "txCount") return [`${value}`, "Txs"];
                  const labels: Record<string, string> = { medianFee: "Median", p25Fee: "P25", p75Fee: "P75", minFee: "Min", maxFee: "Max" };
                  const fj = formatFJ(value);
                  const usd = ethPrice != null && ethPerFeeAssetE12 != null
                    ? ` (${formatUsd(feeToUsd(value, ethPerFeeAssetE12, ethPrice))})`
                    : "";
                  return [`${fj}${usd}`, labels[name] ?? name];
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

const NavButton = styled.button<{ disabled?: boolean }>`
  padding: 6px 10px;
  background: ${theme.colors.bgCard};
  color: ${(p) => (p.disabled ? theme.colors.border : theme.colors.textMuted)};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.sm};
  cursor: ${(p) => (p.disabled ? "default" : "pointer")};
  font-size: ${theme.fontSize.sm};
  line-height: 1;
  transition: color 0.15s, background 0.15s;
  &:hover:not(:disabled) { color: ${theme.colors.text}; background: ${theme.colors.bgHover}; }
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

const StatsRow = styled.div`
  display: flex;
  gap: ${theme.spacing.md};

  @media (max-width: 768px) {
    gap: ${theme.spacing.xs};
  }
`;

const CompactStatCard = styled(Card)`
  flex: 1;
  padding: ${theme.spacing.md};
  min-width: 0;
  text-align: center;

  @media (max-width: 768px) {
    padding: ${theme.spacing.sm};

    ${StatValue} {
      font-size: ${theme.fontSize.sm};
    }
    ${StatLabel} {
      font-size: 10px;
    }
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

