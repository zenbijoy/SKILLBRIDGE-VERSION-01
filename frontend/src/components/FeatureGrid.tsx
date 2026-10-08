import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius, useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";
import { AskHelpComposerModal } from "@/features/help/AskHelpComposerModal";

interface FeatureItem {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  labelBn: string;
  badge: string;
  badgeBn: string;
  color: string;
  target: Href | "ask_help";
}

const items: FeatureItem[] = [
  { icon: "newspaper-variant-outline", label: "Campus Feed", labelBn: "ক্যাম্পাস ফিড", badge: "Trending", badgeBn: "ট্রেন্ডিং", color: "#3B82F6", target: "/feed" as any },
  { icon: "help-circle-outline", label: "Ask Doubt", labelBn: "প্রশ্ন জিজ্ঞাসা", badge: "Live Q&A", badgeBn: "লাইভ Q&A", color: "#F59E0B", target: "ask_help" },
  { icon: "account-group-outline", label: "Study Rooms", labelBn: "স্টাডি রুম", badge: "Video & Chat", badgeBn: "ভিডিও ও চ্যাট", color: "#8B5CF6", target: "/rooms" },
  { icon: "calendar-clock", label: "Timetable", labelBn: "ক্লাস রুটিন", badge: "Classes", badgeBn: "ক্লাস", color: "#10B981", target: "/schedule" },
  { icon: "brain", label: "Skill Quizzes", labelBn: "স্কিল কুইজ", badge: "Earn XP", badgeBn: "XP অর্জন", color: "#EC4899", target: "/quiz" },
  { icon: "flask-outline", label: "Research Labs", labelBn: "রিসার্চ ল্যাব", badge: "Collaborate", badgeBn: "কোলাবরেশন", color: "#06B6D4", target: "/research" },
  { icon: "calendar-star", label: "Campus Events", labelBn: "ক্যাম্পাস ইভেন্ট", badge: "Workshops", badgeBn: "ওয়ার্কশপ", color: "#6366F1", target: "/events" },
  { icon: "bookmark-outline", label: "Saved Vault", labelBn: "সেভড ভল্ট", badge: "Notes", badgeBn: "নোটস", color: "#14B8A6", target: "/saved" },
  { icon: "account-multiple-outline", label: "Peer Network", labelBn: "সহপাঠী নেটওয়ার্ক", badge: "Mentors", badgeBn: "মেন্টর", color: "#F97316", target: "/connections" },
];

export function FeatureGrid({ compact = false }: { compact?: boolean }) {
  const { colors, isDark } = useTheme();
  const { language } = useI18n();
  const isBn = language === "bn";
  const [showHelpComposer, setShowHelpComposer] = useState(false);

  const visible = compact ? items.slice(0, 4) : items;

  // Chunk items into rows of 2 for a clean 2-column grid
  const rows = useMemo(() => {
    const chunked: FeatureItem[][] = [];
    for (let i = 0; i < visible.length; i += 2) {
      chunked.push(visible.slice(i, i + 2));
    }
    return chunked;
  }, [visible]);

  return (
    <>
      <View style={s.container}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={s.row}>
            {row.map((item) => (
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
                  <MaterialCommunityIcons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.label, { color: colors.text }]} numberOfLines={1}>
                    {isBn ? item.labelBn : item.label}
                  </Text>
                  <Text style={[s.badgeText, { color: item.color }]} numberOfLines={1}>
                    {isBn ? item.badgeBn : item.badge}
                  </Text>
                </View>
              </Pressable>
            ))}
            {row.length === 1 ? <View style={[s.item, { opacity: 0 }]} pointerEvents="none" /> : null}
          </View>
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
  container: {
    gap: 10,
    marginVertical: 4,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  item: {
    flex: 1,
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { fontWeight: "800", fontSize: 12.5, letterSpacing: -0.2 },
  badgeText: { fontSize: 10, fontWeight: "700", marginTop: 1 },
});

