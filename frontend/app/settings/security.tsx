import { useState } from "react";
import { Alert, Platform } from "react-native";
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

  const performSignOut = async () => {
    try {
      setLoading(true);
      triggerHaptic();
      await supabase.auth.signOut();
      queryClient.clear();
      router.replace("/(auth)/welcome" as any);
    } catch (err) {
      console.error("Sign out failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    triggerHaptic();
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm("Are you sure you want to sign out?");
        if (confirmed) {
          void performSignOut();
        }
      } else {
        void performSignOut();
      }
      return;
    }

    Alert.alert(
      "Sign out?",
      "You will need to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => void performSignOut(),
        },
      ]
    );
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
