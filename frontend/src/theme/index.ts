import { useColorScheme } from "react-native";
import { usePreferencesStore, type AccentColor, type CardStyle } from "@/state/usePreferencesStore";

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
      surface: "#09090B",
      surface2: "#121215",
      surfaceElevated: "#18181B",
      border: "#27272A",
      divider: "#18181B",
      primary: accent.primary,
      primary2: accent.primary2,
      primarySoft: accent.primarySoft,
      accent: accent.accent,
      success: "#22C55E",
      warning: "#FFB44C",
      danger: "#FF5D7A",
      info: "#38BDF8",
      text: "#FFFFFF",
      textSecondary: "#D4D4D8",
      muted: "#71717A",
      white: "#FFFFFF",
      black: "#000000",
      overlay: "rgba(0, 0, 0, 0.85)",
      tabBar: "#000000",
    };
  }

  if (isDark) {
    return {
      bg: "#07111F",
      surface: "#0C192A",
      surface2: "#11243A",
      surfaceElevated: "#102036",
      border: "#1D3550",
      divider: "#152B45",
      primary: accent.primary,
      primary2: accent.primary2,
      primarySoft: accent.primarySoft,
      accent: accent.accent,
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
  }

  return {
    bg: "#F7F9FC",
    surface: "#FFFFFF",
    surface2: "#F0F4FA",
    surfaceElevated: "#FFFFFF",
    border: "#E2E8F0",
    divider: "#EEF2F6",
    primary: accent.primary,
    primary2: accent.primary2,
    primarySoft: accent.primarySoft,
    accent: accent.accent,
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
}

export const lightColors = getPalette(false, false, "ocean");
export const darkColors = getPalette(true, false, "ocean");
export const colors = lightColors;

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

export function useTheme() {
  const system = useColorScheme();
  const preference = usePreferencesStore((state) => state.theme);
  const accent = usePreferencesStore((state) => state.accentColor);
  const cardStyle = usePreferencesStore((state) => state.cardStyle);

  const isOled = preference === "oled";
  const isDark = isOled || preference === "dark" || (preference === "system" && system === "dark");
  const currentColors = getPalette(isDark, isOled, accent);
  const currentRadius = getRadius(cardStyle);

  return {
    isDark,
    isOled,
    mode: isOled ? "oled" : isDark ? "dark" : "light",
    colors: currentColors,
    radius: currentRadius,
    accent,
    cardStyle,
  } as const;
}
