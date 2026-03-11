import { useState, useCallback, useRef } from "react";
import styled from "@emotion/styled";
import { useNetworkStore } from "../stores/network";
import { useTxs } from "../api/hooks";
import {
  PageContainer, PageTitle, Card, Loading, Flex, Button, Input, Select,
} from "../components/ui";
import { TxTable, type TxSortKey, type SortDir } from "../components/TxTable";
import { theme } from "../lib/theme";

const LIMIT = 25;

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

const PaginationInfo = styled.span`
  color: ${theme.colors.textMuted};
  font-size: ${theme.fontSize.xs};
`;

export function Transactions() {
  const { selectedNetwork } = useNetworkStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<TxSortKey>("blockNumber");
  const [order, setOrder] = useState<SortDir>("desc");

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  const filters = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    sort,
    order,
  };

  const { data, isLoading, isFetching } = useTxs(selectedNetwork, page, filters);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleSort = (col: TxSortKey) => {
    if (sort === col) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(col);
      setOrder("desc");
    }
    setPage(1);
  };

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
        <TxTable
          rows={data?.data ?? []}
          sortKey={sort}
          sortDir={order}
          onSort={handleSort}
        />
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
