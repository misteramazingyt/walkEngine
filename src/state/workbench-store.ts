import { create } from "zustand";

// Transient client state only. Anything worth keeping across a refresh
// belongs in the database, not here.

export type WorkbenchSelection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

interface WorkbenchState {
  selection: WorkbenchSelection;
  setSelection: (selection: WorkbenchSelection) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  selection: null,
  setSelection: (selection) => set({ selection }),
}));
