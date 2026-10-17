import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import type { Profile } from "@/types";

interface WhatsOnYourMindCardProps {
  currentUser?: Profile | null;
  onPress: (opts?: {
    initialTag?: string;
    initialAudience?: "public" | "campus" | "connections" | "room" | "club";
    openMediaImmediately?: boolean;
  }) => void;
}

export function WhatsOnYourMindCard({ currentUser, onPress }: WhatsOnYourMindCardProps) {
  const { colors, isDark } = useTheme();
  const { t, language } = useI18n();

  const [cursorVisible, setCursorVisible] = useState(true);

  // Blinking cursor interval
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 480);
    return () => clearInterval(blinkInterval);
  }, []);

  // Prompts for typewriter cycling
  const typewriterPrompts = useMemo(() => {
    return language === "bn"
      ? [
          "কী ভাবছেন? কোনো প্রশ্ন বা স্টাডি নোট শেয়ার করুন...",
          "অ্যালগরিদম বা কোডিং সমস্যা? সহপাঠীদের জিজ্ঞেস করুন!",
          "ক্যাম্পাসের সাথে দারুণ কোনো রিসোর্স শেয়ার করবেন?",
          "গ্রুপ স্টাডি করতে চান? এখনই একটি পোস্ট করুন...",
        ]
      : [
          "What's on your mind? Share a doubt or study note...",
          "Stuck on coding or math? Ask your campus peers!",
          "Discovered an awesome resource? Share with campus!",
          "Looking for study partners? Create a quick post...",
        ];
  }, [language]);

  const [promptIndex, setPromptIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentFullPrompt = typewriterPrompts[promptIndex] || "";
    let timer: NodeJS.Timeout;

    if (!isDeleting && typedText.length < currentFullPrompt.length) {
      timer = setTimeout(() => {
        setTypedText(currentFullPrompt.slice(0, typedText.length + 1));
      }, 50);
    } else if (!isDeleting && typedText.length === currentFullPrompt.length) {
      timer = setTimeout(() => {
        setIsDeleting(true);
      }, 2600);
    } else if (isDeleting && typedText.length > 0) {
      timer = setTimeout(() => {
        setTypedText(currentFullPrompt.slice(0, typedText.length - 1));
      }, 25);
    } else if (isDeleting && typedText.length === 0) {
      setIsDeleting(false);
      setPromptIndex((prev) => (prev + 1) % typewriterPrompts.length);
    }

    return () => clearTimeout(timer);
  }, [typedText, isDeleting, promptIndex, typewriterPrompts]);

  const handleOpen = (opts?: {
    initialTag?: string;
    initialAudience?: "public" | "campus" | "connections" | "room" | "club";
    openMediaImmediately?: boolean;
  }) => {
    triggerHaptic();
    onPress(opts);
  };

  const userInitial =
    currentUser?.full_name?.[0]?.toUpperCase() ||
    currentUser?.username?.[0]?.toUpperCase() ||
    "U";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftColor: colors.primary,
        },
      ]}
    >
      {/* 1. Main Interactive Input Row */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("feed.createPost")}
        onPress={() => handleOpen()}
        style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
      >
        <Row style={{ alignItems: "center", gap: 12 }}>
          {currentUser?.avatar_url ? (
            <Image source={{ uri: currentUser.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primarySoft }]}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.primary }}>
                {userInitial}
              </Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Row style={{ alignItems: "center", gap: 2 }}>
              <Text
                style={[
                  styles.typewriterText,
                  { color: typedText ? colors.text : colors.muted },
                ]}
                numberOfLines={1}
              >
                {typedText || (language === "bn" ? "কী ভাবছেন?..." : "What's on your mind?...")}
              </Text>
              <View
                style={[
                  styles.cursorBlink,
                  { backgroundColor: colors.primary, opacity: cursorVisible ? 1 : 0 },
                ]}
              />
            </Row>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
              {t("feed.createPost")} • {t("feed.audiencePublic")}
            </Text>
          </View>

          <View style={[styles.pencilBtn, { backgroundColor: colors.primarySoft }]}>
            <MaterialCommunityIcons name="pencil-outline" size={17} color={colors.primary} />
          </View>
        </Row>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* 2. Quick Action Micro Chips */}
      <View style={styles.quickActionsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => handleOpen({ openMediaImmediately: true })}
          style={({ pressed }) => [
            styles.chip,
            { backgroundColor: colors.primarySoft, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="image-outline" size={14} color={colors.primary} />
          <Text style={[styles.chipText, { color: colors.primary }]}>{t("feed.quickPhoto")}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => handleOpen({ initialTag: "#Question", initialAudience: "campus" })}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: isDark ? "#2A1F13" : "#FEF3C7",
              borderColor: isDark ? "#593610" : "#FDE68A",
              borderWidth: 1,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons name="help-circle-outline" size={14} color="#D97706" />
          <Text style={[styles.chipText, { color: isDark ? "#FCD34D" : "#B45309" }]}>
            {t("feed.quickQuestion")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => handleOpen({ initialTag: "#Resource" })}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: isDark ? "#231B2C" : "#F3E8FF",
              borderColor: isDark ? "#4C2B68" : "#E9D5FF",
              borderWidth: 1,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons name="lightbulb-outline" size={14} color="#9333EA" />
          <Text style={[styles.chipText, { color: isDark ? "#D8B4FE" : "#7E22CE" }]}>
            {t("feed.quickResource")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderLeftWidth: 3.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginVertical: 4,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  typewriterText: {
    fontSize: 13,
    fontWeight: "600",
  },
  cursorBlink: {
    width: 2,
    height: 14,
    borderRadius: 1,
  },
  pencilBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  quickActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: radius.pill,
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
});
