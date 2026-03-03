import { create } from "zustand";
import type { Account } from "../types";
import { rest } from "../api/rest";

interface AccountState {
  account: Account | null;
  loading: boolean;
  fetchAccount: () => Promise<void>;
}

export const useAccountStore = create<AccountState>((set) => ({
  account: null,
  loading: false,

  fetchAccount: async () => {
    set({ loading: true });
    try {
      const account = await rest.getAccount();
      set({ account, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
