import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius, useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { AskHelpComposerModal } from "@/features/help/AskHelpComposerModal";

const items: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  badge: string;
  color: string;
  target: Href | "ask_help";
}[] = [
  { icon: "newspaper-variant-outline", label: "Campus Feed", badge: "Trending", color: "#3B82F6", target: "/feed" as any },
  { icon: "help-circle-outline", label: "Ask Doubt", badge: "Live Q&A", color: "#F59E0B", target: "ask_help" },
  { icon: "account-group-outline", label: "Study Rooms", badge: "Video & Chat", color: "#8B5CF6", target: "/rooms" },
  { icon: "calendar-clock", label: "Timetable", badge: "Classes", color: "#10B981", target: "/schedule" },
  { icon: "brain", label: "Skill Quizzes", badge: "Earn XP", color: "#EC4899", target: "/quiz" },
  { icon: "flask-outline", label: "Research Labs", badge: "Collaborate", color: "#06B6D4", target: "/research" },
  { icon: "calendar-star", label: "Campus Events", badge: "Workshops", color: "#6366F1", target: "/events" },
  { icon: "bookmark-outline", label: "Saved Vault", badge: "Notes", color: "#14B8A6", target: "/saved" },
  { icon: "account-multiple-outline", label: "Peer Network", badge: "Mentors", color: "#F97316", target: "/connections" },
];

export function FeatureGrid({ compact = false }: { compact?: boolean }) {
  const { colors, isDark } = useTheme();
  const [showHelpComposer, setShowHelpComposer] = useState(false);
  const visible = compact ? items.slice(0, 4) : items;

  return (
    <>
      <View style={s.grid}>
        {visible.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.label}
            onPress={() => {
              triggerHaptic();
              if (item.target === "ask_help") {
                setShowHelpComposer(true);
              } else {
                router.push(item.target);
              }
            }}
            style={({ pressed }) => [
              s.item,
              {
                backgroundColor: isDark ? "#131926" : "#FFFFFF",
                borderColor: isDark ? "#1F293D" : "#E2E8F0",
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <View style={[s.iconWrap, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : `${item.color}15` }]}>
              <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.text }]}>{item.label}</Text>
              <Text style={[s.badgeText, { color: item.color }]}>{item.badge}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Ask Help Composer Modal */}
      <AskHelpComposerModal
        visible={showHelpComposer}
        onClose={() => setShowHelpComposer(false)}
        onSuccess={() => {
          router.push("/help/questions" as any);
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  item: {
    width: "48.5%",
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontWeight: "800", fontSize: 13, letterSpacing: -0.2 },
  badgeText: { fontSize: 10, fontWeight: "700", marginTop: 1 },
});
