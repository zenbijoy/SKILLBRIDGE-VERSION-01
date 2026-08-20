import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, Card, H1, H2, Muted, Pill, Row, Screen, SectionHeader } from "@/components/ui";
import { usePreferencesStore, type AccentColor, type CardStyle, type ThemePreference } from "@/state/usePreferencesStore";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";

export default function AppearanceSettings() {
  const { colors, isDark, isOled, accent, cardStyle } = useTheme();
  const { t } = useI18n();
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const setAccentColor = usePreferencesStore((state) => state.setAccentColor);
  const setCardStyle = usePreferencesStore((state) => state.setCardStyle);

  const themeOptions: { value: ThemePreference; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { value: "system", label: t("settings.themeSystem"), icon: "cellphone-cog" },
    { value: "light", label: t("settings.themeLight"), icon: "white-balance-sunny" },
    { value: "dark", label: t("settings.themeDark"), icon: "moon-waning-crescent" },
    { value: "oled", label: "OLED Black", icon: "circle-slice-8" },
  ];

  const accentOptions: { key: AccentColor; label: string; color: string; secondary: string }[] = [
    { key: "ocean", label: "Ocean Blue", color: "#2563EB", secondary: "#4F46E5" },
    { key: "emerald", label: "Emerald Mint", color: "#059669", secondary: "#047857" },
    { key: "violet", label: "Royal Violet", color: "#7C3AED", secondary: "#6D28D9" },
    { key: "sunset", label: "Sunset Coral", color: "#E11D48", secondary: "#EA580C" },
    { key: "cyberpunk", label: "Electric Cyan", color: "#0891B2", secondary: "#D97706" },
  ];

  const styleOptions: { key: CardStyle; label: string; desc: string }[] = [
    { key: "rounded", label: "Modern", desc: "12px radius" },
    { key: "smooth", label: "Smooth", desc: "16px radius (Default)" },
    { key: "pill", label: "Soft Pill", desc: "24px radius" },
  ];

  return (
    <Screen>
      <H1>{t("settings.appearanceTitle")}</H1>
      <Muted>Customize your color theme, background depth, and corner geometry. All updates apply live across the application.</Muted>

      {/* Live Interactive Preview Card */}
      <Card tone="glow">
        <Row>
          <Pill tone="primary">Live Preview</Pill>
          <Pill tone="accent">● Active</Pill>
        </Row>
        <H2>SkillBridge Design Engine</H2>
        <Muted>Cards, buttons, navigation bars and headers adapt instantly to your selected palette.</Muted>
        <Row>
          <Button title="Primary Action" variant="primary" compact />
          <Button title="Secondary" variant="secondary" compact />
        </Row>
      </Card>

      {/* Display Mode */}
      <SectionHeader title="Display Mode" />
      <View style={s.grid2}>
        {themeOptions.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => setTheme(option.value)}
            style={({ pressed }) => [
              s.themeItem,
              {
                backgroundColor: colors.surface,
                borderColor: theme === option.value ? colors.primary : colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={option.icon}
              size={26}
              color={theme === option.value ? colors.primary : colors.muted}
            />
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>{option.label}</Text>
            {theme === option.value ? (
              <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </View>

      {/* Accent Palettes */}
      <SectionHeader title="Accent Palette" />
      <View style={s.accentList}>
        {accentOptions.map((acc) => (
          <Pressable
            key={acc.key}
            onPress={() => setAccentColor(acc.key)}
            style={({ pressed }) => [
              s.accentCard,
              {
                backgroundColor: colors.surface,
                borderColor: accent === acc.key ? colors.primary : colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={[s.swatch, { backgroundColor: acc.color }]}>
              <View style={[s.swatchHalf, { backgroundColor: acc.secondary }]} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{acc.label}</Text>
              <Muted>{acc.color}</Muted>
            </View>
            {accent === acc.key ? (
              <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />
            ) : (
              <View style={[s.radioCircle, { borderColor: colors.border }]} />
            )}
          </Pressable>
        ))}
      </View>

      {/* Card Geometry */}
      <SectionHeader title="Card & Component Geometry" />
      <View style={s.styleGrid}>
        {styleOptions.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setCardStyle(opt.key)}
            style={({ pressed }) => [
              s.styleItem,
              {
                backgroundColor: colors.surface,
                borderColor: cardStyle === opt.key ? colors.primary : colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>{opt.label}</Text>
            <Muted style={{ fontSize: 11 }}>{opt.desc}</Muted>
            {cardStyle === opt.key ? (
              <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  themeItem: {
    width: "48%",
    minHeight: 88,
    borderWidth: 2,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
  },
  accentList: { gap: 10 },
  accentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  swatchHalf: {
    height: 22,
    width: 44,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  styleGrid: { flexDirection: "row", gap: 10 },
  styleItem: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 74,
  },
});
