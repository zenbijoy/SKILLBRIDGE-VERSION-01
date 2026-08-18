import { Alert } from "react-native";
import { Card, Button, H1, H2, Muted, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { useI18n } from "@/i18n";

export default function SecuritySettings() {
  const { session } = useSession();
  const { t } = useI18n();
  return (
    <Screen>
      <H1>{t("settings.securityTitle")}</H1>
      <Card>
        <H2>Signed-in account</H2>
        <Muted>{session?.user.email ?? "Authenticated SkillBridge account"}</Muted>
        <Muted>User ID: {session?.user.id ?? "Unavailable"}</Muted>
      </Card>
      <Card>
        <H2>Session controls</H2>
        <Muted>Use this to invalidate the current local session. Device-management and 2FA controls should only be added after corresponding backend/auth flows exist.</Muted>
        <Button title="Sign out this device" variant="danger" onPress={() => Alert.alert("Sign out?", "You will need to sign in again.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => void supabase.auth.signOut() }])} />
      </Card>
    </Screen>
  );
}
