import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemePreference = "system" | "light" | "dark" | "oled";
export type AccentColor = "ocean" | "emerald" | "violet" | "sunset" | "cyberpunk";
export type CardStyle = "rounded" | "smooth" | "pill";
export type AppLanguage = "en" | "bn";
export type DataSaverMode = "off" | "standard" | "extreme";

interface PreferencesState {
  theme: ThemePreference;
  accentColor: AccentColor;
  cardStyle: CardStyle;
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
  setAccentColor: (accent: AccentColor) => void;
  setCardStyle: (style: CardStyle) => void;
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
      accentColor: "ocean",
      cardStyle: "smooth",
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
      setAccentColor: (accentColor) => set({ accentColor }),
      setCardStyle: (cardStyle) => set({ cardStyle }),
      setLanguage: (language) => set({ language, useDeviceLanguage: false }),
      setUseDeviceLanguage: (useDeviceLanguage) => set({ useDeviceLanguage }),
      setDataSaver: (dataSaver) => set((state) => ({
        dataSaver,
        autoplayMedia: dataSaver === "extreme" ? false : state.autoplayMedia,
        downloadOnWifiOnly: dataSaver === "extreme" ? true : state.downloadOnWifiOnly,
      })),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setLargeText: (largeText) => set({ largeText }),
      setHaptics: (haptics) => set({ haptics }),
      setAutoplayMedia: (autoplayMedia) => set((state) => ({
        autoplayMedia: state.dataSaver === "extreme" ? false : autoplayMedia,
      })),
      setDownloadOnWifiOnly: (downloadOnWifiOnly) => set((state) => ({
        downloadOnWifiOnly: state.dataSaver === "extreme" ? true : downloadOnWifiOnly,
      })),
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
        accentColor: state.accentColor,
        cardStyle: state.cardStyle,
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
