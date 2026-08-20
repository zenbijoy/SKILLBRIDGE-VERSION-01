import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type Mode = "learn" | "teach";

interface AppState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mode: "learn",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "@skillbridge_app_v3",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
