import { useColorScheme } from "react-native";
import { usePreferencesStore, type AccentColor, type CardStyle } from "@/state/usePreferencesStore";

export type AppPalette = {
  bg: string;
  background: string;
  surface: string;
  surface2: string;
  surfaceMuted: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  divider: string;
  primary: string;
  primary2: string;
  primaryPressed: string;
  primarySoft: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  text: string;
  textPrimary: string;
  textSecondary: string;
  muted: string;
  textMuted: string;
  textInverse: string;
  white: string;
  black: string;
  overlay: string;
  tabBar: string;
};

const accents: Record<
  AccentColor,
  {
    light: { primary: string; primary2: string; primarySoft: string; accent: string };
    dark: { primary: string; primary2: string; primarySoft: string; accent: string };
  }
> = {
  ocean: {
    light: { primary: "#2563EB", primary2: "#4F46E5", primarySoft: "#EAF1FF", accent: "#0F9F75" },
    dark: { primary: "#5B8CFF", primary2: "#755BFF", primarySoft: "#172B4D", accent: "#22D3A6" },
  },
  emerald: {
    light: { primary: "#059669", primary2: "#047857", primarySoft: "#ECFDF5", accent: "#3B82F6" },
    dark: { primary: "#10B981", primary2: "#34D399", primarySoft: "#064E3B", accent: "#60A5FA" },
  },
  violet: {
    light: { primary: "#7C3AED", primary2: "#6D28D9", primarySoft: "#F5F3FF", accent: "#F59E0B" },
    dark: { primary: "#A78BFA", primary2: "#C084FC", primarySoft: "#2E1065", accent: "#FBBF24" },
  },
  sunset: {
    light: { primary: "#E11D48", primary2: "#EA580C", primarySoft: "#FFF1F2", accent: "#6366F1" },
    dark: { primary: "#FB7185", primary2: "#FB923C", primarySoft: "#4C0519", accent: "#818CF8" },
  },
  cyberpunk: {
    light: { primary: "#0891B2", primary2: "#D97706", primarySoft: "#ECFEFF", accent: "#DB2777" },
    dark: { primary: "#22D3EE", primary2: "#FCD34D", primarySoft: "#164E63", accent: "#F472B6" },
  },
};

export function getPalette(isDark: boolean, isOled: boolean, accentKey: AccentColor = "ocean"): AppPalette {
  const accent = isDark ? accents[accentKey].dark : accents[accentKey].light;

  if (isOled) {
    return {
      bg: "#000000",
      background: "#000000",
      surface: "#09090B",
      surface2: "#121215",
      surfaceMuted: "#121215",
      surfaceElevated: "#18181B",
      border: "#27272A",
      borderStrong: "#3F3F46",
      divider: "#18181B",
      primary: accent.primary,
      primary2: accent.primary2,
      primaryPressed: accent.primary2,
      primarySoft: accent.primarySoft,
      accent: accent.accent,
      success: "#22C55E",
      warning: "#FFB44C",
      danger: "#FF5D7A",
      info: "#38BDF8",
      text: "#FFFFFF",
      textPrimary: "#FFFFFF",
      textSecondary: "#D4D4D8",
      muted: "#71717A",
      textMuted: "#71717A",
      textInverse: "#000000",
      white: "#FFFFFF",
      black: "#000000",
      overlay: "rgba(0, 0, 0, 0.85)",
      tabBar: "#000000",
    };
  }

  if (isDark) {
    return {
      bg: "#08101E",
      background: "#08101E",
      surface: "#0F1A2E",
      surface2: "#15243C",
      surfaceMuted: "#15243C",
      surfaceElevated: "#182844",
      border: "#1E3250",
      borderStrong: "#2E4A74",
      divider: "#172840",
      primary: accent.primary,
      primary2: accent.primary2,
      primaryPressed: accent.primary2,
      primarySoft: accent.primarySoft,
      accent: accent.accent,
      success: "#22C55E",
      warning: "#FFB44C",
      danger: "#FF5D7A",
      info: "#38BDF8",
      text: "#F8FAFC",
      textPrimary: "#F8FAFC",
      textSecondary: "#CBD5E1",
      muted: "#94A3B8",
      textMuted: "#94A3B8",
      textInverse: "#08101E",
      white: "#FFFFFF",
      black: "#000000",
      overlay: "rgba(2, 8, 23, 0.72)",
      tabBar: "#0B1322",
    };
  }

  return {
    bg: "#F8FAFC",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surface2: "#F1F5F9",
    surfaceMuted: "#F1F5F9",
    surfaceElevated: "#FFFFFF",
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    divider: "#F1F5F9",
    primary: accent.primary,
    primary2: accent.primary2,
    primaryPressed: accent.primary2,
    primarySoft: accent.primarySoft,
    accent: accent.accent,
    success: "#12B76A",
    warning: "#F59E0B",
    danger: "#E5484D",
    info: "#0284C7",
    text: "#0F172A",
    textPrimary: "#0F172A",
    textSecondary: "#334155",
    muted: "#64748B",
    textMuted: "#64748B",
    textInverse: "#FFFFFF",
    white: "#FFFFFF",
    black: "#000000",
    overlay: "rgba(15, 23, 42, 0.45)",
    tabBar: "#FFFFFF",
  };
}

