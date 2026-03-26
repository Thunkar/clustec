import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import styled from "@emotion/styled";
import { useNetworkStore } from "../stores/network";
import { useMurderBoard } from "../api/hooks";
import {
  PageContainer,
  PageTitle,
  Card,
  Loading,
  Badge,
  Table,
  TableWrapper,
  Input,
  Button,
  Flex,
  StatCard,
  StatValue,
  StatLabel,
  Grid,
  SectionTitle,
} from "../components/ui";
import { HexDisplay } from "../components/HexDisplay";
import { theme } from "../lib/theme";
import type { MurderBoardData, PrivacyScoreFactor } from "../lib/api";

// ── Styled components ──

const SearchBar = styled.form`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
`;

const AddressInput = styled(Input)`
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: ${theme.fontSize.sm};
`;

const ScoreGauge = styled.div<{ score: number }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${theme.fontSize.xl};
  font-weight: 800;
  color: ${(p) =>
    p.score >= 60
      ? theme.colors.success
      : p.score >= 30
        ? theme.colors.warning
        : theme.colors.danger};
  background: ${(p) =>
    p.score >= 60
      ? `${theme.colors.success}18`
      : p.score >= 30
        ? `${theme.colors.warning}18`
        : `${theme.colors.danger}18`};
  border: 3px solid
    ${(p) =>
      p.score >= 60
        ? theme.colors.success
        : p.score >= 30
          ? theme.colors.warning
          : theme.colors.danger};
  flex-shrink: 0;
`;

const FactorRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${theme.spacing.sm};
  font-size: ${theme.fontSize.sm};
  line-height: 1.6;
`;

const RoleBadge = styled(Badge)`
  font-size: 9px;
  padding: 1px 5px;
`;

const TxLink = styled(Link)`
  color: ${theme.colors.primary};
  text-decoration: none;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: ${theme.fontSize.xs};
  &:hover {
    text-decoration: underline;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.textMuted};
  font-size: ${theme.fontSize.md};
`;

// ── Helpers ──

function scoreLabel(score: number): string {
  if (score >= 70) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

function impactColor(impact: PrivacyScoreFactor["impact"]): string {
  return impact === "good"
    ? theme.colors.success
    : impact === "bad"
      ? theme.colors.danger
      : theme.colors.textMuted;
}

function impactIcon(impact: PrivacyScoreFactor["impact"]): string {
  return impact === "good" ? "+" : impact === "bad" ? "-" : "~";
}

// ── Component ──

export function MurderBoard() {
  const { selectedNetwork } = useNetworkStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const addressParam = searchParams.get("address") ?? "";
  const [inputValue, setInputValue] = useState(addressParam);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMurderBoard(selectedNetwork, addressParam, page);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) {
      setPage(1);
      setSearchParams({ address: trimmed });
    }
  };

  return (
    <PageContainer>
      <PageTitle>Murder Board</PageTitle>

      <SearchBar onSubmit={handleSubmit}>
        <AddressInput
          placeholder="Enter an Aztec address (0x...)..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <Button type="submit" disabled={!inputValue.trim()}>
          Investigate
        </Button>
      </SearchBar>

      {!addressParam && (
        <EmptyState>
          Enter an address to analyze its public activity fingerprint and privacy exposure.
        </EmptyState>
      )}

      {addressParam && isLoading && <Loading />}

      {addressParam && data && <MurderBoardResults data={data} page={page} onPageChange={setPage} />}
    </PageContainer>
  );
}

