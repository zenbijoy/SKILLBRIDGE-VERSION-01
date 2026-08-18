import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius } from "@/theme";
const items: [string, string, Href][] = [
  ["flask-outline", "Research", "/research"],
  ["calendar-star", "Events", "/events"],
  ["account-group", "Connections", "/connections"],
  ["bookmark-outline", "Saved", "/saved"],
  ["calendar-clock", "Schedule", "/schedule"],
  ["trophy-outline", "Leaderboard", "/leaderboard"],
  ["brain", "Quiz", "/quiz"],
  ["shield-account", "Safety", "/settings/privacy"],
];
export function FeatureGrid() {
  return (
    <View style={s.grid}>
      {items.map(([icon, label, href]) => (
        <Pressable key={label} onPress={() => router.push(href)} style={s.item}>
          <MaterialCommunityIcons
            name={icon as any}
            size={24}
            color={colors.accent}
          />
          <Text style={s.label}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  item: {
    width: "47%",
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  label: { color: colors.text, fontWeight: "700" },
});
