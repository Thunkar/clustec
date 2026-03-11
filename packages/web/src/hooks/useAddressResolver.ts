import { useCallback, useMemo } from "react";
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

/**
 * Returns a function that resolves an address to just its label name, or undefined.
 */
export function useLabelResolver() {
  const { selectedNetwork } = useNetworkStore();
  const { data: labels } = useLabels(selectedNetwork);

  return useCallback(
    (address: string): string | undefined => {
      const match = labels?.find(
        (l) => l.address.toLowerCase() === address.toLowerCase()
      );
      return match?.label;
    },
    [labels]
  );
}

/**
 * Returns a Set of lowercase addresses that have labels.
 */
export function useLabeledAddresses(): Set<string> {
  const { selectedNetwork } = useNetworkStore();
  const { data: labels } = useLabels(selectedNetwork);

  return useMemo(() => {
    const set = new Set<string>();
    if (labels) {
      for (const l of labels) {
        set.add(l.address.toLowerCase());
      }
    }
    return set;
  }, [labels]);
}
