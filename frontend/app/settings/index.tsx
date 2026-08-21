import { useState } from "react";
import { TextInput, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { H1, H2, Muted, Screen } from "@/components/ui";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useTour } from "@/features/tour/TourContext";

export default function SettingsHomeScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const [search, setSearch] = useState("");
  const { restartTour } = useTour();

  const theme = usePreferencesStore((state) => state.theme);
  const accent = usePreferencesStore((state) => state.accentColor);
  const dataSaver = usePreferencesStore((state) => state.dataSaver);
  const themeLabel = t(`settings.theme${theme === "oled" ? "Oled" : theme.charAt(0).toUpperCase() + theme.slice(1)}`);
  const dataSaverLabel = t(`settings.data${dataSaver.charAt(0).toUpperCase() + dataSaver.slice(1)}`);

  const SETTINGS_SECTIONS = [
    {
      category: t("settings.account"),
      items: [
        {
          icon: "account-edit-outline",
          title: t("settings.profile"),
          detail: t("settings.profileDetail"),
          keywords: "profile name username bio avatar photo",
          onPress: () => router.push("/settings/profile" as any),
        },
        {
          icon: "school-outline",
          title: t("settings.skills"),
          detail: t("settings.skillsDetail"),
          keywords: "skills teach learn research topics expertise",
          onPress: () => router.push("/settings/skills" as any),
        },
      ],
    },
    {
      category: t("settings.preferences"),
      items: [
        {
          icon: "tune-variant",
          title: t("settings.dashboard"),
          detail: t("settings.dashboardDetail"),
          keywords: "dashboard layout widgets customize home preset density",
          onPress: () => router.push("/dashboard/customize" as any),
        },
        {
          icon: "translate",
          title: t("settings.language"),
          detail: t("settings.languageDetail"),
          value: language === "bn" ? "বাংলা" : "English",
          keywords: "language english bangla region locale",
          onPress: () => router.push("/settings/language" as any),
        },
        {
          icon: "palette-outline",
          title: t("settings.appearance"),
          detail: t("settings.appearanceDetail"),
          value: `${themeLabel} · ${accent.charAt(0).toUpperCase() + accent.slice(1)}`,
          keywords: "appearance theme dark light oled color accent style",
          onPress: () => router.push("/settings/appearance" as any),
        },
        {
          icon: "bell-outline",
          title: t("settings.notifications"),
          detail: t("settings.notificationsRowDetail"),
          keywords: "notifications push alerts quiet hours sound vibrate",
          onPress: () => router.push("/settings/notifications" as any),
        },
        {
          icon: "database-outline",
          title: t("settings.data"),
          detail: t("settings.dataDetail"),
          value: dataSaverLabel,
          keywords: "data storage saver wifi bandwidth cache",
          onPress: () => router.push("/settings/data-storage" as any),
        },
        {
          icon: "human",
          title: t("settings.accessibility"),
          detail: t("settings.accessibilityDetail"),
          keywords: "accessibility motion text haptics contrast captions",
          onPress: () => router.push("/settings/accessibility" as any),
        },
      ],
    },
    {
      category: t("settings.privacySecurity"),
      items: [
        {
          icon: "shield-account-outline",
          title: t("settings.privacy"),
          detail: t("settings.privacyDetail"),
          keywords: "privacy visibility public private blocked delete account",
          onPress: () => router.push("/settings/privacy" as any),
        },
        {
          icon: "shield-lock-outline",
          title: t("settings.security"),
          detail: t("settings.securityDetail"),
          keywords: "security password session login devices",
          onPress: () => router.push("/settings/security" as any),
        },
      ],
    },
    {
      category: t("settings.support"),
      items: [
        {
          icon: "compass-outline",
          title: t("settings.replayTour"),
          detail: t("settings.tourDetail"),
          keywords: "tour tutorial guide onboarding help walkthrough",
          onPress: restartTour,
        },
        {
          icon: "information-outline",
          title: t("settings.about"),
          detail: t("settings.aboutDetail"),
          keywords: "about version build licenses terms privacy",
          onPress: () => router.push("/settings/about" as any),
        },
      ],
    },
  ];

  const query = search.trim().toLowerCase();

  return (
    <Screen>
      <H1>{t("settings.title")}</H1>
      <Muted>{t("settings.searchHint")}</Muted>

      {/* Settings Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t("settings.searchPlaceholder")}
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Render Settings Sections */}
      {SETTINGS_SECTIONS.map((section) => {
        const filteredItems = query
          ? section.items.filter(
              (item) =>
                item.title.toLowerCase().includes(query) ||
                item.detail.toLowerCase().includes(query) ||
                item.keywords.toLowerCase().includes(query),
            )
          : section.items;

        if (!filteredItems.length) return null;

        return (
          <View key={section.category}>
            <H2>{section.category}</H2>
            {filteredItems.map((item) => (
              <SettingsRow
                key={item.title}
                icon={item.icon as any}
                title={item.title}
                detail={item.detail}
                value={item.value}
                onPress={item.onPress}
              />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
});
