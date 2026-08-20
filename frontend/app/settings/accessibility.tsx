import { Card, H1, Muted, Screen, SettingSwitch } from "@/components/ui";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useI18n } from "@/i18n";

export default function AccessibilitySettings() {
  const { t } = useI18n();
  const largeText = usePreferencesStore((state) => state.largeText);
  const setLargeText = usePreferencesStore((state) => state.setLargeText);
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const setReduceMotion = usePreferencesStore((state) => state.setReduceMotion);
  const haptics = usePreferencesStore((state) => state.haptics);
  const setHaptics = usePreferencesStore((state) => state.setHaptics);
  return (
    <Screen>
      <H1>{t("settings.accessibilityTitle")}</H1>
      <Muted>Comfort options are stored globally and can be consumed by every upgraded component.</Muted>
      <Card>
        <SettingSwitch title="Larger interface text" detail="Increase core heading and supporting text sizes." value={largeText} onValueChange={setLargeText} />
        <SettingSwitch title="Reduce motion" detail="Stop decorative looping animation in upgraded experiences." value={reduceMotion} onValueChange={setReduceMotion} />
        <SettingSwitch title="Haptic feedback" detail="Master preference for interaction haptics where implemented." value={haptics} onValueChange={setHaptics} />
      </Card>
    </Screen>
  );
}
