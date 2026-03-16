import { useState, useMemo, Fragment } from "react";
import { useParams, Link } from "react-router-dom";
import styled from "@emotion/styled";
import { useNetworkStore } from "../stores/network";
import { useTxDetail, useTxGraph } from "../api/hooks";
import { useMyTxs } from "../stores/my-txs";
import { useLabeledAddresses } from "../hooks/useAddressResolver";
import type {
  PrivateLogDetail,
  PublicLogDetail,
  ContractClassLogDetail,
  PublicAddress,
  SimilarTx,
} from "../lib/api";
import {
  PageContainer,
  PageTitle,
  Card,
  SectionTitle,
  Table,
  TableWrapper,
  Mono,
  Loading,
  Flex,
  Badge,
  Button,
} from "../components/ui";
import { HexDisplay } from "../components/HexDisplay";
import { theme } from "../lib/theme";
import {
  SnapshotableFingerprint,
  FingerprintCompare,
} from "../components/TxFingerprint";
import { abbreviateHex } from "../components/TxTable";

// ── Styled components ──

const Field = styled.div`
  margin-bottom: ${theme.spacing.md};
`;

const FieldLabel = styled.div`
  font-size: ${theme.fontSize.xs};
  color: ${theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.xs};
`;

const FieldValue = styled(Mono)`
  font-size: ${theme.fontSize.sm};
  word-break: break-all;
`;

const SlotLabel = styled.div`
  font-size: ${theme.fontSize.xs};
  color: ${theme.colors.textMuted};
  white-space: nowrap;
  width: 160px;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;

  & > span {
    display: inline-block;
    transition: transform 0.6s ease;
  }

  &:hover > span {
    transform: translateX(calc(min(0px, 160px - 100%)));
  }
`;

const HeatmapBar = styled.div`
  display: flex;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  height: 20px;
  border-radius: 3px;
  overflow: hidden;
  position: relative;
`;

const HeatmapCell = styled.div<{ intensity: number; isFocal?: boolean }>`
  flex: 1;
  background: ${(p) =>
    p.isFocal
      ? theme.colors.warning
      : p.intensity > 0
        ? `rgba(88, 101, 242, ${Math.min(0.2 + p.intensity * 0.8, 1)})`
        : theme.colors.bgCard};
  border-right: 1px solid ${theme.colors.bg};

  &:last-child {
    border-right: none;
  }
`;

const NearbyList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.xs};
`;

const SlotRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.sm} 0;

  &:not(:last-child) {
    border-bottom: 1px solid ${theme.colors.border};
  }
`;

const CalldataCell = styled.td`
  padding: ${theme.spacing.xs} ${theme.spacing.sm} !important;
  background: ${theme.colors.bg};
`;

const CalldataToggle = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.primary};
  cursor: pointer;
  font-size: ${theme.fontSize.xs};
  padding: 0;
  &:hover {
    text-decoration: underline;
  }
`;

const SortableHeader = styled.th<{ active?: boolean }>`
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  color: ${(p) => (p.active ? theme.colors.primary : "inherit")};
  &:hover {
    color: ${theme.colors.primary};
  }
`;

const FeatureRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: ${theme.spacing.xs} 0;
  &:not(:last-child) {
    border-bottom: 1px solid ${theme.colors.border};
  }
`;

const FeatureName = styled.span`
  font-size: ${theme.fontSize.xs};
  color: ${theme.colors.textMuted};
  flex-shrink: 0;
  margin-right: ${theme.spacing.sm};
`;

const FeatureValue = styled(Mono)`
  font-size: ${theme.fontSize.sm};
`;

const CollapsibleHeader = styled.button`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: ${theme.colors.text};
  font-size: ${theme.fontSize.lg};
  font-weight: 600;
  margin-bottom: ${theme.spacing.md};

  &:hover {
    color: ${theme.colors.primary};
  }
`;

const CollapsibleArrow = styled.span<{ open: boolean }>`
  display: inline-block;
  font-size: ${theme.fontSize.sm};
  color: ${theme.colors.textMuted};
  transition: transform 0.15s;
  transform: rotate(${(p) => (p.open ? "90deg" : "0deg")});
`;

const TabBar = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid ${theme.colors.border};
  margin-top: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.md};
`;

const Tab = styled.button<{ active?: boolean }>`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: none;
  border: none;
  border-bottom: 2px solid
    ${(p) => (p.active ? theme.colors.primary : "transparent")};
  margin-bottom: -2px;
  font-size: ${theme.fontSize.sm};
  font-weight: 600;
  color: ${(p) => (p.active ? theme.colors.primary : theme.colors.textMuted)};
  cursor: pointer;

  &:hover {
    color: ${theme.colors.primary};
  }
`;

const TopColumns = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: stretch;

  @media (max-width: 1400px) {
    flex-direction: column;
  }
`;

