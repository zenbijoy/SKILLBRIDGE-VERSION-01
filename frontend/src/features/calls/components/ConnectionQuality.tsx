import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { QualityMetrics } from "../types";
import { useTheme } from "@/theme";

interface Props {
  metrics?: QualityMetrics;
}

export const ConnectionQuality: React.FC<Props> = ({ metrics }) => {
  const { colors } = useTheme();

  if (!metrics) return null;

  const getQualityColor = () => {
    switch (metrics.quality) {
      case "excellent":
      case "good":
        return "#10B981"; // Emerald
      case "fair":
        return "#F59E0B"; // Amber
      case "poor":
      case "critical":
        return "#EF4444"; // Red
      default:
        return colors.muted;
    }
  };

  const color = getQualityColor();

  return (
    <View style={[styles.container, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
      <View style={[styles.indicator, { backgroundColor: color }]} />
      <Text style={styles.text}>{metrics.rttMs}ms</Text>

      {metrics.packetLossPercent > 0 ? (
        <Text style={styles.lossText}>({metrics.packetLossPercent}% loss)</Text>
      ) : null}

      {metrics.relayUsed ? (
        <View style={styles.turnBadge}>
          <MaterialCommunityIcons name="shield-check" size={12} color="#60A5FA" />
          <Text style={styles.turnText}>TURN RELAY</Text>
        </View>
      ) : (
        <View style={styles.p2pBadge}>
          <MaterialCommunityIcons name="lightning-bolt" size={12} color="#34D399" />
          <Text style={styles.p2pText}>DIRECT P2P</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  indicator: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  lossText: {
    color: "#FCA5A5",
    fontSize: 10,
    fontWeight: "600",
  },
  turnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
  },
  turnText: {
    color: "#93C5FD",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  p2pBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  p2pText: {
    color: "#6EE7B7",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
