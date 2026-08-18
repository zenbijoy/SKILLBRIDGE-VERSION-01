import Constants from "expo-constants";
import { Card, H1, H2, Muted, Screen } from "@/components/ui";
import { useI18n } from "@/i18n";

export default function AboutSettings() {
  const { t } = useI18n();
  return (
    <Screen>
      <H1>{t("settings.about")}</H1>
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
