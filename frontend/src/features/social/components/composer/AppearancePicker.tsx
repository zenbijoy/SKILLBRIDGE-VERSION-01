import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { VISUAL_THEMES, VisualThemePreset } from "../../constants";
import type { PostAppearance } from "../../types";

interface AppearancePickerProps {
  appearance: PostAppearance;
  onChangeAppearance: (app: PostAppearance) => void;
  onClose?: () => void;
}

export function AppearancePicker({ appearance, onChangeAppearance, onClose }: AppearancePickerProps) {
  const { colors } = useTheme();

  const activeThemeId = appearance.theme || "default";
  const activeAlignment = appearance.alignment || "center";

  const handleSelectTheme = (theme: VisualThemePreset) => {
    triggerHaptic("selection");
    onChangeAppearance({
      ...appearance,
      theme: theme.id as any,
      backgroundType: theme.backgroundType,
      textColor: theme.textColor,
    });
  };

  const handleSelectAlignment = (align: "left" | "center" | "right") => {
    triggerHaptic("selection");
    onChangeAppearance({
      ...appearance,
      alignment: align,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <Row style={styles.headerRow}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="palette" size={16} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>Card Style & Gradients</Text>
        </Row>
        {/* Alignment Toggles */}
        <Row style={[styles.alignRow, { borderColor: colors.border }]}>
          <Pressable
            onPress={() => handleSelectAlignment("left")}
            style={[styles.alignBtn, activeAlignment === "left" && { backgroundColor: `${colors.primary}20` }]}
          >
            <MaterialCommunityIcons
              name="format-align-left"
              size={16}
              color={activeAlignment === "left" ? colors.primary : colors.muted}
            />
          </Pressable>
          <Pressable
            onPress={() => handleSelectAlignment("center")}
            style={[styles.alignBtn, activeAlignment === "center" && { backgroundColor: `${colors.primary}20` }]}
          >
            <MaterialCommunityIcons
              name="format-align-center"
              size={16}
              color={activeAlignment === "center" ? colors.primary : colors.muted}
            />
          </Pressable>
          <Pressable
            onPress={() => handleSelectAlignment("right")}
            style={[styles.alignBtn, activeAlignment === "right" && { backgroundColor: `${colors.primary}20` }]}
          >
            <MaterialCommunityIcons
              name="format-align-right"
              size={16}
              color={activeAlignment === "right" ? colors.primary : colors.muted}
            />
          </Pressable>
        </Row>
      </Row>

      {/* Theme Swatches */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchScroll}>
        {VISUAL_THEMES.map((theme: VisualThemePreset) => {
          const isSelected = activeThemeId === theme.id;
          return (
            <Pressable
              key={theme.id}
              onPress={() => handleSelectTheme(theme)}
              style={[
                styles.swatchItem,
                isSelected && { borderColor: colors.primary, transform: [{ scale: 1.08 }] },
              ]}
            >
              <LinearGradient
                colors={theme.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.swatchGradient}
              >
                {isSelected && (
                  <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                )}
              </LinearGradient>
              <Text
                style={[
                  styles.swatchLabel,
                  { color: isSelected ? colors.primary : colors.muted, fontWeight: isSelected ? "700" : "500" },
                ]}
                numberOfLines={1}
              >
                {theme.name.split(" ")[0]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  headerRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  alignRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  alignBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  swatchScroll: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
  },
  swatchItem: {
    alignItems: "center",
    width: 52,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: radius.md,
    padding: 2,
  },
  swatchGradient: {
    width: 44,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchLabel: {
    fontSize: 10.5,
    marginTop: 4,
    textAlign: "center",
  },
});
