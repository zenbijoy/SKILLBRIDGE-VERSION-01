import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type Mode = "learn" | "teach";

export interface CachedProfile {
  id?: string;
  full_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
}

interface AppState {
  mode: Mode;
  setMode: (mode: Mode) => void;
  cachedProfile: CachedProfile | null;
  setCachedProfile: (profile: CachedProfile | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mode: "learn",
      setMode: (mode) => set({ mode }),
      cachedProfile: null,
      setCachedProfile: (cachedProfile) => set({ cachedProfile }),
    }),
    {
      name: "@skillbridge_app_v3",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode, cachedProfile: state.cachedProfile }),
    },
  ),
);

