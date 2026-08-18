import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius, useTheme } from "@/theme";

const items: [keyof typeof MaterialCommunityIcons.glyphMap, string, Href][] = [
  ["help-circle-outline", "Ask help", "/rooms"],
  ["account-group-outline", "Start room", "/rooms"],
  ["calendar-clock", "Schedule", "/schedule"],
  ["brain", "Quiz", "/quiz"],
  ["flask-outline", "Research", "/research"],
  ["calendar-star", "Events", "/events"],
  ["bookmark-outline", "Saved", "/saved"],
  ["account-multiple-outline", "Connections", "/connections"],
];

export function FeatureGrid({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const visible = compact ? items.slice(0, 4) : items;
  return (
    <View style={s.grid}>
      {visible.map(([icon, label, href]) => (
        <Pressable
          accessibilityRole="button"
          key={label}
          onPress={() => router.push(href)}
          style={({ pressed }) => [s.item, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
        >
          <View style={[s.iconWrap, { backgroundColor: colors.primarySoft }]}>
            <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
          </View>
          <Text style={[s.label, { color: colors.text }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  item: { width: "48%", minHeight: 78, borderRadius: radius.lg, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontWeight: "800", fontSize: 13 },
});
