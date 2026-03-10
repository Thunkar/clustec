import { useState, useMemo, Fragment } from "react";
import { useParams, Link } from "react-router-dom";
import styled from "@emotion/styled";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useNetworkStore } from "../stores/network";
import { useTxDetail, useTxGraph } from "../api/hooks";
import { useMyTxs } from "../stores/my-txs";
import { useAddressResolver } from "../hooks/useAddressResolver";
import type { PrivateLogDetail, ContractClassLogDetail, PublicAddress } from "../lib/api";
import { TxTable } from "../components/TxTable";
import {
  PageContainer,
  PageTitle,
  Card,
  SectionTitle,
  Table,
  TableWrapper,
  Mono,
  Truncate,
  Loading,
  Flex,
  Badge,
  Button,
  Grid,
} from "../components/ui";
import { theme } from "../lib/theme";

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
  min-width: 140px;
  flex-shrink: 0;
`;

const HTimeline = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  flex: 1;
  min-width: 0;
  height: 28px;
`;

const HTimelineLine = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 2px;
  background: ${theme.colors.border};
  transform: translateY(-50%);
`;

const HTimelineDot = styled.div<{ isFocal?: boolean }>`
  width: ${(p) => (p.isFocal ? "14px" : "10px")};
  height: ${(p) => (p.isFocal ? "14px" : "10px")};
  border-radius: 50%;
  background: ${(p) => (p.isFocal ? theme.colors.warning : theme.colors.primary)};
  border: 2px solid ${(p) => (p.isFocal ? theme.colors.warning : theme.colors.bgCard)};
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
  cursor: ${(p) => (p.isFocal ? "default" : "pointer")};

  &:hover {
    transform: translate(-50%, -50%) scale(1.3);
  }
`;

const DotTooltip = styled.div`
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: ${theme.colors.bgCard};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.md};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-size: ${theme.fontSize.xs};
  white-space: nowrap;
  z-index: 10;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
`;

const SlotRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.xs} 0;

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

/** Format a seconds delta as a human-readable string (e.g. "24h 0m") */
function formatDelta(seconds: number): string {
  if (seconds < 0) return `-${formatDelta(-seconds)}`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

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
`;

const FeatureValue = styled(Mono)`
  font-size: ${theme.fontSize.sm};
`;

// ── Sortable table helper ──

type SortDir = "asc" | "desc";

