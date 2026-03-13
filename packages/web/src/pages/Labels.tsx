import { useState } from "react";
import { Link } from "react-router-dom";
import styled from "@emotion/styled";
import { useNetworkStore } from "../stores/network";
import { useAuthStore } from "../stores/auth";
import { useLabels, useAddLabel, useDeleteLabel } from "../api/hooks";
import { useMyTxs } from "../stores/my-txs";

import {
  PageContainer, PageTitle, Card, Table, TableWrapper, Loading,
  Flex, Button, Input, Badge, SectionTitle,
} from "../components/ui";
import { HexDisplay } from "../components/HexDisplay";
import { theme } from "../lib/theme";


const SectionNote = styled.p`
  color: ${theme.colors.textMuted};
  font-size: ${theme.fontSize.xs};
  margin: 0 0 ${theme.spacing.sm};
`;

export function Labels() {
  const { selectedNetwork } = useNetworkStore();
  const { isAdmin } = useAuthStore();
  const { data: labels, isLoading } = useLabels(selectedNetwork);
  const addLabel = useAddLabel(selectedNetwork);
  const deleteLabel = useDeleteLabel(selectedNetwork);
  const { txs, add: addTx, remove: removeTx } = useMyTxs();

  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [contractType, setContractType] = useState("");

  const [txHash, setTxHash] = useState("");
  const [txLabel, setTxLabel] = useState("");

  const handleAddLabel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !label) return;
    addLabel.mutate(
      { address, label, contractType: contractType || undefined },
      { onSuccess: () => { setAddress(""); setLabel(""); setContractType(""); } },
    );
  };

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txHash) return;
    addTx(txHash, txLabel || undefined);
    setTxHash("");
    setTxLabel("");
  };

  if (isLoading) return <Loading />;

  return (
    <PageContainer>
      <PageTitle>Labels</PageTitle>

      {/* ── Contract Labels (shared) ── */}
      <SectionTitle>Contract Labels</SectionTitle>
      <SectionNote>
        Shared — visible to all users. Add metadata to known contract addresses.
        {!isAdmin() && " Sign in as admin to add or remove labels."}
      </SectionNote>

      {isAdmin() && (
        <Card style={{ marginBottom: theme.spacing.sm }}>
          <form onSubmit={handleAddLabel}>
            <Flex gap="12px">
              <Input placeholder="Contract address (0x...)" value={address} onChange={(e) => setAddress(e.target.value)} style={{ flex: 2 }} />
              <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1 }} />
              <Input placeholder="Type (Token, AMM...)" value={contractType} onChange={(e) => setContractType(e.target.value)} style={{ flex: 1 }} />
              <Button type="submit" disabled={!address || !label}>Add</Button>
            </Flex>
          </form>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden", marginBottom: theme.spacing.lg }}>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <th>Address</th>
                <th>Label</th>
                <th>Type</th>
                {isAdmin() && <th></th>}
              </tr>
            </thead>
            <tbody>
              {labels?.map((l) => (
                <tr key={l.id}>
                  <td><HexDisplay address={l.address} /></td>
                  <td>{l.label}</td>
                  <td>{l.contractType ? <Badge>{l.contractType}</Badge> : "—"}</td>
                  {isAdmin() && (
                    <td>
                      <Button variant="danger" onClick={() => deleteLabel.mutate(l.id)} style={{ padding: "2px 8px", fontSize: "11px" }}>
                        Remove
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {!labels?.length && (
                <tr><td colSpan={isAdmin() ? 4 : 3} style={{ color: theme.colors.textMuted, textAlign: "center" }}>No labels yet</td></tr>
              )}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>

      {/* ── My Transactions (local) ── */}
      <SectionTitle>My Transactions</SectionTitle>
      <SectionNote>
        Local only — stored in your browser, never sent to the server.
      </SectionNote>

      <Card style={{ marginBottom: theme.spacing.sm }}>
        <form onSubmit={handleAddTx}>
          <Flex gap="12px">
            <Input
              placeholder="Transaction hash (0x...)"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              style={{ flex: 2 }}
            />
            <Input
              placeholder="Label (optional)"
              value={txLabel}
              onChange={(e) => setTxLabel(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button type="submit" disabled={!txHash}>Track</Button>
          </Flex>
        </form>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <TableWrapper>
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
                    <Flex gap="4px" align="center">
                      <Link to={`/tx/${t.hash}`} style={{ color: theme.colors.primary, textDecoration: "none" }}>
                        <HexDisplay address={t.hash} link={false} />
                      </Link>
                    </Flex>
                  </td>
                  <td>{t.label ? <Badge color={theme.colors.warning}>{t.label}</Badge> : "—"}</td>
                  <td>
                    <Button variant="danger" onClick={() => removeTx(t.hash)} style={{ padding: "2px 8px", fontSize: "11px" }}>
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
        </TableWrapper>
      </Card>
    </PageContainer>
  );
}
