import { useCallback } from "react";
import { useLabels } from "../api/hooks";
import { useNetworkStore } from "../stores/network";
import { abbreviateHex } from "../components/TxTable";

/**
 * Returns a function that resolves an address to its label if one exists.
 * Falls back to a truncated address if no label is found.
 */
export function useAddressResolver() {
  const { selectedNetwork } = useNetworkStore();
  const { data: labels } = useLabels(selectedNetwork);

  const resolve = useCallback(
    (address: string): string => {
      const label = labels?.find(
        (l) => l.address.toLowerCase() === address.toLowerCase()
      );
      if (label) {
        return `${label.label} (${abbreviateHex(address)})`;
      }
      return abbreviateHex(address);
    },
    [labels]
  );

  return resolve;
}
