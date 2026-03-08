import { useState } from "react";
import { useNetworkStore } from "../stores/network";
import { useLabels, useAddLabel, useDeleteLabel } from "../api/hooks";
import {
  PageContainer, PageTitle, Card, Table, Truncate, Loading,
  Flex, Button, Input, Badge,
} from "../components/ui";
import { theme } from "../lib/theme";

export function Labels() {
  const { selectedNetwork } = useNetworkStore();
  const { data: labels, isLoading } = useLabels(selectedNetwork);
  const addLabel = useAddLabel(selectedNetwork);
  const deleteLabel = useDeleteLabel(selectedNetwork);

  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [contractType, setContractType] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !label) return;
    addLabel.mutate(
      { address, label, contractType: contractType || undefined },
      { onSuccess: () => { setAddress(""); setLabel(""); setContractType(""); } }
    );
  };

  if (isLoading) return <Loading />;

  return (
    <PageContainer>
      <PageTitle>Contract Labels</PageTitle>
      <p style={{ color: theme.colors.textMuted, marginBottom: theme.spacing.lg, fontSize: theme.fontSize.sm }}>
        Add public metadata to known contract addresses. This data is shared across all users.
      </p>

      <Card style={{ marginBottom: theme.spacing.lg }}>
        <form onSubmit={handleSubmit}>
          <Flex gap="12px">
            <Input placeholder="Contract address (0x...)" value={address} onChange={(e) => setAddress(e.target.value)} style={{ flex: 2 }} />
            <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1 }} />
            <Input placeholder="Type (Token, AMM...)" value={contractType} onChange={(e) => setContractType(e.target.value)} style={{ flex: 1 }} />
            <Button type="submit" disabled={!address || !label}>Add</Button>
          </Flex>
        </form>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Table>
          <thead>
            <tr>
              <th>Address</th>
              <th>Label</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {labels?.map((l) => (
              <tr key={l.id}>
                <td><Truncate>{l.address}</Truncate></td>
                <td>{l.label}</td>
                <td>{l.contractType ? <Badge>{l.contractType}</Badge> : "—"}</td>
                <td>
                  <Button variant="danger" onClick={() => deleteLabel.mutate(l.id)} style={{ padding: "2px 8px", fontSize: "11px" }}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
            {!labels?.length && (
              <tr><td colSpan={4} style={{ color: theme.colors.textMuted, textAlign: "center" }}>No labels yet</td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </PageContainer>
  );
}
