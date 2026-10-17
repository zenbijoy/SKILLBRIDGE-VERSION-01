import Constants from "expo-constants";
import { Image, Linking, StyleSheet, Text, View, Alert } from "react-native";
import { Button, Card, H1, H2, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme";

export default function AboutSettings() {
  const { t } = useI18n();
  const { colors } = useTheme();

  const openUrl = (url: string) => {
    triggerHaptic();
    Linking.openURL(url).catch(() => Alert.alert("Could not open link"));
  };

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

      <Card style={{ gap: 8 }}>
        <H2>SkillBridge Mobile</H2>
        <Muted>Version {Constants.expoConfig?.version ?? "2.x"}</Muted>
        <Muted>National-scale peer learning, mentoring, rooms, research collaboration, events and realtime communication.</Muted>
      </Card>

      <Card style={{ gap: 8 }}>
        <H2>Built With</H2>
        <Muted>Expo Router &bull; React Native &bull; TanStack Query &bull; Zustand &bull; Supabase &bull; Socket.IO &bull; LiveKit</Muted>
      </Card>

      <Card style={{ gap: 8 }}>
        <H2>Legal &amp; Support</H2>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.linkText, { color: colors.primary, fontWeight: "600" }]}>Terms of Service</Text>
            <Muted style={{ fontSize: 11 }}>Read our terms and conditions</Muted>
          </View>
          <Button title="Open" variant="secondary" compact onPress={() => openUrl("https://skillbridge.app/terms")} />
        </Row>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.linkText, { color: colors.primary, fontWeight: "600" }]}>Privacy Policy</Text>
            <Muted style={{ fontSize: 11 }}>How we handle your data</Muted>
          </View>
          <Button title="Open" variant="secondary" compact onPress={() => openUrl("https://skillbridge.app/privacy")} />
        </Row>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.linkText, { color: colors.primary, fontWeight: "600" }]}>Contact Support</Text>
            <Muted style={{ fontSize: 11 }}>help@skillbridge.app</Muted>
          </View>
          <Button title="Email" variant="secondary" compact onPress={() => Linking.openURL("mailto:help@skillbridge.app")} />
        </Row>
      </Card>

      <Card style={{ gap: 8 }}>
        <H2>License</H2>
        <Muted>MIT License. Open source and community-driven.</Muted>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.linkText, { color: colors.primary, fontWeight: "600" }]}>View on GitHub</Text>
          </View>
          <Button title="Open" variant="secondary" compact onPress={() => openUrl("https://github.com/skillbridge/skillbridge")} />
        </Row>
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
  linkText: {
    fontSize: 15,
  },
});
