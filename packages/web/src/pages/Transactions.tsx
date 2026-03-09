import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import styled from "@emotion/styled";
import { useNetworkStore } from "../stores/network";
import { useTxs } from "../api/hooks";
import { useAddressResolver } from "../hooks/useAddressResolver";
import {
  PageContainer,
  PageTitle,
  Card,
  Table,
  TableWrapper,
  Truncate,
  Loading,
  Flex,
  Button,
  Badge,
  Input,
  Select,
  Mono,
} from "../components/ui";
import { theme } from "../lib/theme";

const LIMIT = 50;

const Toolbar = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled(Input)`
  flex: 1;
  min-width: 200px;
  max-width: 400px;
`;

const SortHeader = styled.th<{ active?: boolean }>`
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  color: ${(p) => (p.active ? theme.colors.primary : "inherit")} !important;

  &:hover {
    color: ${theme.colors.primary} !important;
  }
`;

const PaginationInfo = styled.span`
  color: ${theme.colors.textMuted};
  font-size: ${theme.fontSize.xs};
`;

type SortKey =
  | "createdAt" | "blockNumber"
  | "numNoteHashes" | "numNullifiers" | "numPublicDataWrites"
  | "numPrivateLogs" | "numPublicLogs" | "numContractClassLogs" | "numL2ToL1Msgs"
  | "actualFee" | "feePayer" | "status";
type SortOrder = "asc" | "desc";

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

export function Transactions() {
  const { selectedNetwork } = useNetworkStore();
  const resolveAddress = useAddressResolver();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("createdAt");
  const [order, setOrder] = useState<SortOrder>("desc");

  // Debounce search input
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [statusFilter, sort, order]);

  const filters = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    sort,
    order,
  };

  const { data, isLoading, isFetching } = useTxs(selectedNetwork, page, filters);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const toggleSort = (col: SortKey) => {
    if (sort === col) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(col);
      setOrder("desc");
    }
  };

  const sortIndicator = (col: SortKey) =>
    sort === col ? (order === "desc" ? " \u25BE" : " \u25B4") : "";

  if (isLoading && !data) return <Loading />;

  return (
    <PageContainer>
      <PageTitle>Transactions</PageTitle>

      <Toolbar>
        <SearchInput
          placeholder="Search by hash, fee payer, or contract address..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="dropped">Dropped</option>
          <option value="pending">Pending</option>
          <option value="proposed">Proposed</option>
          <option value="checkpointed">Checkpointed</option>
          <option value="proven">Proven</option>
          <option value="finalized">Finalized</option>
        </Select>
        {isFetching && (
          <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
            Loading...
          </span>
        )}
      </Toolbar>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <TableWrapper>
        <Table>
          <thead>
            <tr>
              <th>Hash</th>
              <SortHeader active={sort === "status"} onClick={() => toggleSort("status")}>
                Status{sortIndicator("status")}
              </SortHeader>
              <SortHeader active={sort === "blockNumber"} onClick={() => toggleSort("blockNumber")}>
                Block{sortIndicator("blockNumber")}
              </SortHeader>
              <SortHeader active={sort === "feePayer"} onClick={() => toggleSort("feePayer")}>
                Fee Payer{sortIndicator("feePayer")}
              </SortHeader>
              <SortHeader active={sort === "numNoteHashes"} onClick={() => toggleSort("numNoteHashes")}>
                Note Hashes{sortIndicator("numNoteHashes")}
              </SortHeader>
              <SortHeader active={sort === "numNullifiers"} onClick={() => toggleSort("numNullifiers")}>
                Nullifiers{sortIndicator("numNullifiers")}
              </SortHeader>
              <SortHeader active={sort === "numL2ToL1Msgs"} onClick={() => toggleSort("numL2ToL1Msgs")}>
                L2→L1 Messages{sortIndicator("numL2ToL1Msgs")}
              </SortHeader>
              <SortHeader active={sort === "numPrivateLogs"} onClick={() => toggleSort("numPrivateLogs")}>
                Private Logs{sortIndicator("numPrivateLogs")}
              </SortHeader>
              <SortHeader active={sort === "numContractClassLogs"} onClick={() => toggleSort("numContractClassLogs")}>
                Contract Class Logs{sortIndicator("numContractClassLogs")}
              </SortHeader>
              <SortHeader active={sort === "numPublicDataWrites"} onClick={() => toggleSort("numPublicDataWrites")}>
                Public Data Writes{sortIndicator("numPublicDataWrites")}
              </SortHeader>
              <SortHeader active={sort === "numPublicLogs"} onClick={() => toggleSort("numPublicLogs")}>
                Public Logs{sortIndicator("numPublicLogs")}
              </SortHeader>
              <th>Public Calls</th>
              <SortHeader active={sort === "actualFee"} onClick={() => toggleSort("actualFee")}>
                Fee{sortIndicator("actualFee")}
              </SortHeader>
              <SortHeader active={sort === "createdAt"} onClick={() => toggleSort("createdAt")}>
                Time{sortIndicator("createdAt")}
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((tx) => (
              <tr key={tx.id}>
                <td>
                  <Link
                    to={`/tx/${tx.txHash}`}
                    style={{ color: theme.colors.primary, textDecoration: "none" }}
                  >
                    <Truncate>{tx.txHash}</Truncate>
                  </Link>
                </td>
                <td><StatusBadge status={tx.status} /></td>
                <td>{tx.blockNumber != null ? tx.blockNumber.toLocaleString() : "\u2014"}</td>
                <td>
                  <Mono style={{ fontSize: "10px" }}>
                    <Truncate>{resolveAddress(tx.feePayer)}</Truncate>
                  </Mono>
                </td>
                <td>{tx.numNoteHashes}</td>
                <td>{tx.numNullifiers}</td>
                <td>{tx.numL2ToL1Msgs}</td>
                <td>{tx.numPrivateLogs}</td>
                <td>{tx.numContractClassLogs}</td>
                <td>{tx.numPublicDataWrites ?? "\u2014"}</td>
                <td>{tx.numPublicLogs ?? "\u2014"}</td>
                <td>
                  <span style={{ fontSize: theme.fontSize.xs }}>
                    {tx.numSetupCalls + tx.numAppCalls + (tx.hasTeardown ? 1 : 0)}
                  </span>
                </td>
                <td>
                  <Mono style={{ fontSize: "10px" }}>
                    <Truncate>{tx.actualFee ?? "\u2014"}</Truncate>
                  </Mono>
                </td>
                <td>
                  <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
                    {new Date(tx.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={14} style={{ textAlign: "center", color: theme.colors.textMuted, padding: theme.spacing.lg }}>
                  No transactions found
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        </TableWrapper>
      </Card>

      <Flex justify="space-between" wrap style={{ marginTop: theme.spacing.md, alignItems: "center" }}>
        <PaginationInfo>
          {total.toLocaleString()} transaction{total !== 1 ? "s" : ""}
        </PaginationInfo>
        <Flex gap="12px" style={{ alignItems: "center" }}>
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <PaginationInfo>
            Page {page} of {totalPages.toLocaleString()}
          </PaginationInfo>
          <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </Flex>
      </Flex>
    </PageContainer>
  );
}
