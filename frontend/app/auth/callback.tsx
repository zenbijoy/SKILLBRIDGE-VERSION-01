import { useEffect, useState } from "react";
import { Text, StyleSheet } from "react-native";
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

        // Handle Magic Link / Recovery from query params
        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token.toString(),
            refresh_token: params.refresh_token.toString(),
          });
          if (error) throw error;
          
          if (params.type === "recovery") {
            router.replace("/auth/reset-password" as any);
            return;
          }
          
          router.replace("/(tabs)" as any);
          return;
        }

        // Handle Hash fragment on Web (e.g. #access_token=...&refresh_token=...)
        if (typeof window !== "undefined" && window.location?.hash) {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const hashError = hashParams.get("error_description") || hashParams.get("error");
          if (hashError) {
            throw new Error(hashError);
          }

          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const type = hashParams.get("type");

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;

            if (type === "recovery") {
              router.replace("/auth/reset-password" as any);
              return;
            }

            router.replace("/(tabs)" as any);
            return;
          }
        }

        // Check if Supabase JS already automatically initialized a session from URL
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          router.replace("/(tabs)" as any);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (errorMsg) {
    return (
      <Screen contentStyle={styles.container}>
        <Text style={[styles.error, { color: colors.danger }]}>{errorMsg}</Text>
        <Text
          style={[styles.link, { color: colors.primary }]}
          onPress={() => router.replace("/(auth)/sign-in" as any)}
        >
          Return to Sign In
        </Text>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.container}>
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
