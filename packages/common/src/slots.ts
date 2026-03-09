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

// Max map storage slot index to try for map-derived slots
const MAX_MAP_SLOT = 10;

/**
 * Build a lookup table mapping leaf slot hex → preimage (contract address + slot index).
 * Includes:
 * - Simple integer slots 0..maxSlotIndex for each contract
 * - Map-derived slots: for each contract, derive map(slotIndex, key) for all known
 *   addresses as keys, covering map storage slots 1..MAX_MAP_SLOT
 * - FeeJuice balance map slots for all known addresses
 *
 * @param contractAddresses - labeled contract addresses
 * @param contractLabels - optional label map
 * @param knownAddresses - additional addresses to use as map keys (fee payers, msg senders, etc.)
 */
export async function buildSlotLookup(
  contractAddresses: string[],
  contractLabels?: Map<string, string>,
  knownAddresses: string[] = [],
  maxSlotIndex = MAX_SLOT_INDEX
): Promise<Map<string, SlotPreimage>> {
  const lookup = new Map<string, SlotPreimage>();
  const labelFor = (addr: string) => contractLabels?.get(addr);

  // Collect all unique addresses to use as potential map keys
  const allAddresses = [
    ...new Set([...contractAddresses, ...knownAddresses].map((a) => a.toLowerCase())),
  ];

  const promises: Promise<void>[] = [];

  for (const contractAddr of contractAddresses) {
    const aztecAddr = AztecAddress.fromString(contractAddr);
    const cLabel = labelFor(contractAddr);

    // Simple integer slots for each contract
    for (let i = 0; i <= maxSlotIndex; i++) {
      promises.push(
        aztecComputeLeafSlot(aztecAddr, new Fr(BigInt(i))).then((result) => {
          lookup.set(toLeafSlotHex(result), {
            contractAddress: contractAddr,
            contractLabel: cLabel,
            storageSlotIndex: i,
          });
        })
      );
    }

    // Map-derived slots: for each map slot index, try every known address as key
    for (let mapSlot = 1; mapSlot <= MAX_MAP_SLOT; mapSlot++) {
      for (const keyAddr of allAddresses) {
        const key = AztecAddress.fromString(keyAddr);
        promises.push(
          deriveStorageSlotInMap(BigInt(mapSlot), key)
            .then((derivedSlot) => aztecComputeLeafSlot(aztecAddr, derivedSlot))
            .then((leafSlot) => {
              const keyLabel = labelFor(keyAddr) ?? keyAddr.slice(0, 10) + "…";
              lookup.set(toLeafSlotHex(leafSlot), {
                contractAddress: contractAddr,
                contractLabel: cLabel,
                storageSlotIndex: `map[${mapSlot}][${keyLabel}]`,
              });
            })
        );
      }
    }
  }

  // FeeJuice balance map slots for all known addresses
  const feeJuiceAddr = AztecAddress.fromString(FEE_JUICE_ADDRESS);
  for (const addr of allAddresses) {
    const key = AztecAddress.fromString(addr);
    promises.push(
      deriveStorageSlotInMap(FEE_JUICE_BALANCES_SLOT, key)
        .then((derivedSlot) => aztecComputeLeafSlot(feeJuiceAddr, derivedSlot))
        .then((leafSlot) => {
          lookup.set(toLeafSlotHex(leafSlot), {
            contractAddress: FEE_JUICE_ADDRESS,
            contractLabel: "FeeJuice",
            storageSlotIndex: `balances[${labelFor(addr) ?? addr.slice(0, 10) + "…"}]`,
          });
        })
    );
  }

  await Promise.all(promises);
  return lookup;
}
