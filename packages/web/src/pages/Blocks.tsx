import { useState, useMemo, useCallback, useRef } from "react";
import styled from "@emotion/styled";
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { theme } from "../lib/theme";
import { useNetworkStore } from "../stores/network";
import { useBlockHistory, useBlockStats, useBlockConfig, useCurrentFees } from "../api/hooks";
import { formatFJ } from "../lib/format";
import {
  PageContainer,
  PageTitle,
  Card,
  StatValue,
  StatLabel,
  Loading,
} from "../components/ui";

type TimeRange = "100" | "500" | "1000" | "5000";

const RANGE_LABELS: Record<TimeRange, string> = {
  "100": "100 blocks",
  "500": "500 blocks",
  "1000": "1K blocks",
  "5000": "5K blocks",
};

// ── Styled components (matching Fees page) ──

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
  &:hover { color: ${theme.colors.text}; background: ${theme.colors.bgHover}; }
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
  &:hover { background: ${theme.colors.warning}22; }
`;

const RangeSelector = styled.div`
  display: flex;
  gap: 2px;
  background: ${theme.colors.bgCard};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.md};
  padding: 2px;
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
    background: ${(p) => (p.active ? theme.colors.primary : theme.colors.bgHover)};
    color: ${theme.colors.text};
  }
`;

const TopBar = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const StatsColumn = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${theme.spacing.sm};
  flex: 1;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const CompactStatCard = styled(Card)`
  padding: ${theme.spacing.sm};
  min-width: 0;
  text-align: center;

  @media (max-width: 768px) {
    ${StatValue} { font-size: ${theme.fontSize.sm}; }
    ${StatLabel} { font-size: 10px; }
  }
`;

const ProposerCard = styled(Card)`
  padding: ${theme.spacing.md};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  min-width: 220px;

  @media (max-width: 768px) {
    min-width: 0;
  }
`;

const ProposerLegend = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
`;

const ProposerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: ${theme.colors.text};
`;

const PieDot = styled.span<{ color: string }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => p.color};
  flex-shrink: 0;
`;

const ChartCard = styled(Card)`
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
`;

const ChartTitle = styled.h3`
  margin: 0 0 4px;
  font-size: ${theme.fontSize.md};
  font-weight: 600;
  color: ${theme.colors.text};
`;

const PROPOSER_COLORS = [
  "#8b7dff", "#ff7ea0", "#5aeaa0", "#ffd080", "#80d4ff",
  "#ffb080", "#d580ff", "#80ffd8",
];
const OTHER_COLOR = "#555570";
const OTHER_THRESHOLD = 3; // bundle proposers with < 3% share

function abbreviateEthAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function feeToUsd(raw: number, ethPerFeeAssetE12: string, ethUsdPrice: number): number {
  return (raw / 1e18) * (Number(ethPerFeeAssetE12) / 1e12) * ethUsdPrice;
}

function formatUsd(v: number): string {
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  if (v >= 0.000001) return `$${v.toFixed(8)}`;
  return `$${v.toExponential(3)}`;
}

