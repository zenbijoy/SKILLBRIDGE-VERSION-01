import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { H1, Muted, Screen } from "@/components/ui";
import { usePreferencesStore, type ThemePreference } from "@/state/usePreferencesStore";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";

export default function AppearanceSettings() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const options: { value: ThemePreference; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { value: "system", label: t("settings.themeSystem"), icon: "cellphone-cog" },
    { value: "light", label: t("settings.themeLight"), icon: "white-balance-sunny" },
    { value: "dark", label: t("settings.themeDark"), icon: "moon-waning-crescent" },
  ];
  return (
    <Screen>
      <H1>{t("settings.appearanceTitle")}</H1>
      <Muted>The upgraded primary screens and design-system components switch immediately. Legacy screens remain compatible and can be migrated progressively.</Muted>
      <View style={s.grid}>
        {options.map((option) => (
          <Pressable key={option.value} onPress={() => setTheme(option.value)} style={[s.item, { backgroundColor: colors.surface, borderColor: theme === option.value ? colors.primary : colors.border }]}>
            <MaterialCommunityIcons name={option.icon} size={30} color={theme === option.value ? colors.primary : colors.muted} />
            <Text style={{ color: colors.text, fontWeight: "800", textAlign: "center" }}>{option.label}</Text>
            {theme === option.value ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} /> : null}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({ grid: { flexDirection: "row", gap: 10 }, item: { flex: 1, minHeight: 150, borderWidth: 2, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 12, padding: 10 } });
