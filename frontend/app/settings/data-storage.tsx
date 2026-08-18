import { Pressable, StyleSheet, Text } from "react-native";
import { Card, H1, H2, Muted, Pill, Row, Screen, SettingSwitch } from "@/components/ui";
import { usePreferencesStore, type DataSaverMode } from "@/state/usePreferencesStore";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme";

export default function DataStorageSettings() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dataSaver = usePreferencesStore((state) => state.dataSaver);
  const setDataSaver = usePreferencesStore((state) => state.setDataSaver);
  const autoplayMedia = usePreferencesStore((state) => state.autoplayMedia);
  const setAutoplayMedia = usePreferencesStore((state) => state.setAutoplayMedia);
  const downloadOnWifiOnly = usePreferencesStore((state) => state.downloadOnWifiOnly);
  const setDownloadOnWifiOnly = usePreferencesStore((state) => state.setDownloadOnWifiOnly);
  const modes: { value: DataSaverMode; label: string }[] = [
    { value: "off", label: t("settings.dataOff") },
    { value: "standard", label: t("settings.dataStandard") },
    { value: "extreme", label: t("settings.dataExtreme") },
  ];
  return (
    <Screen>
      <H1>{t("settings.dataTitle")}</H1>
      <Muted>Designed for both fast Wi‑Fi and unstable/expensive mobile data connections.</Muted>
      <Card>
        <H2>Data saver</H2>
        <Row>{modes.map((mode) => <Pressable key={mode.value} onPress={() => setDataSaver(mode.value)}><Pill tone={dataSaver === mode.value ? "primary" : "default"}>{mode.label}</Pill></Pressable>)}</Row>
        <Muted>{dataSaver === "extreme" ? "Extreme mode should disable autoplay and prefer compressed media in screens that support it." : dataSaver === "standard" ? "Standard mode balances image quality and bandwidth." : "No additional data-saving restrictions."}</Muted>
      </Card>
      <Card>
        <SettingSwitch title="Autoplay media" detail="Allow supported feed/video surfaces to autoplay media." value={autoplayMedia && dataSaver !== "extreme"} onValueChange={(value) => setAutoplayMedia(value)} />
        <SettingSwitch title="Download on Wi‑Fi only" detail="Use this preference for large resources and recordings." value={downloadOnWifiOnly} onValueChange={setDownloadOnWifiOnly} />
      </Card>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Preference storage is local and persistent. Individual media features should read these values before loading large assets.</Text>
    </Screen>
  );
}
