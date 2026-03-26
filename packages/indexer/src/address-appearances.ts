import type { PublicCallInfo, L2ToL1MsgInfo } from "./types.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface AddressAppearanceRow {
  txId: number;
  address: string;
  role: "msgSender" | "calldata" | "l2ToL1Recipient" | "l2ToL1Sender";
}

/**
 * Extract public address appearances from tx data for the reverse index.
 * Filters out zero addresses and deduplicates by (address, role).
 */
export function extractAddressAppearances(
  txId: number,
  publicCalls: PublicCallInfo[],
  l2ToL1MsgDetails: L2ToL1MsgInfo[],
): AddressAppearanceRow[] {
  const seen = new Set<string>();
  const rows: AddressAppearanceRow[] = [];

  const add = (address: string, role: AddressAppearanceRow["role"]) => {
    const lower = address.toLowerCase();
    if (lower === ZERO_ADDRESS || !lower) return;
    const key = `${lower}:${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ txId, address: lower, role });
  };

  for (const call of publicCalls) {
    if (call.msgSender) add(call.msgSender, "msgSender");
    for (const field of call.calldata ?? []) {
      if (field && field.length === 66) add(field, "calldata");
    }
  }

  for (const msg of l2ToL1MsgDetails) {
    if (msg.recipient) add(msg.recipient, "l2ToL1Recipient");
    if (msg.senderContract) add(msg.senderContract, "l2ToL1Sender");
  }

  return rows;
}