const TopColumnLeft = styled.div`
  flex: 3 1 0%;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const TopColumnRight = styled.div`
  flex: 7 1 0%;
  min-width: 0;
  display: flex;
  flex-direction: column;

  @media (max-width: 1400px) {
    width: 100%;
  }
`;

const FingerprintInner = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: stretch;
  flex: 1;
  min-height: 0;

  @media (max-width: 1400px) {
    flex-direction: column;
  }
`;

const FingerprintChartCol = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const FingerprintValuesCol = styled.div<{ collapsed?: boolean }>`
  flex: 0 0 ${(p) => (p.collapsed ? "0px" : "35%")};
  min-width: 0;
  max-height: 400px;
  overflow: ${(p) => (p.collapsed ? "hidden" : "auto")};
  opacity: ${(p) => (p.collapsed ? 0 : 1)};
  transition:
    flex-basis 0.2s,
    opacity 0.2s;

  @media (max-width: 1400px) {
    display: none;
  }
`;

const ValuesToggle = styled.button<{ collapsed?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-end;
  background: ${theme.colors.bg};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.md};
  padding: 4px 10px;
  cursor: pointer;
  color: ${theme.colors.textMuted};
  font-size: ${theme.fontSize.xs};
  font-weight: 500;
  line-height: 1;
  margin-bottom: ${theme.spacing.xs};
  &:hover {
    color: ${theme.colors.text};
    background: ${theme.colors.bgHover};
    border-color: ${theme.colors.primary};
  }

  @media (max-width: 1400px) {
    display: none;
  }
`;

const FingerprintValuesMobile = styled.div`
  display: none;

  @media (max-width: 1400px) {
    display: block;
  }
`;

const SimilarGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${theme.spacing.sm};

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const SimilarTxCard = styled(Card)`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
`;

const SimilarTxHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: ${theme.fontSize.xs};
`;

/** Convert a SimilarTx row into a feature vector array matching the 15-dim layout */
/** Format a very small number using scientific notation when needed */
function formatSmallNumber(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 0.01) return n.toFixed(4);
  if (abs >= 1e-6) return n.toFixed(8);
  return n.toExponential(2);
}

function similarTxToVector(tx: SimilarTx): (number | string)[] {
  // Prefer the stored feature vector (has correct expirationDelta etc.)
  if (tx.featureVector) return tx.featureVector;
  // Fallback: reconstruct from tx fields (expirationDelta will be wrong)
  return [
    tx.numNoteHashes,
    tx.numNullifiers,
    tx.numL2ToL1Msgs,
    tx.numPrivateLogs,
    tx.numContractClassLogs,
    tx.numPublicLogs ?? 0,
    tx.gasLimitDa ?? 0,
    tx.gasLimitL2 ?? 0,
    tx.maxFeePerDaGas ?? 0,
    tx.maxFeePerL2Gas ?? 0,
    tx.numSetupCalls,
    tx.numAppCalls,
    tx.totalPublicCalldataSize,
    tx.expirationTimestamp ?? 0,
    tx.feePayer,
  ];
}

/** Format a seconds delta as a human-readable string */
function formatDelta(seconds: number): string {
  if (seconds < 0) return `-${formatDelta(-seconds)}`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

// ── Sortable table helper ──

type SortDir = "asc" | "desc";

function useSortableTable<T>(
  data: T[],
  defaultKey: keyof T & string,
  defaultDir: SortDir = "asc",
) {
  const [sortKey, setSortKey] = useState<keyof T & string>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: keyof T & string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const indicator = (key: keyof T & string) =>
    key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return { sorted, sortKey, sortDir, toggleSort, indicator };
}

// ── Collapsible section ──

function Collapsible({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: theme.spacing.lg }}>
      <CollapsibleHeader onClick={() => setOpen((o) => !o)}>
        <CollapsibleArrow open={open}>▶</CollapsibleArrow>
        {title}
        {count != null && <Badge color={theme.colors.textMuted}>{count}</Badge>}
      </CollapsibleHeader>
      {open && children}
    </div>
  );
}

// ── Slot Activity subsection ──

