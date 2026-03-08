import { create } from "zustand";
import { persist } from "zustand/middleware";

interface NetworkState {
  selectedNetwork: string;
  setNetwork: (id: string) => void;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      selectedNetwork: "devnet",
      setNetwork: (id) => set({ selectedNetwork: id }),
    }),
    { name: "clustec-network" }
  )
);