export const lightColors = getPalette(false, false, "ocean");
export const darkColors = getPalette(true, false, "ocean");
export const colors = lightColors;

export const brandGradients = {
  brand: ["#53A9FE", "#703AF0", "#C23DBD"] as const,
  brandLight: ["#57B3FE", "#844FF5", "#F765B6"] as const,
  primary: ["#2563EB", "#4F46E5"] as const,
  primaryDark: ["#3B82F6", "#6366F1"] as const,
  accent: ["#0F9F75", "#2563EB"] as const,
  accentDark: ["#10B981", "#3B82F6"] as const,
  fire: ["#F97316", "#EF4444"] as const,
  gold: ["#F59E0B", "#D97706"] as const,
  emerald: ["#10B981", "#059669"] as const,
  purple: ["#8B5CF6", "#6D28D9"] as const,
  pink: ["#EC4899", "#BE185D"] as const,
  cyber: ["#06B6D4", "#3B82F6"] as const,
  darkCard: ["#131B2E", "#0B111E"] as const,
  glassOverlay: ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)"] as const,
};

export const spacing = { xxs: 4, xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export function getRadius(cardStyle: CardStyle = "smooth") {
  if (cardStyle === "rounded") {
    return { xs: 6, sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
  }
  if (cardStyle === "pill") {
    return { xs: 10, sm: 14, md: 18, lg: 24, xl: 30, pill: 999 } as const;
  }
  return { xs: 8, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
}

export const radius = getRadius("smooth");

import {
  darkSemanticColors,
  oledSemanticColors,
  lightSemanticColors,
  spacingTokens,
  radiusTokens,
  typographyTokens,
  elevationTokens,
  motionTokens,
  breakpointTokens,
  type SemanticColors,
} from "./tokens";

export function useTheme() {
  const system = useColorScheme();
  const preference = usePreferencesStore((state) => state.theme);
  const accent = usePreferencesStore((state) => state.accentColor);
  const cardStyle = usePreferencesStore((state) => state.cardStyle);

  const isOled = preference === "oled";
  const isDark = isOled || preference === "dark" || (preference === "system" && system === "dark");
  const currentColors = getPalette(isDark, isOled, accent);
  const currentRadius = getRadius(cardStyle);

  const semanticTokens: SemanticColors = isOled
    ? oledSemanticColors
    : isDark
    ? darkSemanticColors
    : lightSemanticColors;

  return {
    isDark,
    isOled,
    mode: isOled ? "oled" : isDark ? "dark" : "light",
    colors: currentColors,
    radius: currentRadius,
    accent,
    cardStyle,
    tokens: {
      colors: semanticTokens,
      spacing: spacingTokens,
      radius: radiusTokens,
      typography: typographyTokens,
      elevation: elevationTokens,
      motion: motionTokens,
      breakpoints: breakpointTokens,
    },
  } as const;
}

export * from "./brand";
export * from "./tokens";
