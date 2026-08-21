import { Pressable, Text } from "react-native";
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
      <Muted>{t("settings.dataConnectionDetail")}</Muted>
      <Card>
        <H2>{t("settings.dataSaverLabel")}</H2>
        <Row>{modes.map((mode) => <Pressable key={mode.value} onPress={() => setDataSaver(mode.value)}><Pill tone={dataSaver === mode.value ? "primary" : "default"}>{mode.label}</Pill></Pressable>)}</Row>
        <Muted>{dataSaver === "extreme" ? t("settings.dataExtremeDetail") : dataSaver === "standard" ? t("settings.dataStandardDetail") : t("settings.dataOffDetail")}</Muted>
      </Card>
      <Card>
        <SettingSwitch title={t("settings.autoplayMedia")} detail={t("settings.autoplayMediaDetail")} value={autoplayMedia && dataSaver !== "extreme"} onValueChange={(value) => setAutoplayMedia(value)} />
        <SettingSwitch title={t("settings.wifiOnly")} detail={t("settings.wifiOnlyDetail")} value={downloadOnWifiOnly} onValueChange={setDownloadOnWifiOnly} />
      </Card>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{t("settings.dataPersistenceDetail")}</Text>
    </Screen>
  );
}
