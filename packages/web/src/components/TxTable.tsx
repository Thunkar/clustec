import { Link } from "react-router-dom";
import styled from "@emotion/styled";
import { Table, TableWrapper, Badge, Mono } from "./ui";
import { HexDisplay } from "./HexDisplay";
import { theme } from "../lib/theme";
import { formatFJPerMana } from "../lib/format";

/** Abbreviate a 0x-prefixed hex string: 0x1234...abcd */
export function abbreviateHex(hex: string): string {
  if (!hex || hex.length <= 13) return hex;
  return `${hex.slice(0, 6)}...${hex.slice(-4)}`;
}

// Shared row shape: the feature vector dimensions + hash/status/block
export interface TxRow {
  txHash: string;
  status: string;
  blockNumber: number | null;
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPrivateLogs: number;
  numContractClassLogs: number;
  numPublicLogs: number | null;
  gasLimitDa: number | null;
  gasLimitL2: number | null;
  maxFeePerDaGas: number | null;
  maxFeePerL2Gas: number | null;
  numSetupCalls: number;
  numAppCalls: number;
  totalPublicCalldataSize: number;
  expirationTimestamp: number | null;
  feePayer: string;
  outlierScore?: number | null;
}

export type TxSortKey =
  | "blockNumber"
  | "numNoteHashes"
  | "numNullifiers"
  | "numL2ToL1Msgs"
  | "numPrivateLogs"
  | "numContractClassLogs"
  | "numPublicLogs"
  | "gasLimitDa"
  | "gasLimitL2"
  | "maxFeePerDaGas"
  | "maxFeePerL2Gas"
  | "numSetupCalls"
  | "numAppCalls"
  | "totalPublicCalldataSize"
  | "feePayer"
  | "status"
  | "outlierScore";

export type SortDir = "asc" | "desc";

const CompactTable = styled(Table)`
  thead th {
    font-size: ${theme.fontSize.xs};
    white-space: nowrap;
    padding: 8px 6px;
    text-align: center;
  }

  tbody td {
    text-align: center;
    padding: 6px;
    font-size: ${theme.fontSize.xs};
  }
`;

const SortHeader = styled.th<{ $active?: boolean }>`
  cursor: pointer;
  user-select: none;
  color: ${(p) => (p.$active ? theme.colors.primary : "inherit")} !important;
  &:hover {
    color: ${theme.colors.primary} !important;
  }
`;

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "finalized" || status === "proven"
      ? theme.colors.success
      : status === "checkpointed" || status === "proposed"
        ? theme.colors.accent
        : status === "dropped"
          ? theme.colors.danger
          : theme.colors.warning;
  return <Badge color={color}>{status}</Badge>;
}

interface TxTableProps {
  rows: TxRow[];
  sortKey?: TxSortKey;
  sortDir?: SortDir;
  onSort?: (key: TxSortKey) => void;
  showOutlierScore?: boolean;
  showIndex?: boolean;
  pageOffset?: number;
}

export function TxTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  showOutlierScore = false,
  showIndex = false,
  pageOffset = 0,
}: TxTableProps) {
  const indicator = (key: TxSortKey) =>
    sortKey === key ? (sortDir === "desc" ? " \u25BE" : " \u25B4") : "";

  const header = (key: TxSortKey, label: string) =>
    onSort ? (
      <SortHeader $active={sortKey === key} onClick={() => onSort(key)}>
        {label}
        {indicator(key)}
      </SortHeader>
    ) : (
      <th>{label}</th>
    );

  const num = (v: number | null | undefined) =>
    v != null ? v.toLocaleString() : "\u2014";

  const colCount = 18 + (showIndex ? 1 : 0) + (showOutlierScore ? 1 : 0);

  return (
    <TableWrapper>
      <CompactTable>
        <thead>
          <tr>
            {showIndex && <th>#</th>}
            <th>Hash</th>
            {header("status", "Status")}
            {header("blockNumber", "Block")}
            {header("numNoteHashes", "Note Hashes")}
            {header("numNullifiers", "Nullifiers")}
            {header("numL2ToL1Msgs", "L2\u2192L1 Msgs")}
            {header("numPrivateLogs", "Priv Logs")}
            {header("numContractClassLogs", "CC Logs")}
            {header("numPublicLogs", "Pub Logs")}
            {header("gasLimitDa", "DA Mana Limit")}
            {header("gasLimitL2", "L2 Mana Limit")}
            {header("maxFeePerDaGas", "Max Fee/DA Mana")}
            {header("maxFeePerL2Gas", "Max Fee/L2 Mana")}
            {header("numSetupCalls", "Pub Setup")}
            {header("numAppCalls", "Pub App")}
            {header("totalPublicCalldataSize", "Pub Calldata Size")}
            {header("feePayer", "Fee Payer")}
            {showOutlierScore && header("outlierScore", "Outlier")}
          </tr>
        </thead>
        <tbody>
          {rows.map((tx, i) => (
            <tr key={tx.txHash}>
              {showIndex && <td>{pageOffset + i + 1}</td>}
              <td style={{ textAlign: "left" }}>
                <Link
                  to={`/tx/${tx.txHash}`}
                  style={{
                    color: theme.colors.primary,
                    textDecoration: "none",
                  }}
                >
                  <Mono>{abbreviateHex(tx.txHash)}</Mono>
                </Link>
              </td>
              <td>
                <StatusBadge status={tx.status} />
              </td>
              <td>{num(tx.blockNumber)}</td>
              <td>{tx.numNoteHashes}</td>
              <td>{tx.numNullifiers}</td>
              <td>{tx.numL2ToL1Msgs}</td>
              <td>{tx.numPrivateLogs}</td>
              <td>{tx.numContractClassLogs}</td>
              <td>{num(tx.numPublicLogs)}</td>
              <td>{num(tx.gasLimitDa)}</td>
              <td>{num(tx.gasLimitL2)}</td>
              <td>{formatFJPerMana(tx.maxFeePerDaGas)}</td>
              <td>{formatFJPerMana(tx.maxFeePerL2Gas)}</td>
              <td>{tx.numSetupCalls}</td>
              <td>{tx.numAppCalls}</td>
              <td>{tx.totalPublicCalldataSize}</td>
              <td style={{ textAlign: "left" }}>
                <HexDisplay address={tx.feePayer} />
              </td>
              {showOutlierScore && (
                <td>
                  {tx.outlierScore != null ? (
                    <Badge
                      color={
                        tx.outlierScore > 0.5
                          ? theme.colors.danger
                          : tx.outlierScore > 0.2
                            ? theme.colors.warning
                            : theme.colors.success
                      }
                    >
                      {(tx.outlierScore * 100).toFixed(1)}%
                    </Badge>
                  ) : (
                    "\u2014"
                  )}
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={colCount}
                style={{
                  textAlign: "center",
                  color: theme.colors.textMuted,
                  padding: theme.spacing.lg,
                }}
              >
                No transactions found
              </td>
            </tr>
          )}
        </tbody>
      </CompactTable>
    </TableWrapper>
  );
}
