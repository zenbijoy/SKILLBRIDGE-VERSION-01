import { router } from "expo-router";
import { H1, H2, Muted, Screen } from "@/components/ui";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { useI18n } from "@/i18n";
import { usePreferencesStore } from "@/state/usePreferencesStore";

export default function SettingsHome() {
  const { t, language } = useI18n();
  const theme = usePreferencesStore((state) => state.theme);
  const dataSaver = usePreferencesStore((state) => state.dataSaver);
  return (
    <Screen>
      <H1>{t("settings.title")}</H1>
      <Muted>{t("settings.searchHint")}</Muted>

      <H2>{t("settings.account")}</H2>
      <SettingsRow icon="account-edit-outline" title={t("settings.profile")} detail="Name, username, university and bio" onPress={() => router.push("/settings/profile" as any)} />
      <SettingsRow icon="school-outline" title={t("settings.skills")} detail="Teaching skills, learning goals and research interests" onPress={() => router.push("/settings/skills" as any)} />

      <H2>{t("settings.preferences")}</H2>
      <SettingsRow icon="translate" title={t("settings.language")} detail="বাংলা and English runtime language" value={language === "bn" ? "বাংলা" : "English"} onPress={() => router.push("/settings/language" as any)} />
      <SettingsRow icon="theme-light-dark" title={t("settings.appearance")} detail="Light, dark or follow the device" value={theme} onPress={() => router.push("/settings/appearance" as any)} />
      <SettingsRow icon="bell-outline" title={t("settings.notifications")} detail="Push registration and notification controls" onPress={() => router.push("/settings/notifications" as any)} />
      <SettingsRow icon="database-outline" title={t("settings.data")} detail="Data saver, autoplay and download behavior" value={dataSaver} onPress={() => router.push("/settings/data-storage" as any)} />
      <SettingsRow icon="human" title={t("settings.accessibility")} detail="Large text, reduced motion and interaction comfort" onPress={() => router.push("/settings/accessibility" as any)} />

      <H2>{t("settings.privacySecurity")}</H2>
      <SettingsRow icon="shield-account-outline" title={t("settings.privacy")} detail="Profile visibility, blocked users and account controls" onPress={() => router.push("/settings/privacy" as any)} />
      <SettingsRow icon="shield-lock-outline" title={t("settings.security")} detail="Signed-in account and session security" onPress={() => router.push("/settings/security" as any)} />

      <H2>{t("settings.support")}</H2>
      <SettingsRow icon="information-outline" title={t("settings.about")} detail="Version, architecture notes and build information" onPress={() => router.push("/settings/about" as any)} />
    </Screen>
  );
}