function useSortableTable<T>(data: T[], defaultKey: keyof T & string, defaultDir: SortDir = "asc") {
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

// ── Slot Timeline subsection ──

function TimelineDotWithTooltip({
  write,
  positionPct,
}: {
  write: { txId: number; txHash: string; blockNumber: number | null; isFocalTx: boolean };
  positionPct: number;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: "absolute", left: `${positionPct}%`, top: 0, bottom: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {write.isFocalTx ? (
        <HTimelineDot isFocal style={{ left: "50%" }} />
      ) : (
        <Link to={`/tx/${write.txHash}`} style={{ textDecoration: "none" }}>
          <HTimelineDot style={{ left: "50%" }} />
        </Link>
      )}
      {hovered && (
        <DotTooltip>
          {write.isFocalTx ? (
            <span style={{ color: theme.colors.warning, fontWeight: "bold" }}>This tx</span>
          ) : (
            <Mono>{write.txHash.slice(0, 14)}...</Mono>
          )}
          <span style={{ color: theme.colors.textMuted, marginLeft: "6px" }}>
            {write.blockNumber != null ? `Block ${write.blockNumber.toLocaleString()}` : "Pending"}
          </span>
        </DotTooltip>
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

  if (isLoading) return <Loading />;
  if (!data || data.slots.length === 0) return null;

  const sharedSlots = data.slots.filter((s) => s.writes.length > 1);
  if (sharedSlots.length === 0) return null;

  // Compute global block range across all slots for consistent positioning
  const allBlocks = data.slots
    .flatMap((s) => s.writes)
    .map((w) => w.blockNumber)
    .filter((b): b is number => b != null);
  const minBlock = Math.min(...allBlocks);
  const maxBlock = Math.max(...allBlocks);
  const blockRange = maxBlock - minBlock || 1;

  return (
    <>
      <SectionTitle style={{ marginTop: theme.spacing.lg }}>
        Shared Storage Slot Timelines
      </SectionTitle>
      <p
        style={{
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.md,
          fontSize: theme.fontSize.xs,
        }}
      >
        Each row is a storage slot. Dots are transactions writing to that slot, ordered by block number.
        <span style={{ color: theme.colors.warning, fontWeight: "bold" }}> Highlighted</span> = this transaction.
      </p>

      <Card style={{ padding: theme.spacing.md }}>
        {sharedSlots.map((slot) => (
          <SlotRow key={slot.leafSlot}>
            <SlotLabel>
              {slot.resolvedContract ? (
                <>
                  <Badge color={theme.colors.primary} style={{ fontSize: "10px" }}>
                    {slot.resolvedContract.label ??
                      slot.resolvedContract.address.slice(0, 10) + "..."}
                  </Badge>{" "}
                  <span style={{ color: theme.colors.textMuted }}>
                    [{slot.resolvedContract.storageSlotIndex}]
                  </span>
                </>
              ) : (
                <Mono style={{ fontSize: "10px" }}>
                  {slot.leafSlot.slice(0, 14)}...
                </Mono>
              )}
            </SlotLabel>
            <HTimeline>
              <HTimelineLine />
              {slot.writes.map((w, i) => {
                const pct = w.blockNumber != null
                  ? ((w.blockNumber - minBlock) / blockRange) * 90 + 5
                  : 95;
                return (
                  <TimelineDotWithTooltip
                    key={`${w.txId}-${i}`}
                    write={w}
                    positionPct={pct}
                  />
                );
              })}
            </HTimeline>
            <Badge color={theme.colors.accent} style={{ flexShrink: 0 }}>
              {slot.writes.length}
            </Badge>
          </SlotRow>
        ))}
      </Card>
    </>
  );
}

// ── Public Calls with inline calldata ──

function PublicCallsSection({
  calls,
  resolveAddress,
}: {
  calls: { phase: string; contractAddress: string; functionSelector: string | null; msgSender: string | null; calldataSize: number; calldata: string[]; isStaticCall: boolean; label: string | null; contractType: string | null }[];
  resolveAddress: (addr: string) => string;
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
    <>
      <SectionTitle>Public Calls ({calls.length})</SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: theme.spacing.md }}>
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
                c.phase === "setup" ? theme.colors.accent
                : c.phase === "teardown" ? theme.colors.warning
                : theme.colors.primary;
              const hasCalldata = c.calldata.length > 0;
              const isExpanded = expandedRows.has(i);
              return (
                <Fragment key={i}>
                  <tr>
                    <td><Badge color={phaseColor}>{c.phase}</Badge></td>
                    <td>
                      <Mono style={{ fontSize: "10px" }}>
                        {c.label ? (
                          <>
                            <Badge color={theme.colors.primary}>{c.label}</Badge>
                            {" "}
                            <span style={{ color: theme.colors.textMuted }}>
                              {c.contractAddress.slice(0, 14)}...
                            </span>
                          </>
                        ) : (
                          c.contractAddress.slice(0, 18) + "..."
                        )}
                      </Mono>
                    </td>
                    <td>
                      <Mono style={{ fontSize: "10px" }}>
                        {c.functionSelector ?? "\u2014"}
                      </Mono>
                    </td>
                    <td>
                      <Mono style={{ fontSize: "10px" }}>
                        {c.msgSender ? resolveAddress(c.msgSender) : "\u2014"}
                      </Mono>
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
                            const resolved = resolveAddress(field);
                            const isKnown = resolved !== field;
                            return (
                              <div key={j} style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                                <span style={{ color: theme.colors.textMuted, fontSize: "10px", minWidth: "20px", textAlign: "right" }}>
                                  {j}
                                </span>
                                <Mono style={{ fontSize: "10px", wordBreak: "break-all" }}>
                                  {isKnown ? (
                                    <>
                                      <Badge color={theme.colors.accent} style={{ fontSize: "9px" }}>addr</Badge>
                                      {" "}{resolved}
                                    </>
                                  ) : (
                                    field
                                  )}
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
    </>
  );
}

// ── Status badge helper ──

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "finalized" ? theme.colors.success
    : status === "proven" ? theme.colors.success
    : status === "checkpointed" ? theme.colors.accent
    : status === "proposed" ? theme.colors.accent
    : status === "dropped" ? theme.colors.danger
    : theme.colors.warning;
  return <Badge color={color}>{status}</Badge>;
}

// ── Main TxDetail page ──

export function TxDetail() {
  const { hash } = useParams<{ hash: string }>();
  const { selectedNetwork } = useNetworkStore();
  const { data, isLoading, isError } = useTxDetail(selectedNetwork, hash ?? "");
  const { isTracked, add, remove } = useMyTxs();
  const resolveAddress = useAddressResolver();

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
    publicDataWrites,
    publicCalls,
    privacySet,
    similarTxs,
    privateLogDetails,
    contractClassLogDetails,
    publicAddresses,
    feePayerPct,
  } = data;
  const tracked = isTracked(tx.txHash);

  const shapeBars = [
    { name: "Note Hashes", value: tx.numNoteHashes },
    { name: "Nullifiers", value: tx.numNullifiers },
    { name: "L2\u21921 Messages", value: tx.numL2ToL1Msgs },
    { name: "Private Logs", value: tx.numPrivateLogs },
    { name: "Contract Class Logs", value: tx.numContractClassLogs },
    { name: "Public Data Writes", value: tx.numPublicDataWrites ?? 0 },
    { name: "Public Logs", value: tx.numPublicLogs ?? 0 },
    { name: "Setup Calls", value: tx.numSetupCalls },
    { name: "App Calls", value: tx.numAppCalls },
    { name: "Teardown", value: tx.hasTeardown ? 1 : 0 },
    { name: "Public Calldata", value: tx.totalPublicCalldataSize },
  ];

  const privacySetPct =
    privacySet && privacySet.totalTxsAnalyzed > 0
      ? (privacySet.clusterSize / privacySet.totalTxsAnalyzed) * 100
      : 0;

  return (
    <PageContainer>
      <Flex justify="space-between">
        <PageTitle>Transaction</PageTitle>
        <Button
          variant={tracked ? "danger" : "primary"}
          onClick={() => (tracked ? remove(tx.txHash) : add(tx.txHash))}
        >
          {tracked ? "Untrack" : "Track as Mine"}
        </Button>
      </Flex>

      <Card style={{ marginBottom: theme.spacing.md }}>
        <Field>
          <FieldLabel>Hash</FieldLabel>
          <FieldValue>{tx.txHash}</FieldValue>
        </Field>
        <Flex gap="24px" wrap>
          <Field>
            <FieldLabel>Status</FieldLabel>
            <FieldValue><StatusBadge status={tx.status} /></FieldValue>
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
              <FieldValue style={{ color: theme.colors.danger }}>{tx.error}</FieldValue>
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
                <Badge color={theme.colors.textMuted}>Not yet analyzed</Badge>
              </FieldValue>
            </Field>
          )}
        </Flex>
        <Field>
          <FieldLabel>Fee Payer</FieldLabel>
          <FieldValue>
            {resolveAddress(tx.feePayer)}
            <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginLeft: "8px" }}>
              ({feePayerPct < 0.1 ? "<0.1" : feePayerPct.toFixed(1)}% of network txs)
            </span>
          </FieldValue>
        </Field>
        {tx.actualFee && (
          <Field>
            <FieldLabel>Actual Fee</FieldLabel>
            <FieldValue>{Number(tx.actualFee).toLocaleString()} mana</FieldValue>
          </Field>
        )}
        {tx.expirationTimestamp != null && tx.expirationTimestamp !== 0 && (
          <Field>
            <FieldLabel>Expiration</FieldLabel>
            <FieldValue>
              {new Date(tx.expirationTimestamp * 1000).toLocaleString()}
              {tx.anchorBlockTimestamp != null && tx.anchorBlockTimestamp !== 0 && (
                <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginLeft: "8px" }}>
                  (delta: {formatDelta(tx.expirationTimestamp - tx.anchorBlockTimestamp)})
                </span>
              )}
            </FieldValue>
          </Field>
        )}
      </Card>

      {/* Gas Settings */}
      {(tx.gasLimitDa || tx.gasLimitL2 || tx.maxFeePerDaGas || tx.maxFeePerL2Gas) && (
        <>
          <SectionTitle>Gas Settings</SectionTitle>
          <Card style={{ marginBottom: theme.spacing.md }}>
            <Flex gap="24px" wrap>
              {tx.gasLimitDa != null && (
                <Field>
                  <FieldLabel>Gas Limit (DA)</FieldLabel>
                  <FieldValue>{tx.gasLimitDa.toLocaleString()}</FieldValue>
                </Field>
              )}
              {tx.gasLimitL2 != null && (
                <Field>
                  <FieldLabel>Gas Limit (L2)</FieldLabel>
                  <FieldValue>{tx.gasLimitL2.toLocaleString()}</FieldValue>
                </Field>
              )}
              {tx.maxFeePerDaGas != null && (
                <Field>
                  <FieldLabel>Max Fee/DA Gas</FieldLabel>
                  <FieldValue>{tx.maxFeePerDaGas.toLocaleString()}</FieldValue>
                </Field>
              )}
              {tx.maxFeePerL2Gas != null && (
                <Field>
                  <FieldLabel>Max Fee/L2 Gas</FieldLabel>
                  <FieldValue>{tx.maxFeePerL2Gas.toLocaleString()}</FieldValue>
                </Field>
              )}
            </Flex>
          </Card>
        </>
      )}

      {/* Public Calls */}
      {publicCalls.length > 0 && <PublicCallsSection calls={publicCalls} resolveAddress={resolveAddress} />}

      <SectionTitle>Transaction Shape</SectionTitle>
      <Card style={{ marginBottom: theme.spacing.md }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={shapeBars}>
            <XAxis
              dataKey="name"
              tick={{ fill: theme.colors.textMuted, fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: theme.colors.textMuted, fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: theme.colors.bgCard,
                border: `1px solid ${theme.colors.border}`,
              }}
              labelStyle={{ color: theme.colors.text }}
            />
            <Bar
              dataKey="value"
              fill={theme.colors.primary}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Grid columns={2}>
        {nullifiers.length > 0 && (
          <div>
            <SectionTitle>Nullifiers ({nullifiers.length})</SectionTitle>
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
          </div>
        )}
        {noteHashes.length > 0 && (
          <div>
            <SectionTitle>Note Hashes ({noteHashes.length})</SectionTitle>
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
          </div>
        )}
      </Grid>

      {publicDataWrites.length > 0 && (
        <>
          <SectionTitle style={{ marginTop: theme.spacing.lg }}>
            Public Data Writes ({publicDataWrites.length})
          </SectionTitle>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Leaf Slot</th>
                  <th>Contract</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {publicDataWrites.map((w) => (
                  <tr key={w.id}>
                    <td>{w.position}</td>
                    <td>
                      <Mono style={{ fontSize: "10px" }}>{w.leafSlot}</Mono>
                    </td>
                    <td>
                      {w.resolvedContract ? (
                        <span style={{ fontSize: theme.fontSize.xs }}>
                          <Badge color={theme.colors.primary}>
                            {w.resolvedContract.label ??
                              w.resolvedContract.address.slice(0, 10) + "..."}
                          </Badge>{" "}
                          <span style={{ color: theme.colors.textMuted }}>
                            slot {w.resolvedContract.storageSlotIndex}
                          </span>
                        </span>
                      ) : (
                        <span
                          style={{
                            color: theme.colors.textMuted,
                            fontSize: theme.fontSize.xs,
                          }}
                        >
                          unknown
                        </span>
                      )}
                    </td>
                    <td>
                      <Mono style={{ fontSize: "10px" }}>{w.value}</Mono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            </TableWrapper>
          </Card>
        </>
      )}

      <SlotTimelines
        networkId={selectedNetwork}
        hash={hash ?? ""}
      />

      {similarTxs.length > 0 && (
        <>
          <SectionTitle style={{ marginTop: theme.spacing.lg }}>
            Similar Transactions ({similarTxs.length})
          </SectionTitle>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <TxTable
              rows={similarTxs}
              resolveAddress={resolveAddress}
              showOutlierScore
            />
          </Card>
        </>
      )}

      {/* Publicly Visible Addresses */}
      <PublicAddressesSection addresses={publicAddresses} resolveAddress={resolveAddress} feePayer={tx.feePayer} />

      {/* Private Logs */}
      <PrivateLogsSection logs={privateLogDetails} />

      {/* Contract Class Logs */}
      <ContractClassLogsSection logs={contractClassLogDetails} resolveAddress={resolveAddress} />

      {/* Feature Vector (labeled) */}
      {featureVector && (
        <>
          <SectionTitle style={{ marginTop: theme.spacing.lg }}>
            Feature Vector
          </SectionTitle>
          <Card>
            {FEATURE_LABELS.map((label, i) => (
              <FeatureRow key={i}>
                <FeatureName>{label}</FeatureName>
                <FeatureValue>
                  {i === 14
                    ? resolveAddress(String(featureVector[i]))
                    : typeof featureVector[i] === "number"
                      ? (featureVector[i] as number).toLocaleString()
                      : String(featureVector[i])}
                </FeatureValue>
              </FeatureRow>
            ))}
          </Card>
        </>
      )}
    </PageContainer>
  );
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
  resolveAddress,
  feePayer,
}: {
  addresses: PublicAddress[];
  resolveAddress: (addr: string) => string;
  feePayer: string;
}) {
  const { sorted, toggleSort, indicator, sortKey } = useSortableTable(addresses, "source");

  if (addresses.length === 0) return null;

  return (
    <>
      <SectionTitle style={{ marginTop: theme.spacing.lg }}>
        Publicly Visible Addresses ({addresses.length})
      </SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: theme.spacing.md }}>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <SortableHeader active={sortKey === "address"} onClick={() => toggleSort("address")}>
                  Address{indicator("address")}
                </SortableHeader>
                <SortableHeader active={sortKey === "source"} onClick={() => toggleSort("source")}>
                  Source{indicator("source")}
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => {
                const isFeePayer = a.address.toLowerCase() === feePayer.toLowerCase();
                return (
                  <tr key={i} style={isFeePayer ? { background: "rgba(255, 198, 108, 0.08)" } : undefined}>
                    <td>
                      <Mono style={{ fontSize: "10px" }}>
                        {resolveAddress(a.address)}
                      </Mono>
                    </td>
                    <td>
                      <Mono style={{ fontSize: "10px", color: isFeePayer ? theme.colors.warning : theme.colors.textMuted }}>
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

// ── Private Logs section ──

function PrivateLogsSection({ logs }: { logs: PrivateLogDetail[] }) {
  const { sorted, toggleSort, indicator, sortKey } = useSortableTable(logs, "index");

  if (logs.length === 0) return null;

  return (
    <>
      <SectionTitle style={{ marginTop: theme.spacing.lg }}>
        Private Logs ({logs.length})
      </SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: theme.spacing.md }}>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <SortableHeader active={sortKey === "index"} onClick={() => toggleSort("index")}>
                  #{indicator("index")}
                </SortableHeader>
                <SortableHeader active={sortKey === "emittedLength"} onClick={() => toggleSort("emittedLength")}>
                  Emitted Length{indicator("emittedLength")}
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((log) => (
                <tr key={log.index}>
                  <td>{log.index}</td>
                  <td>{log.emittedLength.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>
    </>
  );
}

// ── Contract Class Logs section ──

function ContractClassLogsSection({
  logs,
  resolveAddress,
}: {
  logs: ContractClassLogDetail[];
  resolveAddress: (addr: string) => string;
}) {
  const { sorted, toggleSort, indicator, sortKey } = useSortableTable(logs, "index");

  if (logs.length === 0) return null;

  return (
    <>
      <SectionTitle style={{ marginTop: theme.spacing.lg }}>
        Contract Class Logs ({logs.length})
      </SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: theme.spacing.md }}>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <SortableHeader active={sortKey === "index"} onClick={() => toggleSort("index")}>
                  #{indicator("index")}
                </SortableHeader>
                <SortableHeader active={sortKey === "contractAddress"} onClick={() => toggleSort("contractAddress")}>
                  Contract Address{indicator("contractAddress")}
                </SortableHeader>
                <SortableHeader active={sortKey === "contractClassId"} onClick={() => toggleSort("contractClassId")}>
                  Contract Class ID{indicator("contractClassId")}
                </SortableHeader>
                <SortableHeader active={sortKey === "emittedLength"} onClick={() => toggleSort("emittedLength")}>
                  Emitted Length{indicator("emittedLength")}
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((log) => (
                <tr key={log.index}>
                  <td>{log.index}</td>
                  <td>
                    <Mono style={{ fontSize: "10px" }}>
                      {log.contractAddress ? resolveAddress(log.contractAddress) : "\u2014"}
                    </Mono>
                  </td>
                  <td>
                    <Mono style={{ fontSize: "10px" }}>
                      {log.contractClassId
                        ? `${log.contractClassId.slice(0, 18)}...`
                        : "\u2014"}
                    </Mono>
                  </td>
                  <td>{log.emittedLength.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>
    </>
  );
}
