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

type SortKey = "createdAt" | "blockNumber" | "numNoteHashes" | "numNullifiers" | "numPublicDataWrites" | "actualFee" | "status";
type SortOrder = "asc" | "desc";

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "finalized" ? theme.colors.success
    : status === "mined" ? theme.colors.accent
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
          <option value="pending">Pending</option>
          <option value="mined">Mined</option>
          <option value="finalized">Finalized</option>
        </Select>
        {isFetching && (
          <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
            Loading...
          </span>
        )}
      </Toolbar>

      <Card style={{ padding: 0, overflow: "hidden" }}>
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
              <th>Fee Payer</th>
              <SortHeader active={sort === "numNoteHashes"} onClick={() => toggleSort("numNoteHashes")}>
                Notes{sortIndicator("numNoteHashes")}
              </SortHeader>
              <SortHeader active={sort === "numNullifiers"} onClick={() => toggleSort("numNullifiers")}>
                Nullifiers{sortIndicator("numNullifiers")}
              </SortHeader>
              <SortHeader active={sort === "numPublicDataWrites"} onClick={() => toggleSort("numPublicDataWrites")}>
                PDWs{sortIndicator("numPublicDataWrites")}
              </SortHeader>
              <th>Calls</th>
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
                    {tx.feePayer ? resolveAddress(tx.feePayer) : "\u2014"}
                  </Mono>
                </td>
                <td>{tx.numNoteHashes}</td>
                <td>{tx.numNullifiers}</td>
                <td>{tx.numPublicDataWrites ?? "\u2014"}</td>
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
                <td colSpan={10} style={{ textAlign: "center", color: theme.colors.textMuted, padding: theme.spacing.lg }}>
                  No transactions found
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Flex justify="space-between" style={{ marginTop: theme.spacing.md, alignItems: "center" }}>
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
