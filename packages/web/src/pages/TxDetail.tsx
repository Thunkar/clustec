import { useState, Fragment } from "react";
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
import {
  PageContainer,
  PageTitle,
  Card,
  SectionTitle,
  Table,
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
      </Card>
    </>
  );
}

// ── Status badge helper ──

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "finalized" ? theme.colors.success
    : status === "mined" ? theme.colors.accent
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
        <Flex gap="48px">
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
          {tx.revertCode != null && (
            <Field>
              <FieldLabel>Revert</FieldLabel>
              <FieldValue>
                {tx.revertCode === 0 ? (
                  <Badge color={theme.colors.success}>OK</Badge>
                ) : (
                  <Badge color={theme.colors.danger}>
                    Reverted ({tx.revertCode})
                  </Badge>
                )}
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
                <Badge color={theme.colors.textMuted}>Not yet analyzed</Badge>
              </FieldValue>
            </Field>
          )}
        </Flex>
        {tx.feePayer && (
          <Field>
            <FieldLabel>Fee Payer</FieldLabel>
            <FieldValue>{resolveAddress(tx.feePayer)}</FieldValue>
          </Field>
        )}
        {tx.actualFee && (
          <Field>
            <FieldLabel>Actual Fee</FieldLabel>
            <FieldValue>{tx.actualFee}</FieldValue>
          </Field>
        )}
        {tx.expirationTimestamp != null && tx.expirationTimestamp !== 0 && (
          <Field>
            <FieldLabel>Expiration</FieldLabel>
            <FieldValue>
              {new Date(tx.expirationTimestamp * 1000).toLocaleString()}
            </FieldValue>
          </Field>
        )}
      </Card>

      {/* Gas Settings */}
      {(tx.gasLimitDa || tx.gasLimitL2 || tx.maxFeePerDaGas || tx.maxFeePerL2Gas) && (
        <>
          <SectionTitle>Gas Settings</SectionTitle>
          <Card style={{ marginBottom: theme.spacing.md }}>
            <Flex gap="48px">
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
            </Card>
          </div>
        )}
        {noteHashes.length > 0 && (
          <div>
            <SectionTitle>Note Hashes ({noteHashes.length})</SectionTitle>
            <Card style={{ padding: 0, overflow: "hidden" }}>
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
            <Table>
              <thead>
                <tr>
                  <th>Hash</th>
                  <th>Status</th>
                  <th>Block</th>
                  <th>Note Hashes</th>
                  <th>Nullifiers</th>
                  <th>Public Data Writes</th>
                  <th>Fee Payer</th>
                  <th>Outlier Score</th>
                </tr>
              </thead>
              <tbody>
                {similarTxs.map((stx) => (
                  <tr key={stx.txHash}>
                    <td>
                      <Link
                        to={`/tx/${stx.txHash}`}
                        style={{
                          color: theme.colors.primary,
                          textDecoration: "none",
                        }}
                      >
                        <Truncate>{stx.txHash}</Truncate>
                      </Link>
                    </td>
                    <td><StatusBadge status={stx.status} /></td>
                    <td>{stx.blockNumber != null ? stx.blockNumber.toLocaleString() : "\u2014"}</td>
                    <td>{stx.numNoteHashes}</td>
                    <td>{stx.numNullifiers}</td>
                    <td>{stx.numPublicDataWrites ?? "\u2014"}</td>
                    <td>{stx.feePayer ? resolveAddress(stx.feePayer) : "\u2014"}</td>
                    <td>
                      {stx.outlierScore != null
                        ? `${(stx.outlierScore * 100).toFixed(1)}%`
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {featureVector && (
        <>
          <SectionTitle style={{ marginTop: theme.spacing.lg }}>
            Feature Vector
          </SectionTitle>
          <Card>
            <Mono style={{ fontSize: "11px", wordBreak: "break-all" }}>
              [{featureVector.join(", ")}]
            </Mono>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
