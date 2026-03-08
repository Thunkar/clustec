import {
  computePublicDataTreeLeafSlot as aztecComputeLeafSlot,
  deriveStorageSlotInMap,
} from "@aztec/stdlib/hash";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Fr } from "@aztec/foundation/curves/bn254";

const MAX_SLOT_INDEX = 20;

// FeeJuice contract address (protocol contract #5)
const FEE_JUICE_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000005";
// FeeJuice balances map is at storage slot 1
const FEE_JUICE_BALANCES_SLOT = 1n;

function toLeafSlotHex(fr: Fr): string {
  return "0x" + fr.toBigInt().toString(16).padStart(64, "0");
}

/**
 * Compute the public data tree leaf slot for a given contract address and
 * storage slot, using Aztec's official Poseidon2 implementation.
 */
export async function computePublicDataTreeLeafSlot(
  contractAddress: string,
  storageSlot: bigint
): Promise<string> {
  const addr = AztecAddress.fromString(contractAddress);
  const slot = new Fr(storageSlot);
  const result = await aztecComputeLeafSlot(addr, slot);
  return toLeafSlotHex(result);
}

export interface SlotPreimage {
  contractAddress: string;
  contractLabel?: string;
  storageSlotIndex: number | string;
}

/**
 * Build a lookup table mapping leaf slot hex → preimage (contract address + slot index).
 * Includes:
 * - Simple integer slots 0..maxSlotIndex for each contract
 * - FeeJuice balance slots for each known address (map-derived)
 */
export async function buildSlotLookup(
  contractAddresses: string[],
  contractLabels?: Map<string, string>,
  maxSlotIndex = MAX_SLOT_INDEX
): Promise<Map<string, SlotPreimage>> {
  const lookup = new Map<string, SlotPreimage>();
  const labelFor = (addr: string) => contractLabels?.get(addr);

  // Simple integer slots for each contract
  for (const addr of contractAddresses) {
    for (let i = 0; i <= maxSlotIndex; i++) {
      const leafSlot = await computePublicDataTreeLeafSlot(addr, BigInt(i));
      lookup.set(leafSlot, {
        contractAddress: addr,
        contractLabel: labelFor(addr),
        storageSlotIndex: i,
      });
    }
  }

  // FeeJuice balance map slots for each known address
  const feeJuiceAddr = AztecAddress.fromString(FEE_JUICE_ADDRESS);
  for (const addr of contractAddresses) {
    const key = AztecAddress.fromString(addr);
    const derivedSlot = await deriveStorageSlotInMap(
      FEE_JUICE_BALANCES_SLOT,
      key
    );
    const leafSlot = await aztecComputeLeafSlot(feeJuiceAddr, derivedSlot);
    lookup.set(toLeafSlotHex(leafSlot), {
      contractAddress: FEE_JUICE_ADDRESS,
      contractLabel: "FeeJuice",
      storageSlotIndex: `balances[${labelFor(addr) ?? addr}]`,
    });
  }

  return lookup;
}
