import { useState } from "react";
import { Link } from "react-router-dom";
import { useMyTxs } from "../stores/my-txs";
import {
  PageContainer, PageTitle, Card, Table, Truncate, Flex, Button, Input, Badge,
} from "../components/ui";
import { theme } from "../lib/theme";

export function MyTransactions() {
  const { txs, add, remove } = useMyTxs();
  const [hash, setHash] = useState("");
  const [label, setLabel] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hash) return;
    add(hash, label || undefined);
    setHash("");
    setLabel("");
  };

  return (
    <PageContainer>
      <PageTitle>My Transactions</PageTitle>
      <p style={{ color: theme.colors.textMuted, marginBottom: theme.spacing.lg, fontSize: theme.fontSize.sm }}>
        Track your own transactions to see their privacy set. This data stays in your browser — never sent to the server.
      </p>

      <Card style={{ marginBottom: theme.spacing.lg }}>
        <form onSubmit={handleAdd}>
          <Flex gap="12px">
            <Input
              placeholder="Transaction hash (0x...)"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              style={{ flex: 2 }}
            />
            <Input
              placeholder="Label (optional, e.g. 'AMM swap')"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button type="submit" disabled={!hash}>Track</Button>
          </Flex>
        </form>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Table>
          <thead>
            <tr>
              <th>Hash</th>
              <th>Label</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.hash}>
                <td>
                  <Link to={`/tx/${t.hash}`} style={{ color: theme.colors.primary, textDecoration: "none" }}>
                    <Truncate style={{ maxWidth: 400 }}>{t.hash}</Truncate>
                  </Link>
                </td>
                <td>{t.label ? <Badge color={theme.colors.warning}>{t.label}</Badge> : "—"}</td>
                <td>
                  <Button variant="danger" onClick={() => remove(t.hash)} style={{ padding: "2px 8px", fontSize: "11px" }}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
            {txs.length === 0 && (
              <tr><td colSpan={3} style={{ color: theme.colors.textMuted, textAlign: "center" }}>
                No tracked transactions. Add a tx hash above, or click "Track as Mine" on any tx detail page.
              </td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </PageContainer>
  );
}
