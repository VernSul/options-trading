import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  panelOpen: Record<string, boolean>;
  setPanelOpen: (id: string, open: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      panelOpen: {},
      setPanelOpen: (id, open) =>
        set((state) => ({
          panelOpen: { ...state.panelOpen, [id]: open },
        })),
    }),
    { name: "trading-layout" }
  )
);