function MurderBoardResults({
  data,
  page,
  onPageChange,
}: {
  data: MurderBoardData;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const [txSort, setTxSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "blockNumber",
    dir: "desc",
  });

  const sortedTxs = useMemo(() => {
    const txs = [...data.transactions];
    const { key, dir } = txSort;
    txs.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key];
      const bv = (b as unknown as Record<string, unknown>)[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
    return txs;
  }, [data.transactions, txSort]);

  const toggleSort = (key: string) => {
    setTxSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  };

  if (data.totalTxs === 0) {
    return (
      <EmptyState>
        No public activity found for this address on this network.
      </EmptyState>
    );
  }

  return (
    <>
      {/* Summary row */}
      <Flex gap={theme.spacing.md} align="stretch" wrap style={{ marginBottom: theme.spacing.md }}>
        {/* Privacy score */}
        {data.privacyScore && (
          <Card style={{ flex: "0 0 auto", display: "flex", gap: theme.spacing.md, alignItems: "center" }}>
            <ScoreGauge score={data.privacyScore.score}>
              {data.privacyScore.score}
            </ScoreGauge>
            <div>
              <div style={{ fontWeight: 700, fontSize: theme.fontSize.md, marginBottom: 4 }}>
                Privacy: {scoreLabel(data.privacyScore.score)}
              </div>
              {data.privacyScore.factors.map((f, i) => (
                <FactorRow key={i}>
                  <span style={{ color: impactColor(f.impact), fontWeight: 700, minWidth: 12 }}>
                    {impactIcon(f.impact)}
                  </span>
                  <span style={{ color: theme.colors.textMuted }}>{f.detail}</span>
                </FactorRow>
              ))}
            </div>
          </Card>
        )}

        {/* Stats */}
        <Grid columns={2} style={{ flex: 1 }}>
          <StatCard>
            <StatValue>{data.totalTxs}</StatValue>
            <StatLabel>Transactions</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>{data.clusters.length}</StatValue>
            <StatLabel>Clusters touched</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>{data.fpcsUsed.length}</StatValue>
            <StatLabel>Fee payers used</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>{data.contractsInteracted.length}</StatValue>
            <StatLabel>Contracts</StatLabel>
          </StatCard>
        </Grid>
      </Flex>

      {/* Cluster distribution */}
      {data.clusters.length > 0 && (
        <>
          <SectionTitle>Cluster Distribution</SectionTitle>
          <Card style={{ marginBottom: theme.spacing.md }}>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <th>Cluster</th>
                    <th>Privacy Set Size</th>
                    <th>Your Txs</th>
                    <th>Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clusters.map((c) => {
                    const pct =
                      c.clusterSize > 0
                        ? ((c.txCount / c.clusterSize) * 100).toFixed(1)
                        : "—";
                    return (
                      <tr key={c.clusterId}>
                        <td>
                          {c.clusterId === -1 ? (
                            data.latestRunId != null ? (
                              <Link to={`/privacy-sets?cluster=${c.clusterId}`}>
                                <Badge color={theme.colors.danger}>Outlier</Badge>
                              </Link>
                            ) : (
                              <Badge color={theme.colors.danger}>Outlier</Badge>
                            )
                          ) : data.latestRunId != null ? (
                            <Link to={`/privacy-sets?cluster=${c.clusterId}`}>
                              <Badge color={theme.colors.cluster[c.clusterId % theme.colors.cluster.length]}>
                                #{c.clusterId}
                              </Badge>
                            </Link>
                          ) : (
                            <Badge color={theme.colors.cluster[c.clusterId % theme.colors.cluster.length]}>
                              #{c.clusterId}
                            </Badge>
                          )}
                        </td>
                        <td>{c.clusterSize}</td>
                        <td>{c.txCount}</td>
                        <td>
                          {c.clusterId === -1 ? (
                            <span style={{ color: theme.colors.danger }}>100% — unique</span>
                          ) : (
                            <span
                              style={{
                                color:
                                  Number(pct) > 50
                                    ? theme.colors.danger
                                    : Number(pct) > 20
                                      ? theme.colors.warning
                                      : theme.colors.success,
                              }}
                            >
                              {pct}% of cluster
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrapper>
          </Card>
        </>
      )}

      {/* FPCs used */}
      {data.fpcsUsed.length > 0 && (
        <>
          <SectionTitle>Fee Payers Used</SectionTitle>
          <Card style={{ marginBottom: theme.spacing.md }}>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Your Txs</th>
                    <th>Network Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fpcsUsed.map((fpc) => (
                    <tr key={fpc.address}>
                      <td><HexDisplay address={fpc.address} /></td>
                      <td>{fpc.txCount}</td>
                      <td>
                        <span
                          style={{
                            color:
                              fpc.networkShare > 0.3
                                ? theme.colors.success
                                : fpc.networkShare > 0.1
                                  ? theme.colors.warning
                                  : theme.colors.danger,
                          }}
                        >
                          {(fpc.networkShare * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrapper>
          </Card>
        </>
      )}

      {/* Contracts interacted with */}
      {data.contractsInteracted.length > 0 && (
        <>
          <SectionTitle>Contracts Interacted</SectionTitle>
          <Card style={{ marginBottom: theme.spacing.md }}>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Type</th>
                    <th>Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contractsInteracted.map((c) => (
                    <tr key={c.address}>
                      <td><HexDisplay address={c.address} /></td>
                      <td>
                        {c.contractType ? (
                          <Badge>{c.contractType}</Badge>
                        ) : (
                          <span style={{ color: theme.colors.textMuted }}>—</span>
                        )}
                      </td>
                      <td>{c.callCount}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrapper>
          </Card>
        </>
      )}

      {/* Transaction list */}
      <SectionTitle>Transactions ({data.totalTxs})</SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("blockNumber")}>
                  Block {txSort.key === "blockNumber" ? (txSort.dir === "asc" ? "▴" : "▾") : ""}
                </th>
                <th>Hash</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Cluster</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("clusterSize")}>
                  Privacy Set{" "}
                  {txSort.key === "clusterSize" ? (txSort.dir === "asc" ? "▴" : "▾") : ""}
                </th>
                <th>Fee Payer</th>
              </tr>
            </thead>
            <tbody>
              {sortedTxs.map((tx) => (
                <tr key={tx.txHash}>
                  <td>{tx.blockNumber ?? "—"}</td>
                  <td>
                    <Flex gap="4px" align="center">
                      <TxLink to={`/tx/${tx.txHash}`}>
                        <HexDisplay address={tx.txHash} link={false} />
                      </TxLink>
                    </Flex>
                  </td>
                  <td>
                    <Flex gap="4px" wrap>
                      {tx.roles.map((r, i) => (
                        <RoleBadge
                          key={i}
                          color={
                            r === "feePayer"
                              ? theme.colors.warning
                              : r.includes("calldata")
                                ? theme.colors.accent
                                : theme.colors.primary
                          }
                        >
                          {r}
                        </RoleBadge>
                      ))}
                    </Flex>
                  </td>
                  <td>
                    <Badge
                      color={
                        tx.status === "finalized"
                          ? theme.colors.success
                          : tx.status === "dropped"
                            ? theme.colors.danger
                            : theme.colors.textMuted
                      }
                    >
                      {tx.status}
                    </Badge>
                  </td>
                  <td>
                    {tx.clusterId === null ? (
                      <span style={{ color: theme.colors.textMuted }}>—</span>
                    ) : tx.clusterId === -1 ? (
                      data.latestRunId != null ? (
                        <Link to={`/privacy-sets?cluster=${tx.clusterId}`}>
                          <Badge color={theme.colors.danger}>Outlier</Badge>
                        </Link>
                      ) : (
                        <Badge color={theme.colors.danger}>Outlier</Badge>
                      )
                    ) : data.latestRunId != null ? (
                      <Link to={`/privacy-sets?cluster=${tx.clusterId}`}>
                        <Badge
                          color={
                            theme.colors.cluster[tx.clusterId % theme.colors.cluster.length]
                          }
                        >
                          #{tx.clusterId}
                        </Badge>
                      </Link>
                    ) : (
                      <Badge
                        color={
                          theme.colors.cluster[tx.clusterId % theme.colors.cluster.length]
                        }
                      >
                        #{tx.clusterId}
                      </Badge>
                    )}
                  </td>
                  <td>
                    {tx.clusterSize === null ? (
                      "—"
                    ) : (
                      <span
                        style={{
                          color:
                            tx.clusterSize === 1
                              ? theme.colors.danger
                              : tx.clusterSize < 10
                                ? theme.colors.warning
                                : theme.colors.text,
                        }}
                      >
                        {tx.clusterSize}
                      </span>
                    )}
                  </td>
                  <td>
                    <HexDisplay address={tx.feePayer} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>
        {data.totalPages > 1 && (
          <Flex gap="8px" align="center" style={{ padding: theme.spacing.sm, justifyContent: "center" }}>
            <Button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              style={{ padding: "4px 12px", fontSize: theme.fontSize.xs }}
            >
              Prev
            </Button>
            <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
              Page {page} of {data.totalPages}
            </span>
            <Button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= data.totalPages}
              style={{ padding: "4px 12px", fontSize: theme.fontSize.xs }}
            >
              Next
            </Button>
          </Flex>
        )}
      </Card>
    </>
  );
}
