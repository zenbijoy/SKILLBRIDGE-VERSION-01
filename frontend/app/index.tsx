import { Redirect } from "expo-router";
import { useSession } from "@/hooks/useSession";
import { View, ActivityIndicator } from "react-native";
import { useTheme } from "@/theme";

export default function Index() {
  const { session, loading } = useSession();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={session ? "/(tabs)" : "/(auth)/welcome"} />;
}

