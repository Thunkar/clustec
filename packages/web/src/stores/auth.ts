import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      setToken: (token) => set({ token }),
      isAdmin: () => !!get().token,
    }),
    { name: "clustec-admin" }
  )
);
