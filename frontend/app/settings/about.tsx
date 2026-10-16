import Constants from "expo-constants";
import { Image, StyleSheet, Text, View } from "react-native";
import { Card, H1, H2, Muted, Screen } from "@/components/ui";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme";

export default function AboutSettings() {
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <Screen>
      <H1>{t("settings.about")}</H1>

      <View style={styles.brandHero}>
        <Image
          source={require("@/../assets/branding/skillbridge-mark.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.brandTitle, { color: colors.text }]}>SkillBridge</Text>
        <Text style={[styles.brandSubtitle, { color: colors.muted }]}>
          Campus Learning & Research Network
        </Text>
      </View>

      <Card>
        <H2>SkillBridge Mobile</H2>
        <Muted>Version {Constants.expoConfig?.version ?? "2.x"}</Muted>
        <Muted>National-scale peer learning, mentoring, rooms, research collaboration, events and realtime communication.</Muted>
      </Card>
      <Card>
        <H2>Frontend V2 foundation</H2>
        <Muted>Expo Router · React Native · TanStack Query · Zustand · Supabase · Socket.IO · LiveKit</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandHero: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 8,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 4,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  brandSubtitle: {
    fontSize: 13,
    fontWeight: "600",
  },
});
