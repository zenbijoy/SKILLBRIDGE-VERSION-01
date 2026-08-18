import { Alert } from "react-native";
import { Card, H1, Muted, Screen, SettingSwitch } from "@/components/ui";
import { registerPush, unregisterPush } from "@/lib/notifications";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useI18n } from "@/i18n";

export default function NotificationSettings() {
  const { t } = useI18n();
  const pushEnabled = usePreferencesStore((state) => state.pushEnabled);
  const setPushEnabled = usePreferencesStore((state) => state.setPushEnabled);

  async function changePush(enabled: boolean) {
    if (enabled) {
      const token = await registerPush();
      if (!token) {
        Alert.alert("Push notifications unavailable", "Permission was not granted, this is a simulator, or EAS projectId is missing.");
        setPushEnabled(false);
        return;
      }
      setPushEnabled(true);
      return;
    }
    try {
      await unregisterPush();
      setPushEnabled(false);
    } catch {
      Alert.alert("Could not disable push", "The registered device token could not be removed from the server. Try again when online.");
    }
  }

  return (
    <Screen>
      <H1>{t("settings.notificationsTitle")}</H1>
      <Muted>Push registration is connected to the existing notification-device backend and can be enabled or removed for this device.</Muted>
      <Card>
        <SettingSwitch title="Push notifications" detail="Receive message, room and SkillBridge alerts on this device." value={pushEnabled} onValueChange={(value) => void changePush(value)} />
      </Card>
      <Card>
        <Muted>Category-level push preferences need server-side preference fields before they can be enforced reliably. This upgrade does not pretend those controls work until the backend supports them.</Muted>
      </Card>
    </Screen>
  );
}