function SlotHeatmap({
  histogram,
  focalBin,
  blockRange,
}: {
  histogram: number[];
  focalBin: number | null;
  blockRange: { min: number; max: number };
}) {
  const maxCount = Math.max(...histogram, 1);
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);
  const range = blockRange.max - blockRange.min || 1;

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <HeatmapBar>
        {histogram.map((count, i) => (
          <HeatmapCell
            key={i}
            intensity={count / maxCount}
            isFocal={i === focalBin}
            onMouseEnter={() => setHoveredBin(i)}
            onMouseLeave={() => setHoveredBin(null)}
            title={`Blocks ${(blockRange.min + Math.floor((i / histogram.length) * range)).toLocaleString()}–${(blockRange.min + Math.floor(((i + 1) / histogram.length) * range)).toLocaleString()}: ${count} write${count !== 1 ? "s" : ""}`}
          />
        ))}
      </HeatmapBar>
      {hoveredBin != null && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: `${((hoveredBin + 0.5) / histogram.length) * 100}%`,
            transform: "translateX(-50%)",
            background: theme.colors.bgCard,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            fontSize: theme.fontSize.xs,
            whiteSpace: "nowrap",
            zIndex: 10,
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
          }}
        >
          <span style={{ color: theme.colors.text }}>
            {histogram[hoveredBin]} write{histogram[hoveredBin] !== 1 ? "s" : ""}
          </span>
          <span style={{ color: theme.colors.textMuted, marginLeft: "6px" }}>
            Blocks {(blockRange.min + Math.floor((hoveredBin / histogram.length) * range)).toLocaleString()}
            –{(blockRange.min + Math.floor(((hoveredBin + 1) / histogram.length) * range)).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

function SlotTimelines({
  networkId,
  hash,
}: {
  networkId: string;
  hash: string;
}) {
  const { data, isLoading } = useTxGraph(networkId, hash);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  if (isLoading) return <Loading />;
  if (!data || data.slots.length === 0) return null;

  return (
    <Collapsible
      title="Public Data Writes"
      count={data.slots.length}
      defaultOpen={false}
    >
      <p
        style={{
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.md,
          fontSize: theme.fontSize.xs,
        }}
      >
        Activity heatmap per storage slot. Brighter = more writes.{" "}
        <span style={{ color: theme.colors.warning, fontWeight: "bold" }}>
          Highlighted
        </span>{" "}
        = this transaction's block. Click a row for nearby transactions.
      </p>

      <Card
        style={{ padding: theme.spacing.md, marginBottom: theme.spacing.md }}
      >
        {data.slots.map((slot) => (
          <div key={slot.leafSlot}>
            <SlotRow
              style={{ cursor: "pointer" }}
              onClick={() =>
                setExpandedSlot(
                  expandedSlot === slot.leafSlot ? null : slot.leafSlot,
                )
              }
            >
              <SlotLabel
                title={
                  slot.resolvedContract
                    ? `${slot.resolvedContract.label ?? slot.resolvedContract.address} [${slot.resolvedContract.storageSlotIndex}]`
                    : slot.leafSlot
                }
              >
                <span>
                  {slot.resolvedContract ? (
                    <>
                      <Badge
                        color={theme.colors.primary}
                        style={{ fontSize: "10px" }}
                      >
                        {slot.resolvedContract.label ??
                          abbreviateHex(slot.resolvedContract.address)}
                      </Badge>{" "}
                      <span style={{ color: theme.colors.textMuted }}>
                        [{slot.resolvedContract.storageSlotIndex}]
                      </span>
                    </>
                  ) : (
                    <Mono style={{ fontSize: "10px" }}>
                      {abbreviateHex(slot.leafSlot)}
                    </Mono>
                  )}
                </span>
              </SlotLabel>
              <SlotHeatmap
                histogram={slot.histogram}
                focalBin={slot.focalBin}
                blockRange={slot.blockRange}
              />
              <Badge color={theme.colors.accent} style={{ flexShrink: 0 }}>
                {slot.totalWrites}
              </Badge>
            </SlotRow>
            {expandedSlot === slot.leafSlot &&
              slot.nearbyWrites.length > 0 && (
                <NearbyList>
                  {slot.nearbyWrites.map((w, i) => (
                    <Fragment key={i}>
                      {w.isFocalTx ? (
                        <Badge
                          color={theme.colors.warning}
                          style={{ fontSize: "10px" }}
                        >
                          This tx (Block{" "}
                          {w.blockNumber?.toLocaleString() ?? "?"})
                        </Badge>
                      ) : (
                        <Link
                          to={`/tx/${w.txHash}`}
                          style={{ textDecoration: "none" }}
                        >
                          <Badge
                            color={theme.colors.primary}
                            style={{ fontSize: "10px", cursor: "pointer" }}
                          >
                            {abbreviateHex(w.txHash)} (Block{" "}
                            {w.blockNumber?.toLocaleString() ?? "?"})
                          </Badge>
                        </Link>
                      )}
                    </Fragment>
                  ))}
                </NearbyList>
              )}
          </div>
        ))}
      </Card>
    </Collapsible>
  );
}

// ── Public Calls with inline calldata ──

function PublicCallsSection({
  calls,
  labeledAddresses,
}: {
  calls: {
    phase: string;
    contractAddress: string;
    functionSelector: string | null;
    msgSender: string | null;
    calldataSize: number;
    calldata: string[];
    isStaticCall: boolean;
    label: string | null;
    contractType: string | null;
  }[];
  labeledAddresses: Set<string>;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <Card
      style={{ padding: 0, overflow: "hidden", marginBottom: theme.spacing.md }}
    >
      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <th>Phase</th>
              <th>Contract</th>
              <th>Selector</th>
              <th>Sender</th>
              <th>Calldata</th>
              <th>Static</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c, i) => {
              const phaseColor =
                c.phase === "setup"
                  ? theme.colors.accent
                  : c.phase === "teardown"
                    ? theme.colors.warning
                    : theme.colors.primary;
              const hasCalldata = c.calldata.length > 0;
              const isExpanded = expandedRows.has(i);
              return (
                <Fragment key={i}>
                  <tr>
                    <td>
                      <Badge color={phaseColor}>{c.phase}</Badge>
                    </td>
                    <td>
                      <HexDisplay
                        address={c.contractAddress}

                      />
                    </td>
                    <td>
                      <Mono style={{ fontSize: "10px" }}>
                        {c.functionSelector ?? "\u2014"}
                      </Mono>
                    </td>
                    <td>
                      {c.msgSender ? (
                        <HexDisplay
                          address={c.msgSender}

                        />
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td>
                      {hasCalldata ? (
                        <CalldataToggle onClick={() => toggle(i)}>
                          {c.calldataSize} fields {isExpanded ? "▾" : "▸"}
                        </CalldataToggle>
                      ) : (
                        <span style={{ fontSize: theme.fontSize.xs }}>
                          {c.calldataSize} fields
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: theme.fontSize.xs }}>
                        {c.isStaticCall ? "true" : "false"}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <CalldataCell colSpan={6}>
                        <div style={{ maxHeight: "160px", overflowY: "auto" }}>
                          {c.calldata.map((field, j) => {
                            const isLabeled = labeledAddresses.has(
                              field.toLowerCase(),
                            );
                            return (
                              <div
                                key={j}
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  alignItems: "baseline",
                                }}
                              >
                                <span
                                  style={{
                                    color: theme.colors.textMuted,
                                    fontSize: "10px",
                                    minWidth: "20px",
                                    textAlign: "right",
                                  }}
                                >
                                  {j}
                                </span>
                                <Mono
                                  style={{
                                    fontSize: "10px",
                                    wordBreak: "break-all",
                                  }}
                                >
                                  {isLabeled && (
                                    <>
                                      <Badge
                                        color={theme.colors.accent}
                                        style={{ fontSize: "9px" }}
                                      >
                                        addr?
                                      </Badge>{" "}
                                    </>
                                  )}
                                  <HexDisplay address={field} abbreviate={false} />
                                </Mono>
                              </div>
                            );
                          })}
                        </div>
                      </CalldataCell>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableWrapper>
    </Card>
  );
}

// ── Status badge helper ──

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "finalized"
      ? theme.colors.success
      : status === "proven"
        ? theme.colors.success
        : status === "checkpointed"
          ? theme.colors.accent
          : status === "proposed"
            ? theme.colors.accent
            : status === "dropped"
              ? theme.colors.danger
              : theme.colors.warning;
  return <Badge color={color}>{status}</Badge>;
}

// ── Feature vector dimension labels ──

const FEATURE_LABELS = [
  "Note Hashes",
  "Nullifiers",
  "L2 to L1 Messages",
  "Private Logs",
  "Contract Class Logs",
  "Public Logs",
  "Gas Limit (DA)",
  "Gas Limit (L2)",
  "Max Fee Per DA Gas",
  "Max Fee Per L2 Gas",
  "Setup Calls",
  "App Calls",
  "Total Public Calldata Size",
  "Expiration Delta",
  "Fee Payer",
];

// ── Publicly Visible Addresses section ──

function PublicAddressesSection({
  addresses,
  feePayer,
}: {
  addresses: PublicAddress[];
  feePayer: string;
}) {
  const { sorted, toggleSort, indicator, sortKey } = useSortableTable(
    addresses,
    "source",
  );

  if (addresses.length === 0) return null;

  return (
    <>
      <h3
        style={{
          fontSize: theme.fontSize.md,
          fontWeight: 600,
          marginBottom: theme.spacing.sm,
          color: theme.colors.text,
        }}
      >
        Visible Addresses ({addresses.length})
      </h3>
      <Card
        style={{
          padding: 0,
          overflow: "hidden",
          marginBottom: theme.spacing.md,
        }}
      >
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <SortableHeader
                  active={sortKey === "address"}
                  onClick={() => toggleSort("address")}
                >
                  Address{indicator("address")}
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "source"}
                  onClick={() => toggleSort("source")}
                >
                  Source{indicator("source")}
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => {
                const isFeePayer =
                  a.address.toLowerCase() === feePayer.toLowerCase();
                return (
                  <tr
                    key={i}
                    style={
                      isFeePayer
                        ? { background: "rgba(255, 198, 108, 0.08)" }
                        : undefined
                    }
                  >
                    <td>
                      <HexDisplay
                        address={a.address}

                      />
                    </td>
                    <td>
                      <Mono
                        style={{
                          fontSize: "10px",
                          color: isFeePayer
                            ? theme.colors.warning
                            : theme.colors.textMuted,
                        }}
                      >
                        {a.source}
                      </Mono>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>
    </>
  );
}

// ── Shared log fields list ──

function LogFieldsList({ fields }: { fields: string[] }) {
  return (
    <div style={{ maxHeight: "160px", overflowY: "auto" }}>
      {fields.map((field, j) => (
        <div
          key={j}
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              color: theme.colors.textMuted,
              fontSize: "10px",
              minWidth: "20px",
              textAlign: "right",
            }}
          >
            {j}
          </span>
          <Mono style={{ fontSize: "10px", wordBreak: "break-all" }}>
            <HexDisplay address={field} abbreviate={false} mode="hex" link={false} />
          </Mono>
        </div>
      ))}
    </div>
  );
}

