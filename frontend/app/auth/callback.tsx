import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme";
import { Loading, Screen } from "@/components/ui";

export default function AuthCallback() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function handleCallback() {
      try {
        if (params.error) {
          throw new Error(params.error_description?.toString() || "An error occurred during authentication.");
        }

        // Handle OAuth code exchange (PKCE)
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code.toString());
          if (error) throw error;
          router.replace("/(tabs)");
          return;
        }

        // Handle Magic Link / Recovery (Implicit or Hash based)
        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token.toString(),
            refresh_token: params.refresh_token.toString(),
          });
          if (error) throw error;
          
          if (params.type === "recovery") {
            router.replace("/auth/reset-password");
            return;
          }
          
          router.replace("/(tabs)");
          return;
        }
        
        // If we reach here, we didn't find required parameters
        throw new Error("Invalid or missing authentication tokens.");
      } catch (err) {
        console.error("Auth callback error:", err);
        setErrorMsg(err instanceof Error ? err.message : "Authentication failed.");
      }
    }

    handleCallback();
  }, [params]);

  if (errorMsg) {
    return (
      <Screen style={styles.container}>
        <Text style={[styles.error, { color: colors.danger }]}>{errorMsg}</Text>
        <Text
          style={[styles.link, { color: colors.primary }]}
          onPress={() => router.replace("/(auth)/sign-in")}
        >
          Return to Sign In
        </Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <Loading label="Authenticating..." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  error: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  link: {
    fontSize: 15,
    fontWeight: "700",
  },
});
