import { create } from "zustand";
type Mode = "learn" | "teach";
interface AppState {
  mode: Mode;
  setMode: (m: Mode) => void;
}
export const useAppStore = create<AppState>((set) => ({
  mode: "learn",
  setMode: (mode) => set({ mode }),
}));
