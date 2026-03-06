import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  panelOpen: Record<string, boolean>;
  panelHeight: Record<string, number>;
  rightColumnWidth: number | null;
  setPanelOpen: (id: string, open: boolean) => void;
  setPanelHeight: (id: string, height: number) => void;
  setRightColumnWidth: (width: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      panelOpen: {},
      panelHeight: {},
      rightColumnWidth: null,
      setPanelOpen: (id, open) =>
        set((state) => ({
          panelOpen: { ...state.panelOpen, [id]: open },
        })),
      setPanelHeight: (id, height) =>
        set((state) => ({
          panelHeight: { ...state.panelHeight, [id]: height },
        })),
      setRightColumnWidth: (width) => set({ rightColumnWidth: width }),
    }),
    { name: "trading-layout" }
  )
);
