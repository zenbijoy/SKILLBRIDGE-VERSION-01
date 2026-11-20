import React, { useEffect, useState } from "react";
import Constants from "expo-constants";
import { Image, Linking, StyleSheet, Text, View, Alert, ActivityIndicator } from "react-native";
import { Button, Card, H1, H2, Muted, Row, Screen, triggerHaptic } from "@/components/ui";
import { UpdateInfoCard, type VersionResponse } from "@/components/AppUpdateChecker";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme";

export default function AboutSettings() {
  const { t } = useI18n();
  const { colors, isDark } = useTheme();
  const [versionInfo, setVersionInfo] = useState<VersionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const localVersion = Constants.expoConfig?.version ?? "2.0.10";

  const fetchUpdateInfo = async () => {
    setLoading(true);
    triggerHaptic();
    try {
      const res = await fetch("https://ruetskillbridge.duckdns.org/api/v1/app/version");
      if (res.ok) {
        const data: VersionResponse = await res.json();
        setVersionInfo(data);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
      setChecked(true);
    }
  };

  useEffect(() => {
    fetchUpdateInfo();
  }, []);

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

      {/* Wonderful Update Info & Download Card */}
      {versionInfo && (
        <View style={styles.updateCardSection}>
          <UpdateInfoCard
            versionInfo={versionInfo}
            localVersion={localVersion}
          />
        </View>
      )}

      {!versionInfo && checked && (
        <Card style={{ gap: 8 }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <H2>App Updates</H2>
              <Muted>You are on v{localVersion} (Latest)</Muted>
            </View>
            <Button
              title={loading ? "Checking..." : "Check Again"}
              variant="secondary"
              compact
              onPress={fetchUpdateInfo}
            />
          </Row>
        </Card>
      )}

      <Card style={{ gap: 8 }}>
        <H2>SkillBridge Mobile</H2>
        <Muted>Installed Version: {localVersion}</Muted>
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
  updateCardSection: {
    marginBottom: 12,
  },
  linkText: {
    fontSize: 15,
  },
});
