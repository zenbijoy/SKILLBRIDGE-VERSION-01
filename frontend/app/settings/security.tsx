import { useState } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, H1, H2, Muted, Screen, triggerHaptic } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { useI18n } from "@/i18n";

export default function SecuritySettings() {
  const { session } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      triggerHaptic();
      await supabase.auth.signOut();
      queryClient.clear();

      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = "/";
      } else {
        router.replace("/(auth)/welcome" as any);
      }
    } catch (err) {
      console.error("Sign out failed:", err);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = "/";
      } else {
        router.replace("/(auth)/welcome" as any);
      }
    } finally {
      setLoading(false);
    }
  };

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
        <Button
          title={loading ? "Signing out..." : "Sign out this device"}
          variant="danger"
          loading={loading}
          onPress={handleSignOut}
        />
      </Card>
    </Screen>
  );
}
