import { useParams, Link } from "react-router-dom";
import styled from "@emotion/styled";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useNetworkStore } from "../stores/network";
import { useTxDetail, useTxGraph } from "../api/hooks";
import { useMyTxs } from "../stores/my-txs";
import { useAddressResolver } from "../hooks/useAddressResolver";
import {
  PageContainer, PageTitle, Card, SectionTitle, Table, Mono, Truncate,
  Loading, Flex, Badge, Button, Grid,
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

// ── Timeline styles ──

const TimelineContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const SlotRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SlotLabel = styled.div`
  font-size: ${theme.fontSize.xs};
  font-weight: 600;
  color: ${theme.colors.text};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const TrackLine = styled.div`
  position: relative;
  height: 32px;
  background: ${theme.colors.bgHover};
  border-radius: ${theme.radius.sm};
  overflow: visible;
`;

const WriteDot = styled(Link)<{ $position: number; $isFocal: boolean }>`
  position: absolute;
  left: ${(p) => p.$position}%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: ${(p) => (p.$isFocal ? 14 : 10)}px;
  height: ${(p) => (p.$isFocal ? 14 : 10)}px;
  border-radius: 50%;
  background: ${(p) => (p.$isFocal ? theme.colors.warning : theme.colors.primary)};
  border: 2px solid ${(p) => (p.$isFocal ? theme.colors.warning : theme.colors.bgCard)};
  cursor: pointer;
  z-index: ${(p) => (p.$isFocal ? 2 : 1)};
  text-decoration: none;

  &:hover {
    transform: translate(-50%, -50%) scale(1.4);
    z-index: 3;
  }
`;

const TooltipBox = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: ${theme.colors.bgCard};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.sm};
  padding: 4px 8px;
  font-size: 10px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  color: ${theme.colors.text};
  z-index: 10;

  ${WriteDot}:hover & {
    opacity: 1;
  }
`;

const BlockRange = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: ${theme.colors.textMuted};
  margin-top: 2px;
  padding: 0 2px;
`;

// ── Slot Timeline subsection ──

function SlotTimelines({ networkId, hash }: { networkId: string; hash: string }) {
  const { data, isLoading } = useTxGraph(networkId, hash);

  if (isLoading) return <Loading />;
  if (!data || data.slots.length === 0) return null;

  return (
    <>
      <SectionTitle style={{ marginTop: theme.spacing.lg }}>
        Storage Slot Activity
      </SectionTitle>
      <p style={{ color: theme.colors.textMuted, marginBottom: theme.spacing.md, fontSize: theme.fontSize.xs }}>
        Each row is a storage slot this transaction writes to. Shared slots show a timeline of all
        transactions that wrote to the same slot; the highlighted dot is this transaction.
      </p>

      <Card>
        <TimelineContainer>
          {data.slots.map((slot) => {
            const isShared = slot.writes.length > 1;
            const blockNumbers = slot.writes.map((w) => w.blockNumber);
            const minBlock = Math.min(...blockNumbers);
            const maxBlock = Math.max(...blockNumbers);
            const range = maxBlock - minBlock || 1;

            const slotName = slot.resolvedContract
              ? `${slot.resolvedContract.label ?? slot.resolvedContract.address.slice(0, 10) + "..."} slot ${slot.resolvedContract.storageSlotIndex}`
              : `${slot.leafSlot.slice(0, 18)}...`;

            return (
              <SlotRow key={slot.leafSlot}>
                <SlotLabel>
                  {slot.resolvedContract && (
                    <Badge color={theme.colors.primary} style={{ fontSize: "10px" }}>
                      {slot.resolvedContract.label ?? slot.resolvedContract.contractType ?? "contract"}
                    </Badge>
                  )}
                  <span>{slotName}</span>
                  {isShared ? (
                    <span style={{ color: theme.colors.warning, fontWeight: 400 }}>
                      ({slot.writes.length} writes — shared)
                    </span>
                  ) : (
                    <span style={{ color: theme.colors.textMuted, fontWeight: 400 }}>
                      (only this tx)
                    </span>
                  )}
                </SlotLabel>
                <TrackLine style={{ opacity: isShared ? 1 : 0.5 }}>
                  {slot.writes.map((w) => {
                    const position = isShared
                      ? ((w.blockNumber - minBlock) / range) * 96 + 2
                      : 50;
                    const timeStr = w.blockTimestamp
                      ? new Date(w.blockTimestamp * 1000).toLocaleString()
                      : `block ${w.blockNumber.toLocaleString()}`;
                    return (
                      <WriteDot
                        key={`${w.txId}-${slot.leafSlot}`}
                        to={w.isFocalTx ? "#" : `/tx/${w.txHash}`}
                        $position={position}
                        $isFocal={w.isFocalTx}
                        onClick={w.isFocalTx ? (e) => e.preventDefault() : undefined}
                      >
                        <TooltipBox>
                          {w.isFocalTx ? "this tx" : w.txHash.slice(0, 14) + "..."}
                          <br />
                          {timeStr}
                        </TooltipBox>
                      </WriteDot>
                    );
                  })}
                </TrackLine>
                {isShared && (
                  <BlockRange>
                    <span>block {minBlock.toLocaleString()}</span>
                    {minBlock !== maxBlock && <span>block {maxBlock.toLocaleString()}</span>}
                  </BlockRange>
                )}
              </SlotRow>
            );
          })}
        </TimelineContainer>
      </Card>
    </>
  );
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

  const { tx, featureVector, noteHashes, nullifiers, publicDataWrites, contractInteractions, privacySet, similarTxs } = data;
  const tracked = isTracked(tx.txHash);

  const shapeBars = [
    { name: "Note Hashes", value: tx.numNoteHashes },
    { name: "Nullifiers", value: tx.numNullifiers },
    { name: "L2→L1 Msgs", value: tx.numL2ToL1Msgs },
    { name: "Public Data Writes", value: tx.numPublicDataWrites },
    { name: "Private Logs", value: tx.numPrivateLogs },
    { name: "Public Logs", value: tx.numPublicLogs },
    { name: "Contract Class Logs", value: tx.numContractClassLogs },
  ];

  const privacySetPct = privacySet && privacySet.totalTxsAnalyzed > 0
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
            <FieldLabel>Block</FieldLabel>
            <FieldValue>{tx.blockNumber.toLocaleString()}</FieldValue>
          </Field>
          <Field>
            <FieldLabel>Index</FieldLabel>
            <FieldValue>{tx.txIndex}</FieldValue>
          </Field>
          <Field>
            <FieldLabel>Revert</FieldLabel>
            <FieldValue>
              {tx.revertCode === 0 ? (
                <Badge color={theme.colors.success}>OK</Badge>
              ) : (
                <Badge color={theme.colors.danger}>Reverted ({tx.revertCode})</Badge>
              )}
            </FieldValue>
          </Field>
          {privacySet ? (
            <>
              <Field>
                <FieldLabel>Privacy Set Size</FieldLabel>
                <FieldValue>
                  <Badge color={
                    privacySet.clusterSize === 1
                      ? theme.colors.danger
                      : privacySet.clusterSize <= 5
                        ? theme.colors.warning
                        : theme.colors.success
                  }>
                    {privacySet.clusterSize === 1
                      ? "1 (unique)"
                      : `${privacySet.clusterSize.toLocaleString()} txs`}
                  </Badge>
                </FieldValue>
              </Field>
              <Field>
                <FieldLabel>% of Network</FieldLabel>
                <FieldValue>
                  {privacySetPct < 0.1 ? "<0.1%" : `${privacySetPct.toFixed(1)}%`}
                  <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginLeft: "4px" }}>
                    ({privacySet.totalTxsAnalyzed.toLocaleString()} total)
                  </span>
                </FieldValue>
              </Field>
              {privacySet.outlierScore != null && (
                <Field>
                  <FieldLabel>Outlier Score</FieldLabel>
                  <FieldValue>{(privacySet.outlierScore * 100).toFixed(1)}%</FieldValue>
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
        {tx.expirationTimestamp != null && (
          <Field>
            <FieldLabel>Expiration</FieldLabel>
            <FieldValue>
              {tx.expirationTimestamp === 0
                ? "None"
                : new Date(tx.expirationTimestamp * 1000).toLocaleString()}
            </FieldValue>
          </Field>
        )}
      </Card>

      <SectionTitle>Transaction Shape</SectionTitle>
      <Card style={{ marginBottom: theme.spacing.md }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={shapeBars}>
            <XAxis dataKey="name" tick={{ fill: theme.colors.textMuted, fontSize: 11 }} />
            <YAxis tick={{ fill: theme.colors.textMuted, fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: theme.colors.bgCard, border: `1px solid ${theme.colors.border}` }}
              labelStyle={{ color: theme.colors.text }}
            />
            <Bar dataKey="value" fill={theme.colors.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Grid columns={2}>
        {nullifiers.length > 0 && (
          <div>
            <SectionTitle>Nullifiers ({nullifiers.length})</SectionTitle>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <Table>
                <thead><tr><th>#</th><th>Value</th></tr></thead>
                <tbody>
                  {nullifiers.map((n) => (
                    <tr key={n.id}>
                      <td>{n.position}</td>
                      <td><Mono style={{ fontSize: "10px" }}>{n.value}</Mono></td>
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
                <thead><tr><th>#</th><th>Value</th></tr></thead>
                <tbody>
                  {noteHashes.map((n) => (
                    <tr key={n.id}>
                      <td>{n.position}</td>
                      <td><Mono style={{ fontSize: "10px" }}>{n.value}</Mono></td>
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
              <thead><tr><th>#</th><th>Leaf Slot</th><th>Contract</th><th>Value</th></tr></thead>
              <tbody>
                {publicDataWrites.map((w) => (
                  <tr key={w.id}>
                    <td>{w.position}</td>
                    <td><Mono style={{ fontSize: "10px" }}>{w.leafSlot}</Mono></td>
                    <td>
                      {w.resolvedContract ? (
                        <span style={{ fontSize: theme.fontSize.xs }}>
                          <Badge color={theme.colors.primary}>
                            {w.resolvedContract.label ?? w.resolvedContract.address.slice(0, 10) + "..."}
                          </Badge>
                          {" "}
                          <span style={{ color: theme.colors.textMuted }}>
                            slot {w.resolvedContract.storageSlotIndex}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>unknown</span>
                      )}
                    </td>
                    <td><Mono style={{ fontSize: "10px" }}>{w.value}</Mono></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {contractInteractions.length > 0 && (
        <>
          <SectionTitle style={{ marginTop: theme.spacing.lg }}>
            Contract Interactions ({contractInteractions.length})
          </SectionTitle>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <Table>
              <thead>
                <tr><th>Contract</th><th>Source</th><th>Label</th></tr>
              </thead>
              <tbody>
                {contractInteractions.map((ci) => (
                  <tr key={ci.id}>
                    <td>
                      <Mono style={{ fontSize: "10px" }}>
                        {ci.label ? (
                          <>
                            <Badge color={theme.colors.primary}>{ci.label}</Badge>
                            {" "}
                            <span style={{ color: theme.colors.textMuted }}>{ci.contractAddress.slice(0, 18)}...</span>
                          </>
                        ) : (
                          ci.contractAddress
                        )}
                      </Mono>
                    </td>
                    <td>
                      <Badge color={
                        ci.source === "public_log"
                          ? theme.colors.accent
                          : ci.source === "contract_class_log"
                            ? theme.colors.warning
                            : theme.colors.textMuted
                      }>
                        {ci.source.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td>
                      <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                        {ci.contractType ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      <SlotTimelines networkId={selectedNetwork} hash={hash ?? ""} />

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
                      <Link to={`/tx/${stx.txHash}`} style={{ color: theme.colors.primary, textDecoration: "none" }}>
                        <Truncate>{stx.txHash}</Truncate>
                      </Link>
                    </td>
                    <td>{stx.blockNumber.toLocaleString()}</td>
                    <td>{stx.numNoteHashes}</td>
                    <td>{stx.numNullifiers}</td>
                    <td>{stx.numPublicDataWrites}</td>
                    <td>{stx.feePayer ? resolveAddress(stx.feePayer) : "—"}</td>
                    <td>{stx.outlierScore != null ? `${(stx.outlierScore * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {featureVector && (
        <>
          <SectionTitle style={{ marginTop: theme.spacing.lg }}>Feature Vector</SectionTitle>
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