export function Blocks() {
  const { selectedNetwork } = useNetworkStore();
  const [range, setRange] = useState<TimeRange>("100");

  // Zoom state
  const [zoomFrom, setZoomFrom] = useState<number | null>(null);
  const [zoomTo, setZoomTo] = useState<number | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [selectEnd, setSelectEnd] = useState<number | null>(null);
  const selectingRef = useRef<number | null>(null);
  const selectEndRef = useRef<number | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ChartMouseEvent = any;
  const getBlock = (e: ChartMouseEvent): number | null => {
    if (!e) return null;
    if (e.activeLabel !== undefined && e.activeLabel !== null) return Number(e.activeLabel);
    return e.activePayload?.[0]?.payload?.block ?? null;
  };
  const handleMouseDown = useCallback((e: ChartMouseEvent) => {
    const block = getBlock(e);
    if (block != null && !isNaN(block)) {
      selectingRef.current = block; selectEndRef.current = null;
      setSelecting(block); setSelectEnd(null);
    }
  }, []);
  const handleMouseMove = useCallback((e: ChartMouseEvent) => {
    if (selectingRef.current == null) return;
    const block = getBlock(e);
    if (block != null && !isNaN(block)) { selectEndRef.current = block; setSelectEnd(block); }
  }, []);
  const handleMouseUp = useCallback(() => {
    const s = selectingRef.current, end = selectEndRef.current;
    if (s != null && end != null && s !== end) { setZoomFrom(Math.min(s, end)); setZoomTo(Math.max(s, end)); }
    selectingRef.current = null; selectEndRef.current = null;
    setSelecting(null); setSelectEnd(null);
  }, []);
  const resetZoom = useCallback(() => { setZoomFrom(null); setZoomTo(null); }, []);
  const isZoomed = zoomFrom != null || zoomTo != null;

  const zoomProps = { onMouseDown: handleMouseDown, onMouseMove: handleMouseMove, onMouseUp: handleMouseUp };
  const selectionOverlay = selecting != null && selectEnd != null ? (
    <ReferenceArea x1={Math.min(selecting, selectEnd)} x2={Math.max(selecting, selectEnd)}
      fill={theme.colors.primary} fillOpacity={0.15} stroke={theme.colors.primary} strokeOpacity={0.4} ifOverflow="extendDomain" />
  ) : null;

  const [offset, setOffset] = useState(0); // how many range-widths back from latest

  const { data: statsData, isLoading: statsLoading } = useBlockStats(selectedNetwork);
  const { data: configData } = useBlockConfig(selectedNetwork);
  const { data: currentFees } = useCurrentFees(selectedNetwork);

  const ethPrice = currentFees?.pricing?.ethUsdPrice ?? null;
  const ethPerFeeAssetE12 = currentFees?.pricing?.ethPerFeeAssetE12 ?? null;

  const latestBlock = statsData?.data?.blockRange.to ?? null;
  const earliestBlock = statsData?.data?.blockRange.from ?? 0;
  const rangeBlocks = parseInt(range, 10);
  const windowEnd = latestBlock != null ? latestBlock - offset * rangeBlocks : null;
  const fromBlock = windowEnd != null ? Math.max(0, windowEnd - rangeBlocks) : undefined;
  const toBlock = windowEnd ?? undefined;
  const canGoBack = fromBlock != null && fromBlock > earliestBlock;
  const canGoForward = offset > 0;

  const historyOpts = useMemo(() => ({
    from: fromBlock,
    to: toBlock,
    limit: rangeBlocks + 10,
  }), [fromBlock, toBlock, rangeBlocks]);
  const rangeReady = fromBlock != null;
  const { data: historyData, isLoading: historyLoading } = useBlockHistory(rangeReady ? selectedNetwork : "", historyOpts);

  const config = configData?.data;
  const stats = statsData?.data;

  const chartData = useMemo(() => {
    if (!historyData?.data) return [];
    const all = historyData.data.map((b, i, arr) => ({
      block: b.blockNumber,
      numTxs: b.numTxs,
      manaUsed: b.totalManaUsed ? Number(b.totalManaUsed) : 0,
      totalFees: b.totalFees ? Number(b.totalFees) : 0,
      blockTime: (() => {
        if (i === 0 || !b.timestamp || !arr[i - 1].timestamp) return null;
        const dt = b.timestamp - arr[i - 1].timestamp!;
        return dt > 0 ? dt : null; // filter out 0s from reconciliation/backfill
      })(),
    }));
    if (zoomFrom != null && zoomTo != null) return all.filter((d) => d.block >= zoomFrom && d.block <= zoomTo);
    return all;
  }, [historyData, zoomFrom, zoomTo]);

  // Bundle small proposers into "Other"
  const pieData = useMemo(() => {
    if (!stats?.proposers) return [];
    const main = stats.proposers.filter((p) => p.share >= OTHER_THRESHOLD);
    const others = stats.proposers.filter((p) => p.share < OTHER_THRESHOLD);
    const otherCount = others.reduce((sum, p) => sum + p.blockCount, 0);
    const otherShare = others.reduce((sum, p) => sum + p.share, 0);
    const result = main.map((p) => ({ ...p, label: p.coinbase ? abbreviateEthAddress(p.coinbase) : "Unknown" }));
    if (otherCount > 0) result.push({ coinbase: null, blockCount: otherCount, share: +otherShare.toFixed(1), label: `Other (${others.length})` });
    return result;
  }, [stats]);

  const maxMana = config?.maxL2BlockGas ? Number(config.maxL2BlockGas) : null;

  const tooltipStyle = {
    background: theme.colors.bgCard,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    fontSize: 11,
    fontFamily: "monospace",
  };

  return (
    <PageContainer>
      <Header>
        <PageTitle>Block Analytics</PageTitle>
        <HeaderControls>
          <RefreshButton title="Refresh">&#x21bb;</RefreshButton>
          {isZoomed && <ResetZoomButton onClick={resetZoom}>Reset Zoom</ResetZoomButton>}
          <NavButton disabled={!canGoBack} onClick={() => canGoBack && setOffset((o) => o + 1)}>&#x25C0;</NavButton>
          <RangeSelector>
            {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
              <RangeButton key={r} active={range === r} onClick={() => { setRange(r); setOffset(0); resetZoom(); }}>
                {RANGE_LABELS[r]}
              </RangeButton>
            ))}
          </RangeSelector>
          <NavButton disabled={!canGoForward} onClick={() => canGoForward && setOffset((o) => o - 1)}>&#x25B6;</NavButton>
        </HeaderControls>
      </Header>

      {statsLoading && <Loading />}

      {stats && (
        <>
          {/* Top bar: 2-row stats grid + sequencer pie */}
          <TopBar>
            <StatsColumn>
              <CompactStatCard>
                <StatLabel>Blocks</StatLabel>
                <StatValue>{stats.blockCount.toLocaleString()}</StatValue>
              </CompactStatCard>
              <CompactStatCard>
                <StatLabel>Avg Block Time</StatLabel>
                <StatValue>{stats.avgBlockTime}s</StatValue>
              </CompactStatCard>
              <CompactStatCard>
                <StatLabel>Avg Txs/Block</StatLabel>
                <StatValue>{stats.avgTxsPerBlock}</StatValue>
              </CompactStatCard>
              <CompactStatCard>
                <StatLabel>Empty Blocks</StatLabel>
                <StatValue>{stats.emptyBlockPct}%</StatValue>
              </CompactStatCard>
              <CompactStatCard>
                <StatLabel>Missed Slots</StatLabel>
                <StatValue>{stats.missedSlots}</StatValue>
              </CompactStatCard>
              <CompactStatCard>
                <StatLabel>Proposers</StatLabel>
                <StatValue>{stats.proposerCount}</StatValue>
              </CompactStatCard>
              {maxMana && (
                <CompactStatCard>
                  <StatLabel>Max Mana/Block</StatLabel>
                  <StatValue style={{ fontSize: theme.fontSize.sm }}>{(maxMana / 1e6).toFixed(1)}M</StatValue>
                </CompactStatCard>
              )}
            </StatsColumn>

            {pieData.length > 0 && (
              <ProposerCard style={{ flexDirection: "column", alignItems: "stretch" }}>
                <StatLabel style={{ textAlign: "center", marginBottom: 4 }}>Sequencers</StatLabel>
                <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.md }}>
                <PieChart width={100} height={100}>
                  <Pie data={pieData} dataKey="blockCount" cx="50%" cy="50%" outerRadius={45} innerRadius={25} paddingAngle={1} strokeWidth={0}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={i < PROPOSER_COLORS.length ? PROPOSER_COLORS[i] : OTHER_COLOR} />
                    ))}
                  </Pie>
                </PieChart>
                <ProposerLegend>
                  {pieData.map((p, i) => (
                    <ProposerRow key={p.label}>
                      <PieDot color={i < PROPOSER_COLORS.length ? PROPOSER_COLORS[i] : OTHER_COLOR} />
                      <span style={{ minWidth: 28, color: theme.colors.textMuted }}>{p.share}%</span>
                      <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.label}
                      </span>
                    </ProposerRow>
                  ))}
                </ProposerLegend>
                </div>
              </ProposerCard>
            )}
          </TopBar>

          {/* Block Utilization */}
          <ChartCard>
            <ChartTitle>Block Utilization (L2 Mana)</ChartTitle>
            {historyLoading ? <Loading /> : (
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }} {...zoomProps}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
                  <XAxis dataKey="block" type="number" domain={["dataMin", "dataMax"]} stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `#${v}`} />
                  <YAxis stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${(value / 1e6).toFixed(2)}M mana${maxMana ? ` (${(value / maxMana * 100).toFixed(1)}%)` : ""}`, "Mana Used"]}
                    labelFormatter={(v) => `Block #${v}`} />
                  <Area type="monotone" dataKey="manaUsed" stroke={theme.colors.primary} fill={theme.colors.primary} fillOpacity={0.15} />
                  {maxMana && <ReferenceLine y={maxMana} stroke={theme.colors.danger} strokeDasharray="3 3" label={{ value: "Max", position: "right", fontSize: 10, fill: theme.colors.danger }} />}
                  {selectionOverlay}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Transactions Per Block */}
          <ChartCard>
            <ChartTitle>Transactions Per Block</ChartTitle>
            {historyLoading ? <Loading /> : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }} {...zoomProps}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
                  <XAxis dataKey="block" type="number" domain={["dataMin", "dataMax"]} padding={{ left: 10, right: 10 }} stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `#${v}`} />
                  <YAxis stroke={theme.colors.textMuted} fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}`, "Txs"]} labelFormatter={(v) => `Block #${v}`} />
                  <Bar dataKey="numTxs" fill={theme.colors.accent} fillOpacity={0.4} stroke={theme.colors.accent} strokeOpacity={0.6} strokeWidth={0.5} />
                  {config?.maxTxsPerBlock && <ReferenceLine y={config.maxTxsPerBlock} stroke={theme.colors.danger} strokeDasharray="3 3" label={{ value: "Max", position: "right", fontSize: 10, fill: theme.colors.danger }} />}
                  {selectionOverlay}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Block Time */}
          <ChartCard>
            <ChartTitle>Block Time</ChartTitle>
            {historyLoading ? <Loading /> : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={chartData.filter((d) => d.blockTime != null)} margin={{ top: 5, right: 10, bottom: 5, left: 10 }} {...zoomProps}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
                  <XAxis dataKey="block" type="number" domain={["dataMin", "dataMax"]} stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `#${v}`} />
                  <YAxis stroke={theme.colors.textMuted} fontSize={10} unit="s" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}s`, "Block Time"]} labelFormatter={(v) => `Block #${v}`} />
                  <Line type="monotone" dataKey="blockTime" stroke={theme.colors.warning} strokeWidth={1.5} dot={false} connectNulls />
                  {config?.aztecSlotDuration && <ReferenceLine y={config.aztecSlotDuration} stroke={theme.colors.success} strokeDasharray="3 3" label={{ value: "Target", position: "right", fontSize: 10, fill: theme.colors.success }} />}
                  {selectionOverlay}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Fee Revenue */}
          <ChartCard>
            <ChartTitle>Fee Revenue Per Block</ChartTitle>
            {historyLoading ? <Loading /> : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }} {...zoomProps}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} opacity={0.3} />
                  <XAxis dataKey="block" type="number" domain={["dataMin", "dataMax"]} stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => `#${v}`} />
                  <YAxis stroke={theme.colors.textMuted} fontSize={10} tickFormatter={(v) => formatFJ(v)} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(value: number) => {
                      const fj = formatFJ(value);
                      const usd = ethPrice != null && ethPerFeeAssetE12 != null ? ` (${formatUsd(feeToUsd(value, ethPerFeeAssetE12, ethPrice))})` : "";
                      return [`${fj}${usd}`, "Fees"];
                    }}
                    labelFormatter={(v) => `Block #${v}`} />
                  <Area type="monotone" dataKey="totalFees" stroke={theme.colors.success} fill={theme.colors.success} fillOpacity={0.1} />
                  {selectionOverlay}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </>
      )}
    </PageContainer>
  );
}
