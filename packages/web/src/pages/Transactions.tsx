import { useState } from "react";
import { Link } from "react-router-dom";
import styled from "@emotion/styled";
import { useNetworkStore } from "../stores/network";
import { useTxs, useLabels } from "../api/hooks";
import { useAddressResolver } from "../hooks/useAddressResolver";
import {
  PageContainer, PageTitle, Card, Table, Truncate, Loading, Flex, Button,
} from "../components/ui";
import { theme } from "../lib/theme";

const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
`;

const Select = styled.select`
  background: ${theme.colors.bgCard};
  color: ${theme.colors.text};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.sm};
  padding: 6px 12px;
  font-size: ${theme.fontSize.sm};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
`;

export function Transactions() {
  const { selectedNetwork } = useNetworkStore();
  const [page, setPage] = useState(1);
  const [contractFilter, setContractFilter] = useState<string | undefined>();
  const { data, isLoading } = useTxs(selectedNetwork, page, contractFilter);
  const { data: labels } = useLabels(selectedNetwork);
  const resolveAddress = useAddressResolver();

  if (isLoading) return <Loading />;

  return (
    <PageContainer>
      <PageTitle>Transactions</PageTitle>
      {labels && labels.length > 0 && (
        <FilterBar>
          <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
            Filter by contract:
          </span>
          <Select
            value={contractFilter ?? ""}
            onChange={(e) => {
              setContractFilter(e.target.value || undefined);
              setPage(1);
            }}
          >
            <option value="">All transactions</option>
            {labels.map((l) => (
              <option key={l.id} value={l.address}>
                {l.label}{l.contractType ? ` (${l.contractType})` : ""}
              </option>
            ))}
          </Select>
          {contractFilter && (
            <Button variant="ghost" onClick={() => { setContractFilter(undefined); setPage(1); }}>
              Clear
            </Button>
          )}
        </FilterBar>
      )}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Table>
          <thead>
            <tr>
              <th>Hash</th>
              <th>Block</th>
              <th>Note Hashes</th>
              <th>Nullifiers</th>
              <th>Public Data Writes</th>
              <th>Private Logs</th>
              <th>Public Logs</th>
              <th>Fee Payer</th>
              <th>Expiration</th>
              <th>Fee</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((tx) => (
              <tr key={tx.id}>
                <td>
                  <Link to={`/tx/${tx.txHash}`} style={{ color: theme.colors.primary, textDecoration: "none" }}>
                    <Truncate>{tx.txHash}</Truncate>
                  </Link>
                </td>
                <td>{tx.blockNumber.toLocaleString()}</td>
                <td>{tx.numNoteHashes}</td>
                <td>{tx.numNullifiers}</td>
                <td>{tx.numPublicDataWrites}</td>
                <td>{tx.numPrivateLogs}</td>
                <td>{tx.numPublicLogs}</td>
                <td>{tx.feePayer ? <Truncate>{resolveAddress(tx.feePayer)}</Truncate> : "—"}</td>
                <td>
                  {tx.expirationTimestamp == null || tx.expirationTimestamp === 0
                    ? "—"
                    : new Date(tx.expirationTimestamp * 1000).toLocaleDateString()}
                </td>
                <td><Truncate>{tx.transactionFee ?? "—"}</Truncate></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Flex justify="center" gap="12px" style={{ marginTop: theme.spacing.md }}>
        <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>Page {page}</span>
        <Button variant="ghost" disabled={(data?.data.length ?? 0) < 50} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </Flex>
    </PageContainer>
  );
}
