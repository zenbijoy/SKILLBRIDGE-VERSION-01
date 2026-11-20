/**
 * SkillBridge Design System Tokens (Linear / Notion / Raycast inspired)
 * Standardized semantic design tokens for web, iOS, and Android.
 */

export interface SemanticColors {
  // Background surfaces
  bgBase: string;
  bgSurface1: string;
  bgSurface2: string;
  bgSurface3: string;
  bgSurfaceGlass: string;
  bgOverlay: string;

  // Borders & Dividers
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  borderFocus: string;

  // Typography
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  textInverse: string;

  // Brand & Action
  brandPrimary: string;
  brandPrimaryHover: string;
  brandPrimaryPressed: string;
  brandPrimarySubtle: string;

  // Semantic Status
  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerSubtle: string;
  info: string;
  infoSubtle: string;
}

export const darkSemanticColors: SemanticColors = {
  bgBase: "#090A0F",
  bgSurface1: "#12131A",
  bgSurface2: "#181924",
  bgSurface3: "#222332",
  bgSurfaceGlass: "rgba(18, 19, 26, 0.82)",
  bgOverlay: "rgba(9, 10, 15, 0.80)",

  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderDefault: "rgba(255, 255, 255, 0.10)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  borderFocus: "#6366F1",

  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textTertiary: "#64748B",
  textDisabled: "#475569",
  textInverse: "#090A0F",

  brandPrimary: "#6366F1",
  brandPrimaryHover: "#4F46E5",
  brandPrimaryPressed: "#4338CA",
  brandPrimarySubtle: "rgba(99, 102, 241, 0.14)",

  success: "#10B981",
  successSubtle: "rgba(16, 185, 129, 0.14)",
  warning: "#F59E0B",
  warningSubtle: "rgba(245, 158, 11, 0.14)",
  danger: "#EF4444",
  dangerSubtle: "rgba(239, 68, 68, 0.14)",
  info: "#06B6D4",
  infoSubtle: "rgba(6, 182, 212, 0.14)",
};

export const oledSemanticColors: SemanticColors = {
  ...darkSemanticColors,
  bgBase: "#000000",
  bgSurface1: "#09090C",
  bgSurface2: "#111116",
  bgSurface3: "#1A1A22",
  bgSurfaceGlass: "rgba(9, 9, 12, 0.88)",
  bgOverlay: "rgba(0, 0, 0, 0.90)",
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  borderDefault: "rgba(255, 255, 255, 0.14)",
};

export const lightSemanticColors: SemanticColors = {
  bgBase: "#F8FAFC",
  bgSurface1: "#FFFFFF",
  bgSurface2: "#F1F5F9",
  bgSurface3: "#E2E8F0",
  bgSurfaceGlass: "rgba(255, 255, 255, 0.88)",
  bgOverlay: "rgba(15, 23, 42, 0.50)",

  borderSubtle: "rgba(0, 0, 0, 0.06)",
  borderDefault: "rgba(0, 0, 0, 0.10)",
  borderStrong: "rgba(0, 0, 0, 0.16)",
  borderFocus: "#4F46E5",

  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#64748B",
  textDisabled: "#94A3B8",
  textInverse: "#FFFFFF",

  brandPrimary: "#4F46E5",
  brandPrimaryHover: "#4338CA",
  brandPrimaryPressed: "#3730A3",
  brandPrimarySubtle: "rgba(79, 70, 229, 0.10)",

  success: "#059669",
  successSubtle: "rgba(5, 150, 105, 0.10)",
  warning: "#D97706",
  warningSubtle: "rgba(217, 119, 6, 0.10)",
  danger: "#DC2626",
  dangerSubtle: "rgba(220, 38, 38, 0.10)",
  info: "#0284C7",
  infoSubtle: "rgba(2, 132, 199, 0.10)",
};

/** Standard 8-point geometric spacing tokens */
export const spacingTokens = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

/** Standard corner radius tokens */
export const radiusTokens = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

/** Typographic scale */
export interface TypographyStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700" | "800";
  letterSpacing?: number;
}

export const typographyTokens: Record<string, TypographyStyle> = {
  display1: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  title1: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  title2: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  title3: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  bodyBase: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  monoCode: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
};

/** Elevation & Shadow definitions */
export const elevationTokens = {
  subtle: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 1,
  },
  elevated: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 4,
  },
  overlay: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.50,
    shadowRadius: 36,
    elevation: 10,
  },
  brandGlow: {
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;

/** Motion & Transition standards */
export const motionTokens = {
  durationFast: 150,
  durationBase: 200,
  durationSlow: 300,
  easeStandard: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeOut: "ease-out",
} as const;

/** Standard responsive breakpoints (in pixels) */
export const breakpointTokens = {
  mobile: 640,
  tablet: 768,
  laptop: 1024,
  desktop: 1280,
  widescreen: 1536,
} as const;

/** Generates CSS custom properties string for web runtime */
export function generateCssVariables(colors: SemanticColors): string {
  return `
    :root {
      --bg-base: ${colors.bgBase};
      --bg-surface-1: ${colors.bgSurface1};
      --bg-surface-2: ${colors.bgSurface2};
      --bg-surface-3: ${colors.bgSurface3};
      --bg-surface-glass: ${colors.bgSurfaceGlass};
      --bg-overlay: ${colors.bgOverlay};

      --border-subtle: ${colors.borderSubtle};
      --border-default: ${colors.borderDefault};
      --border-strong: ${colors.borderStrong};
      --border-focus: ${colors.borderFocus};

      --text-primary: ${colors.textPrimary};
      --text-secondary: ${colors.textSecondary};
      --text-tertiary: ${colors.textTertiary};
      --text-disabled: ${colors.textDisabled};
      --text-inverse: ${colors.textInverse};

      --brand-primary: ${colors.brandPrimary};
      --brand-primary-hover: ${colors.brandPrimaryHover};
      --brand-primary-subtle: ${colors.brandPrimarySubtle};

      --status-success: ${colors.success};
      --status-warning: ${colors.warning};
      --status-danger: ${colors.danger};
      --status-info: ${colors.info};

      --radius-sm: ${radiusTokens.sm}px;
      --radius-md: ${radiusTokens.md}px;
      --radius-lg: ${radiusTokens.lg}px;
      --radius-xl: ${radiusTokens.xl}px;
      --radius-full: ${radiusTokens.full}px;
    }
  `;
}
