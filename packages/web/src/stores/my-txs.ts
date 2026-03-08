import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MyTx {
  hash: string;
  label?: string;
}

interface MyTxsState {
  txs: MyTx[];
  add: (hash: string, label?: string) => void;
  remove: (hash: string) => void;
  isTracked: (hash: string) => boolean;
  getLabel: (hash: string) => string | undefined;
}

export const useMyTxs = create<MyTxsState>()(
  persist(
    (set, get) => ({
      txs: [],
      add: (hash, label) =>
        set((s) => ({
          txs: s.txs.some((t) => t.hash === hash)
            ? s.txs
            : [...s.txs, { hash, label }],
        })),
      remove: (hash) =>
        set((s) => ({ txs: s.txs.filter((t) => t.hash !== hash) })),
      isTracked: (hash) => get().txs.some((t) => t.hash === hash),
      getLabel: (hash) => get().txs.find((t) => t.hash === hash)?.label,
    }),
    { name: "clustec-my-txs" }
  )
);
