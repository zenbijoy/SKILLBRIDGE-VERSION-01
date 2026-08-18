import { useColorScheme } from "react-native";
import { usePreferencesStore } from "@/state/usePreferencesStore";

export type AppPalette = {
  bg: string;
  surface: string;
  surface2: string;
  surfaceElevated: string;
  border: string;
  divider: string;
  primary: string;
  primary2: string;
  primarySoft: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  text: string;
  textSecondary: string;
  muted: string;
  white: string;
  black: string;
  overlay: string;
  tabBar: string;
};

export const lightColors: AppPalette = {
  bg: "#F7F9FC",
  surface: "#FFFFFF",
  surface2: "#F0F4FA",
  surfaceElevated: "#FFFFFF",
  border: "#E2E8F0",
  divider: "#EEF2F6",
  primary: "#2563EB",
  primary2: "#4F46E5",
  primarySoft: "#EAF1FF",
  accent: "#0F9F75",
  success: "#12B76A",
  warning: "#F59E0B",
  danger: "#E5484D",
  info: "#0284C7",
  text: "#101828",
  textSecondary: "#344054",
  muted: "#667085",
  white: "#FFFFFF",
  black: "#000000",
  overlay: "rgba(15, 23, 42, 0.42)",
  tabBar: "#FFFFFF",
};

export const darkColors: AppPalette = {
  bg: "#07111F",
  surface: "#0C192A",
  surface2: "#11243A",
  surfaceElevated: "#102036",
  border: "#1D3550",
  divider: "#152B45",
  primary: "#5B8CFF",
  primary2: "#755BFF",
  primarySoft: "#172B4D",
  accent: "#22D3A6",
  success: "#22C55E",
  warning: "#FFB44C",
  danger: "#FF5D7A",
  info: "#38BDF8",
  text: "#F5F8FF",
  textSecondary: "#D9E3F0",
  muted: "#91A4BD",
  white: "#FFFFFF",
  black: "#000000",
  overlay: "rgba(2, 8, 23, 0.68)",
  tabBar: "#0A1626",
};

// Backwards-compatible palette for legacy screens that have not yet moved to useTheme().
// Light is the new national-level default; upgraded screens respond live to theme changes.
export const colors = lightColors;

export const spacing = { xxs: 4, xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { xs: 8, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export function useTheme() {
  const system = useColorScheme();
  const preference = usePreferencesStore((state) => state.theme);
  const isDark = preference === "dark" || (preference === "system" && system === "dark");
  return {
    isDark,
    mode: isDark ? "dark" : "light",
    colors: isDark ? darkColors : lightColors,
  } as const;
}
