import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: "Page Not Found", headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.code, { color: colors.primary }]}>404</Text>
        <Text style={[styles.title, { color: colors.text }]}>Page Not Found</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          This screen does not exist or has been moved.
        </Text>

        <Link href="/" style={[styles.link, { backgroundColor: colors.primary }]}>
          <Text style={styles.linkText}>Go to SkillBridge Home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  code: {
    fontSize: 72,
    fontWeight: "900",
    letterSpacing: -2,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 28,
    textAlign: "center",
    maxWidth: 320,
  },
  link: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    overflow: "hidden",
  },
  linkText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
