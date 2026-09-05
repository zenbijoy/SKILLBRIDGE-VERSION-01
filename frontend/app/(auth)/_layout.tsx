import { Stack, type ErrorBoundaryProps } from "expo-router";
import { View, Text, StyleSheet, Pressable } from "react-native";

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Authentication Error</Text>
      <Text style={styles.errorMessage}>
        {error?.message || "An unexpected error occurred. Please try again."}
      </Text>
      <Pressable style={styles.errorButton} onPress={retry}>
        <Text style={styles.errorButtonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: "#07111F",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  errorMessage: {
    color: "#91A4BD",
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
    maxWidth: 360,
  },
  errorButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  errorButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
