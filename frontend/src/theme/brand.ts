/**
 * Official SkillBridge Brand Design Tokens
 * Sampled and derived directly from the official SkillBridge brand mark.
 */
export const brandColors = Object.freeze({
  // Direct sampled logo gradient colors
  brandBlue: "#53A9FE", // Left figure base / lower connection curve
  brandCyan: "#57B3FE", // Left figure bright cyan-blue highlight
  brandViolet: "#703AF0", // Left figure body / royal violet
  brandPurple: "#844FF5", // Left figure head / electric purple
  brandBridgeBlend: "#B8ADF9", // Center bridge translucent gradient transition
  brandMagenta: "#C23DBD", // Right figure arm / vibrant magenta
  brandPink: "#F765B6", // Right figure head / radiant pink
  brandPinkLight: "#FC6FB3", // Right figure body soft highlight

  // Brand canonical surfaces
  brandBackgroundLight: "#FFFFFF",
  brandBackgroundDark: "#08101E", // SkillBridge canonical midnight dark surface
  brandSurfaceLight: "#F8FAFC",
  brandSurfaceDark: "#0F1A2E",
  brandTextDark: "#0F172A",
  brandTextLight: "#F8FAFC",
});

export type BrandColors = typeof brandColors;
