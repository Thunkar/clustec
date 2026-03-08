import { useCallback } from "react";
import { useLabels } from "../api/hooks";
import { useNetworkStore } from "../stores/network";

/**
 * Returns a function that resolves an address to its label if one exists.
 * Falls back to a truncated address if no label is found.
 */
export function useAddressResolver() {
  const { selectedNetwork } = useNetworkStore();
  const { data: labels } = useLabels(selectedNetwork);

  const resolve = useCallback(
    (address: string, truncate = true): string => {
      const label = labels?.find(
        (l) => l.address.toLowerCase() === address.toLowerCase()
      );
      if (label) {
        return `${label.label} (${address.slice(0, 10)}...)`;
      }
      return truncate ? address : address;
    },
    [labels]
  );

  return resolve;
}
