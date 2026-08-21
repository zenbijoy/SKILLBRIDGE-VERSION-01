import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorState, H1, H2, Muted, Row, Screen, SettingSwitch, Skeleton } from "@/components/ui";
import { registerPush, unregisterPush } from "@/lib/notifications";
import { api } from "@/lib/api";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";

type PreferenceKey = "messages" | "connections" | "rooms" | "sessions" | "teaching" | "system";
type NotificationPreferenceResponse = {
  preferences: Record<PreferenceKey, boolean>;
  quietHours: { start: string; end: string; timezone: string };
  onboardingPushOptIn: boolean;
};

const CATEGORIES: { key: PreferenceKey; titleKey: string; detailKey: string }[] = [
  { key: "messages", titleKey: "settings.categoryMessages", detailKey: "settings.categoryMessagesDetail" },
  { key: "connections", titleKey: "settings.categoryConnections", detailKey: "settings.categoryConnectionsDetail" },
  { key: "rooms", titleKey: "settings.categoryRooms", detailKey: "settings.categoryRoomsDetail" },
  { key: "sessions", titleKey: "settings.categorySessions", detailKey: "settings.categorySessionsDetail" },
  { key: "teaching", titleKey: "settings.categoryTeaching", detailKey: "settings.categoryTeachingDetail" },
  { key: "system", titleKey: "settings.categorySystem", detailKey: "settings.categorySystemDetail" },
];

export default function NotificationSettings() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const pushEnabled = usePreferencesStore((state) => state.pushEnabled);
  const setPushEnabled = usePreferencesStore((state) => state.setPushEnabled);
  const [preferences, setPreferences] = useState<Record<PreferenceKey, boolean>>({
    messages: true,
    connections: true,
    rooms: true,
    sessions: true,
    teaching: true,
    system: true,
  });
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");

  const preferenceQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api<NotificationPreferenceResponse>("/notifications/preferences"),
  });

  useEffect(() => {
    if (!preferenceQuery.data) return;
    // Server data intentionally hydrates this editable local settings form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferences(preferenceQuery.data.preferences);
    setQuietStart(preferenceQuery.data.quietHours.start);
    setQuietEnd(preferenceQuery.data.quietHours.end);
    setPushEnabled(preferenceQuery.data.onboardingPushOptIn);
  }, [preferenceQuery.data, setPushEnabled]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, boolean | string>) => api("/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: (error: Error) => Alert.alert(t("common.error"), error.message),
  });

  async function changePush(enabled: boolean) {
    if (enabled) {
      const token = await registerPush();
      if (!token) {
        Alert.alert(t("settings.pushUnavailable"), t("settings.pushUnavailableDetail"));
        setPushEnabled(false);
        return;
      }
      setPushEnabled(true);
      saveMutation.mutate({ push_enabled: true });
      return;
    }
    try {
      await unregisterPush();
      setPushEnabled(false);
      saveMutation.mutate({ push_enabled: false });
    } catch {
      Alert.alert(t("settings.pushDisableFailed"), t("settings.tryOnlineAgain"));
    }
  }

  const toggleCategory = (key: PreferenceKey, value: boolean) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    saveMutation.mutate({ [key]: value });
  };

  const saveQuietHours = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(quietStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(quietEnd)) {
      Alert.alert(t("settings.invalidQuietHours"), t("settings.invalidQuietHoursDetail"));
      return;
    }
    saveMutation.mutate({ quiet_hours_start: quietStart, quiet_hours_end: quietEnd });
  };

  return (
    <Screen>
      <H1>{t("settings.notificationsTitle")}</H1>
      <Muted>{t("settings.notificationsDetail")}</Muted>

      {preferenceQuery.isLoading ? <Card><Skeleton width="45%" /><Skeleton height={120} /></Card> : null}
      {preferenceQuery.isError ? <ErrorState detail={(preferenceQuery.error as Error).message} onRetry={() => preferenceQuery.refetch()} /> : null}

      {!preferenceQuery.isLoading && !preferenceQuery.isError ? <>
        <Card>
          <SettingSwitch
            title={t("settings.pushNotifications")}
            detail={t("settings.pushNotificationsDetail")}
            value={pushEnabled}
            onValueChange={(value) => void changePush(value)}
          />
        </Card>

        <Card>
          <H2>{t("settings.notificationCategories")}</H2>
          <View style={styles.categoryList}>
            {CATEGORIES.map((category) => (
              <SettingSwitch
                key={category.key}
                title={t(category.titleKey)}
                detail={t(category.detailKey)}
                value={preferences[category.key]}
                onValueChange={(value) => toggleCategory(category.key, value)}
              />
            ))}
          </View>
        </Card>

        <Card>
          <H2>{t("settings.quietHours")}</H2>
          <Muted>{t("settings.quietHoursDetail")} {preferenceQuery.data?.quietHours.timezone}.</Muted>
          <Row style={styles.timeRow}>
            <TimeField label={t("settings.quietStart")} value={quietStart} onChangeText={setQuietStart} colors={colors} />
            <TimeField label={t("settings.quietEnd")} value={quietEnd} onChangeText={setQuietEnd} colors={colors} />
          </Row>
          <Button title={t("common.save")} onPress={saveQuietHours} loading={saveMutation.isPending} />
        </Card>
      </> : null}
    </Screen>
  );
}

function TimeField({ label, value, onChangeText, colors }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="22:00"
        placeholderTextColor={colors.muted}
        maxLength={5}
        keyboardType="numbers-and-punctuation"
        style={[styles.timeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  categoryList: { gap: 4, marginTop: 8 },
  timeRow: { gap: 12, marginVertical: 14 },
  timeInput: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
