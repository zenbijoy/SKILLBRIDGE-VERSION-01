import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemePreference = "system" | "light" | "dark";
export type AppLanguage = "en" | "bn";
export type DataSaverMode = "off" | "standard" | "extreme";

interface PreferencesState {
  theme: ThemePreference;
  language: AppLanguage;
  useDeviceLanguage: boolean;
  dataSaver: DataSaverMode;
  reduceMotion: boolean;
  largeText: boolean;
  haptics: boolean;
  autoplayMedia: boolean;
  downloadOnWifiOnly: boolean;
  pushEnabled: boolean;
  recentSearches: string[];
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: AppLanguage) => void;
  setUseDeviceLanguage: (enabled: boolean) => void;
  setDataSaver: (mode: DataSaverMode) => void;
  setReduceMotion: (enabled: boolean) => void;
  setLargeText: (enabled: boolean) => void;
  setHaptics: (enabled: boolean) => void;
  setAutoplayMedia: (enabled: boolean) => void;
  setDownloadOnWifiOnly: (enabled: boolean) => void;
  setPushEnabled: (enabled: boolean) => void;
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      language: "en",
      useDeviceLanguage: false,
      dataSaver: "standard",
      reduceMotion: false,
      largeText: false,
      haptics: true,
      autoplayMedia: true,
      downloadOnWifiOnly: true,
      pushEnabled: true,
      recentSearches: [],
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language, useDeviceLanguage: false }),
      setUseDeviceLanguage: (useDeviceLanguage) => set({ useDeviceLanguage }),
      setDataSaver: (dataSaver) => set({ dataSaver }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setLargeText: (largeText) => set({ largeText }),
      setHaptics: (haptics) => set({ haptics }),
      setAutoplayMedia: (autoplayMedia) => set({ autoplayMedia }),
      setDownloadOnWifiOnly: (downloadOnWifiOnly) => set({ downloadOnWifiOnly }),
      setPushEnabled: (pushEnabled) => set({ pushEnabled }),
      addRecentSearch: (query) =>
        set((state) => {
          const normalized = query.trim();
          if (normalized.length < 2) return state;
          return {
            recentSearches: [
              normalized,
              ...state.recentSearches.filter(
                (item) => item.toLowerCase() !== normalized.toLowerCase(),
              ),
            ].slice(0, 12),
          };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: "@skillbridge_preferences_v2",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        useDeviceLanguage: state.useDeviceLanguage,
        dataSaver: state.dataSaver,
        reduceMotion: state.reduceMotion,
        largeText: state.largeText,
        haptics: state.haptics,
        autoplayMedia: state.autoplayMedia,
        downloadOnWifiOnly: state.downloadOnWifiOnly,
        pushEnabled: state.pushEnabled,
        recentSearches: state.recentSearches,
      }),
    },
  ),
);
