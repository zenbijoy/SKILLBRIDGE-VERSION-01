import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import { useTheme } from "@/theme";

export type SemanticIconName =
  // Navigation & Structure
  | "home"
  | "discover"
  | "rooms"
  | "network"
  | "tools"
  | "feed"
  | "schedule"
  | "vault"
  | "goals"
  | "planner"
  | "progress"
  | "clubs"
  | "leaderboard"
  | "quiz"
  | "achievements"
  | "saved"
  | "research"
  | "help"
  | "settings"
  | "menu"
  | "panel-left-close"
  | "panel-left-open"
  | "close"
  | "search"
  | "bell"
  | "message"
  | "user"
  | "download"
  | "plus"
  | "check"
  | "chevron-right"
  | "chevron-left"
  | "chevron-down"
  | "chevron-up"
  | "arrow-up"
  | "arrow-right"
  | "external-link"
  | "video"
  | "file-text"
  | "help-circle"
  | "trophy"
  | "fire"
  | "zap"
  | "sliders"
  | "clock"
  | "calendar"
  | "book-open"
  | "code"
  | "share";

export interface IconProps {
  name: SemanticIconName | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  ariaLabel?: string;
}

interface IconMapping {
  library: "material" | "ionicons" | "feather";
  glyph: string;
}

const SEMANTIC_ICON_MAP: Record<string, IconMapping> = {
  // Navigation
  home: { library: "material", glyph: "home-variant" },
  discover: { library: "material", glyph: "compass-outline" },
  rooms: { library: "material", glyph: "account-group-outline" },
  network: { library: "material", glyph: "account-multiple-outline" },
  tools: { library: "material", glyph: "toolbox-outline" },
  feed: { library: "material", glyph: "newspaper-variant-outline" },
  schedule: { library: "material", glyph: "calendar-clock" },
  vault: { library: "material", glyph: "archive-outline" },
  goals: { library: "material", glyph: "target" },
  planner: { library: "material", glyph: "notebook-outline" },
  progress: { library: "material", glyph: "chart-line-variant" },
  clubs: { library: "material", glyph: "shield-account" },
  leaderboard: { library: "material", glyph: "trophy-outline" },
  quiz: { library: "material", glyph: "lightning-bolt-outline" },
  achievements: { library: "material", glyph: "medal-outline" },
  saved: { library: "material", glyph: "bookmark-outline" },
  research: { library: "material", glyph: "flask-outline" },
  help: { library: "material", glyph: "help-circle-outline" },
  settings: { library: "material", glyph: "cog-outline" },

  // Shell controls
  menu: { library: "feather", glyph: "menu" },
  "panel-left-close": { library: "feather", glyph: "sidebar" },
  "panel-left-open": { library: "feather", glyph: "sidebar" },
  close: { library: "feather", glyph: "x" },
  search: { library: "feather", glyph: "search" },
  bell: { library: "feather", glyph: "bell" },
  message: { library: "feather", glyph: "message-square" },
  user: { library: "feather", glyph: "user" },
  download: { library: "feather", glyph: "download" },
  plus: { library: "feather", glyph: "plus" },
  check: { library: "feather", glyph: "check" },
  "chevron-right": { library: "feather", glyph: "chevron-right" },
  "chevron-left": { library: "feather", glyph: "chevron-left" },
  "chevron-down": { library: "feather", glyph: "chevron-down" },
  "chevron-up": { library: "feather", glyph: "chevron-up" },
  "arrow-up": { library: "feather", glyph: "arrow-up" },
  "arrow-right": { library: "feather", glyph: "arrow-right" },
  "external-link": { library: "feather", glyph: "external-link" },
  sliders: { library: "feather", glyph: "sliders" },
  share: { library: "feather", glyph: "share-2" },

  // Action cards & badges
  video: { library: "feather", glyph: "video" },
  "file-text": { library: "feather", glyph: "file-text" },
  "help-circle": { library: "feather", glyph: "help-circle" },
  trophy: { library: "material", glyph: "trophy-outline" },
  fire: { library: "material", glyph: "fire" },
  zap: { library: "feather", glyph: "zap" },
  clock: { library: "feather", glyph: "clock" },
  calendar: { library: "feather", glyph: "calendar" },
  "book-open": { library: "feather", glyph: "book-open" },
  code: { library: "feather", glyph: "code" },
};

/**
 * Standard Unified Icon component for SkillBridge.
 * Guarantees crisp, consistent icon rendering across Web and Native.
 */
export function Icon({
  name,
  size = 18,
  color,
  style,
  ariaLabel,
}: IconProps) {
  const { colors } = useTheme();
  const iconColor = color || colors.text;

  const mapping = SEMANTIC_ICON_MAP[name];

  if (!mapping) {
    if (name in MaterialCommunityIcons.glyphMap) {
      return (
        <View style={[styles.container, { width: size, height: size }, style]} aria-label={ariaLabel}>
          <MaterialCommunityIcons name={name as any} size={size} color={iconColor} />
        </View>
      );
    }
    if (name in Feather.glyphMap) {
      return (
        <View style={[styles.container, { width: size, height: size }, style]} aria-label={ariaLabel}>
          <Feather name={name as any} size={size} color={iconColor} />
        </View>
      );
    }
    if (name in Ionicons.glyphMap) {
      return (
        <View style={[styles.container, { width: size, height: size }, style]} aria-label={ariaLabel}>
          <Ionicons name={name as any} size={size} color={iconColor} />
        </View>
      );
    }
    // Direct MaterialCommunityIcons fallback if not found in any map
    return (
      <View style={[styles.container, { width: size, height: size }, style]} aria-label={ariaLabel}>
        <MaterialCommunityIcons name={name as any} size={size} color={iconColor} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size }, style]} aria-label={ariaLabel}>
      {mapping.library === "feather" && (
        <Feather name={mapping.glyph as any} size={size} color={iconColor} />
      )}
      {mapping.library === "material" && (
        <MaterialCommunityIcons name={mapping.glyph as any} size={size} color={iconColor} />
      )}
      {mapping.library === "ionicons" && (
        <Ionicons name={mapping.glyph as any} size={size} color={iconColor} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