// ── Private Logs section ──

function PrivateLogsSection({ logs }: { logs: PrivateLogDetail[] }) {
  const { sorted, toggleSort, indicator, sortKey } = useSortableTable(
    logs,
    "index",
  );
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (logs.length === 0) return null;

  return (
    <Collapsible title="Private Logs" count={logs.length} defaultOpen={false}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <SortableHeader
                  active={sortKey === "index"}
                  onClick={() => toggleSort("index")}
                >
                  #{indicator("index")}
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "emittedLength"}
                  onClick={() => toggleSort("emittedLength")}
                >
                  Emitted Length{indicator("emittedLength")}
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((log) => {
                const isExpanded = expandedRows.has(log.index);
                const hasFields = log.fields.length > 0;
                return (
                  <Fragment key={log.index}>
                    <tr>
                      <td>{log.index}</td>
                      <td>
                        {hasFields ? (
                          <CalldataToggle onClick={() => toggle(log.index)}>
                            {log.emittedLength} fields {isExpanded ? "▾" : "▸"}
                          </CalldataToggle>
                        ) : (
                          log.emittedLength.toLocaleString()
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <CalldataCell colSpan={2}>
                          <LogFieldsList fields={log.fields} />
                        </CalldataCell>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>
    </Collapsible>
  );
}

// ── Public Logs section ──

function PublicLogsSection({
  logs,
}: {
  logs: PublicLogDetail[];
}) {
  const { sorted, toggleSort, indicator, sortKey } = useSortableTable(
    logs,
    "index",
  );
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (logs.length === 0) return null;

  return (
    <Collapsible title="Public Logs" count={logs.length} defaultOpen={false}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <SortableHeader
                  active={sortKey === "index"}
                  onClick={() => toggleSort("index")}
                >
                  #{indicator("index")}
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "contractAddress"}
                  onClick={() => toggleSort("contractAddress")}
                >
                  Contract Address{indicator("contractAddress")}
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "emittedLength"}
                  onClick={() => toggleSort("emittedLength")}
                >
                  Fields{indicator("emittedLength")}
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((log) => {
                const isExpanded = expandedRows.has(log.index);
                const hasFields = log.fields.length > 0;
                return (
                  <Fragment key={log.index}>
                    <tr>
                      <td>{log.index}</td>
                      <td>
                        {log.contractAddress ? (
                          <HexDisplay address={log.contractAddress} />
                        ) : (
                          "\u2014"
                        )}
                      </td>
                      <td>
                        {hasFields ? (
                          <CalldataToggle onClick={() => toggle(log.index)}>
                            {log.emittedLength} fields {isExpanded ? "▾" : "▸"}
                          </CalldataToggle>
                        ) : (
                          log.emittedLength.toLocaleString()
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <CalldataCell colSpan={3}>
                          <LogFieldsList fields={log.fields} />
                        </CalldataCell>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>
    </Collapsible>
  );
}

// ── Contract Class Logs section ──

function ContractClassLogsSection({
  logs,
}: {
  logs: ContractClassLogDetail[];
}) {
  const { sorted, toggleSort, indicator, sortKey } = useSortableTable(
    logs,
    "index",
  );
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (logs.length === 0) return null;

  return (
    <Collapsible
      title="Contract Class Logs"
      count={logs.length}
      defaultOpen={false}
    >
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <SortableHeader
                  active={sortKey === "index"}
                  onClick={() => toggleSort("index")}
                >
                  #{indicator("index")}
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "contractAddress"}
                  onClick={() => toggleSort("contractAddress")}
                >
                  Contract Address{indicator("contractAddress")}
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "contractClassId"}
                  onClick={() => toggleSort("contractClassId")}
                >
                  Contract Class ID{indicator("contractClassId")}
                </SortableHeader>
                <SortableHeader
                  active={sortKey === "emittedLength"}
                  onClick={() => toggleSort("emittedLength")}
                >
                  Fields{indicator("emittedLength")}
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((log) => {
                const isExpanded = expandedRows.has(log.index);
                const hasFields = log.fields.length > 0;
                return (
                  <Fragment key={log.index}>
                    <tr>
                      <td>{log.index}</td>
                      <td>
                        {log.contractAddress ? (
                          <HexDisplay address={log.contractAddress} />
                        ) : (
                          "\u2014"
                        )}
                      </td>
                      <td>
                        {log.contractClassId ? (
                          <HexDisplay address={log.contractClassId} link={false} />
                        ) : (
                          "\u2014"
                        )}
                      </td>
                      <td>
                        {hasFields ? (
                          <CalldataToggle onClick={() => toggle(log.index)}>
                            {log.emittedLength} fields {isExpanded ? "▾" : "▸"}
                          </CalldataToggle>
                        ) : (
                          log.emittedLength.toLocaleString()
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <CalldataCell colSpan={4}>
                          <LogFieldsList fields={log.fields} />
                        </CalldataCell>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>
    </Collapsible>
  );
}

// ── Main TxDetail page ──

export function TxDetail() {
  const { hash } = useParams<{ hash: string }>();
  const { selectedNetwork } = useNetworkStore();
  const { data, isLoading, isError } = useTxDetail(selectedNetwork, hash ?? "");
  const { isTracked, add, remove } = useMyTxs();
  const labeledAddresses = useLabeledAddresses();
  const [activeTab, setActiveTab] = useState<"details" | "similar" | "public">(
    "details",
  );
  const [valuesCollapsed, setValuesCollapsed] = useState(
    () => window.innerWidth < 1700,
  );
  const sortedSimilarTxs = useMemo(
    () =>
      data
        ? [...data.similarTxs].sort(
            (a, b) => (b.outlierScore ?? 0) - (a.outlierScore ?? 0),
          )
        : [],
    [data],
  );

  if (isLoading) return <Loading />;

  if (isError || !data) {
    return (
      <PageContainer>
        <Card>
          <SectionTitle>Transaction not found</SectionTitle>
          <p style={{ color: theme.colors.textMuted }}>
            No transaction with hash <Mono>{hash}</Mono> exists on this network.
          </p>
        </Card>
      </PageContainer>
    );
  }

  const {
    tx,
    featureVector,
    noteHashes,
    nullifiers,
    publicCalls,
    privacySet,
    privateLogDetails,
    publicLogDetails,
    contractClassLogDetails,
    publicAddresses,
    feePayerPct,
  } = data;
  const tracked = isTracked(tx.txHash);

  const privacySetPct =
    privacySet && privacySet.totalTxsAnalyzed > 0
      ? (privacySet.clusterSize / privacySet.totalTxsAnalyzed) * 100
      : 0;

  return (
    <PageContainer>
      <Flex justify="space-between" style={{ marginBottom: theme.spacing.md }}>
        <PageTitle style={{ marginBottom: 0 }}>Transaction</PageTitle>
        <Button
          variant={tracked ? "danger" : "primary"}
          onClick={() => (tracked ? remove(tx.txHash) : add(tx.txHash))}
        >
          {tracked ? "Untrack" : "Track as Mine"}
        </Button>
      </Flex>

      {/* ── Overview + Fingerprint side-by-side ── */}
      <TopColumns>
        <TopColumnLeft>
          <Card style={{ flex: 1 }}>
            <Field>
              <FieldLabel>Hash</FieldLabel>
              <FieldValue>
                <HexDisplay address={tx.txHash} link={false} />
              </FieldValue>
            </Field>
            <Flex gap="24px" wrap>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <FieldValue>
                  <StatusBadge status={tx.status} />
                </FieldValue>
              </Field>
              {tx.blockNumber != null && (
                <Field>
                  <FieldLabel>Block</FieldLabel>
                  <FieldValue>{tx.blockNumber.toLocaleString()}</FieldValue>
                </Field>
              )}
              {tx.txIndex != null && (
                <Field>
                  <FieldLabel>Index</FieldLabel>
                  <FieldValue>{tx.txIndex}</FieldValue>
                </Field>
              )}
              {tx.executionResult != null && (
                <Field>
                  <FieldLabel>Execution Result</FieldLabel>
                  <FieldValue>
                    {tx.executionResult === "success" ? (
                      <Badge color={theme.colors.success}>Success</Badge>
                    ) : (
                      <Badge color={theme.colors.danger}>
                        {tx.executionResult.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </FieldValue>
                </Field>
              )}
              {tx.error && (
                <Field>
                  <FieldLabel>Error</FieldLabel>
                  <FieldValue style={{ color: theme.colors.danger }}>
                    {tx.error}
                  </FieldValue>
                </Field>
              )}
              {privacySet ? (
                <>
                  <Field>
                    <FieldLabel>Privacy Set Size</FieldLabel>
                    <FieldValue>
                      <Badge
                        color={
                          privacySet.clusterSize === 1
                            ? theme.colors.danger
                            : privacySet.clusterSize <= 5
                              ? theme.colors.warning
                              : theme.colors.success
                        }
                      >
                        {privacySet.clusterSize === 1
                          ? "1 (unique)"
                          : `${privacySet.clusterSize.toLocaleString()} txs`}
                      </Badge>
                    </FieldValue>
                  </Field>
                  <Field>
                    <FieldLabel>% of Network</FieldLabel>
                    <FieldValue>
                      {privacySetPct < 0.1
                        ? "<0.1%"
                        : `${privacySetPct.toFixed(1)}%`}
                      <span
                        style={{
                          color: theme.colors.textMuted,
                          fontSize: theme.fontSize.xs,
                          marginLeft: "4px",
                        }}
                      >
                        ({privacySet.totalTxsAnalyzed.toLocaleString()} total)
                      </span>
                    </FieldValue>
                  </Field>
                  {privacySet.outlierScore != null && (
                    <Field>
                      <FieldLabel>Outlier Score</FieldLabel>
                      <FieldValue>
                        {(privacySet.outlierScore * 100).toFixed(1)}%
                      </FieldValue>
                    </Field>
                  )}
                </>
              ) : (
                <Field>
                  <FieldLabel>Privacy Set</FieldLabel>
                  <FieldValue>
                    <Badge color={theme.colors.textMuted}>
                      Not yet analyzed
                    </Badge>
                  </FieldValue>
                </Field>
              )}
            </Flex>
            {tx.expirationTimestamp != null && tx.expirationTimestamp !== 0 && (
              <Field>
                <FieldLabel>Expiration</FieldLabel>
                <FieldValue>
                  {new Date(tx.expirationTimestamp * 1000).toLocaleString()}
                  {tx.anchorBlockTimestamp != null &&
                    tx.anchorBlockTimestamp !== 0 && (
                      <span
                        style={{
                          color: theme.colors.textMuted,
                          fontSize: theme.fontSize.xs,
                          marginLeft: "8px",
                        }}
                      >
                        (delta:{" "}
                        {formatDelta(
                          tx.expirationTimestamp - tx.anchorBlockTimestamp,
                        )}
                        )
                      </span>
                    )}
                </FieldValue>
              </Field>
            )}
            <Field>
              <FieldLabel>Fee Payer</FieldLabel>
              <FieldValue>
                <HexDisplay
                  address={tx.feePayer}

                />
                <span
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginLeft: "8px",
                  }}
                >
                  ({feePayerPct < 0.1 ? "<0.1" : feePayerPct.toFixed(1)}% of
                  network txs)
                </span>
              </FieldValue>
            </Field>
            {tx.actualFee && (
              <Field>
                <FieldLabel>Actual Fee</FieldLabel>
                <FieldValue>
                  {Number(tx.actualFee).toLocaleString()} mana
                  {data.feePricingData && (
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>
                      ≈ {formatSmallNumber(data.feePricingData.costUsd)} USD (
                      {formatSmallNumber(data.feePricingData.costEth)} ETH @ $
                      {data.feePricingData.ethUsdPrice.toLocaleString()}/ETH)
                    </span>
                  )}
                </FieldValue>
              </Field>
            )}
          </Card>
        </TopColumnLeft>

        {featureVector && (
          <TopColumnRight>
            <Card style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
              <FieldLabel>Transaction Fingerprint</FieldLabel>
              <ValuesToggle
                collapsed={valuesCollapsed}
                onClick={() => setValuesCollapsed((v) => !v)}
              >
                {valuesCollapsed ? "Show Values \u25B6" : "\u25C0 Hide Values"}
              </ValuesToggle>
              <FingerprintInner>
                <FingerprintChartCol>
                  <SnapshotableFingerprint
                    vector={featureVector}
                    showLabels
                    label={tx.txHash.slice(0, 10)}
                  />
                </FingerprintChartCol>
                <FingerprintValuesCol collapsed={valuesCollapsed}>
                  {FEATURE_LABELS.map((label, i) => (
                    <FeatureRow key={i}>
                      <FeatureName>{label}</FeatureName>
                      <FeatureValue>
                        {i === 14 ? (
                          <HexDisplay address={String(featureVector[i])} mode="label" />
                        ) : typeof featureVector[i] === "number" ? (
                          (featureVector[i] as number).toLocaleString()
                        ) : (
                          String(featureVector[i])
                        )}
                      </FeatureValue>
                    </FeatureRow>
                  ))}
                </FingerprintValuesCol>
              </FingerprintInner>
              <FingerprintValuesMobile>
                <Collapsible title="Raw Values" defaultOpen={false}>
                  {FEATURE_LABELS.map((label, i) => (
                    <FeatureRow key={i}>
                      <FeatureName>{label}</FeatureName>
                      <FeatureValue>
                        {i === 14 ? (
                          <HexDisplay address={String(featureVector[i])} mode="label" />
                        ) : typeof featureVector[i] === "number" ? (
                          (featureVector[i] as number).toLocaleString()
                        ) : (
                          String(featureVector[i])
                        )}
                      </FeatureValue>
                    </FeatureRow>
                  ))}
                </Collapsible>
              </FingerprintValuesMobile>
            </Card>
          </TopColumnRight>
        )}
      </TopColumns>

      {/* ── Tabs: Similar Txs / Tx Effects ── */}
      <TabBar>
        {featureVector && sortedSimilarTxs.length > 0 && (
          <Tab
            active={activeTab === "similar"}
            onClick={() => setActiveTab("similar")}
          >
            Similar Txs ({sortedSimilarTxs.length})
          </Tab>
        )}
        <Tab
          active={activeTab === "details"}
          onClick={() => setActiveTab("details")}
        >
          Tx Effects
        </Tab>
        <Tab
          active={activeTab === "public"}
          onClick={() => setActiveTab("public")}
        >
          Public Activity ({publicAddresses.length + publicCalls.length})
        </Tab>
      </TabBar>

      {activeTab === "details" && (
        <>
          {noteHashes.length > 0 && (
            <Collapsible
              title="Note Hashes"
              count={noteHashes.length}
              defaultOpen={false}
            >
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <TableWrapper>
                  <Table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {noteHashes.map((n) => (
                        <tr key={n.id}>
                          <td>{n.position}</td>
                          <td>
                            <Mono style={{ fontSize: "10px" }}>{n.value}</Mono>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrapper>
              </Card>
            </Collapsible>
          )}
          {nullifiers.length > 0 && (
            <Collapsible
              title="Nullifiers"
              count={nullifiers.length}
              defaultOpen={false}
            >
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <TableWrapper>
                  <Table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nullifiers.map((n) => (
                        <tr key={n.id}>
                          <td>{n.position}</td>
                          <td>
                            <Mono style={{ fontSize: "10px" }}>{n.value}</Mono>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrapper>
              </Card>
            </Collapsible>
          )}
          <SlotTimelines networkId={selectedNetwork} hash={hash ?? ""} />
          {privateLogDetails.length > 0 && (
            <PrivateLogsSection logs={privateLogDetails} />
          )}
          {publicLogDetails.length > 0 && (
            <PublicLogsSection logs={publicLogDetails} />
          )}
          {contractClassLogDetails.length > 0 && (
            <ContractClassLogsSection logs={contractClassLogDetails} />
          )}
        </>
      )}

      {activeTab === "public" && (
        <>
          <PublicAddressesSection
            addresses={publicAddresses}
            feePayer={tx.feePayer}
          />
          {publicCalls.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: theme.fontSize.md,
                  fontWeight: 600,
                  marginBottom: theme.spacing.sm,
                  color: theme.colors.text,
                }}
              >
                Public Calls ({publicCalls.length})
              </h3>
              <PublicCallsSection
                calls={publicCalls}
                labeledAddresses={labeledAddresses}
              />
            </>
          )}
        </>
      )}

      {activeTab === "similar" && featureVector && (
        <SimilarGrid>
          {sortedSimilarTxs.map((stx) => {
            const outlierColor =
              stx.outlierScore != null && stx.outlierScore > 0.5
                ? theme.colors.danger
                : stx.outlierScore != null && stx.outlierScore > 0.2
                  ? theme.colors.warning
                  : theme.colors.success;
            return (
              <SimilarTxCard key={stx.txHash}>
                <SimilarTxHeader>
                  <Link
                    to={`/tx/${stx.txHash}`}
                    style={{
                      color: theme.colors.primary,
                      textDecoration: "none",
                    }}
                  >
                    <Mono style={{ fontSize: "10px" }}>
                      {abbreviateHex(stx.txHash)}
                    </Mono>
                  </Link>
                  <StatusBadge status={stx.status} />
                  {stx.outlierScore != null && (
                    <Badge color={outlierColor} style={{ fontSize: "9px" }}>
                      {(stx.outlierScore * 100).toFixed(1)}%
                    </Badge>
                  )}
                </SimilarTxHeader>
                <FingerprintCompare
                  vectorA={featureVector}
                  vectorB={similarTxToVector(stx)}
                  labelA="This TX"
                  labelB={abbreviateHex(stx.txHash)}
                  compact
                />
              </SimilarTxCard>
            );
          })}
        </SimilarGrid>
      )}
    </PageContainer>
  );
}
