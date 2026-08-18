import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Card, H1, Muted, Screen, SettingSwitch } from "@/components/ui";
import { useI18n } from "@/i18n";
import { usePreferencesStore, type AppLanguage } from "@/state/usePreferencesStore";
import { radius, useTheme } from "@/theme";

export default function LanguageSettings() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const language = usePreferencesStore((state) => state.language);
  const useDeviceLanguage = usePreferencesStore((state) => state.useDeviceLanguage);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const setUseDeviceLanguage = usePreferencesStore((state) => state.setUseDeviceLanguage);
  const options: { value: AppLanguage; label: string; detail: string }[] = [
    { value: "en", label: "English", detail: "Primary interface language" },
    { value: "bn", label: "বাংলা", detail: "বাংলা ইন্টারফেস ভাষা" },
  ];
  return (
    <Screen>
      <H1>{t("settings.languageTitle")}</H1>
      <Muted>Change the core SkillBridge interface instantly. Existing legacy feature screens can continue using English until their translation keys are added.</Muted>
      <Card>
        {options.map((option) => (
          <Pressable key={option.value} onPress={() => setLanguage(option.value)} style={[s.option, { borderColor: language === option.value && !useDeviceLanguage ? colors.primary : colors.border, backgroundColor: language === option.value && !useDeviceLanguage ? colors.primarySoft : colors.surface }]}>
            <View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{option.label}</Text><Muted>{option.detail}</Muted></View>
            <MaterialCommunityIcons name={language === option.value && !useDeviceLanguage ? "radiobox-marked" : "radiobox-blank"} size={22} color={language === option.value && !useDeviceLanguage ? colors.primary : colors.muted} />
          </Pressable>
        ))}
        <SettingSwitch title="Use device language" detail="Use Bengali automatically when the device locale is Bengali; otherwise English." value={useDeviceLanguage} onValueChange={setUseDeviceLanguage} />
      </Card>
    </Screen>
  );
}
const s = StyleSheet.create({ option: { minHeight: 66, borderWidth: 1, borderRadius: radius.md, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 } });
