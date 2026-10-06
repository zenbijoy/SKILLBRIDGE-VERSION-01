import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  Layout,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTour } from "./TourContext";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";

const CHAPTER_CONFIGS: Record<
  string,
  {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
    bg: string;
  }
> = {
  dashboard: {
    icon: "view-dashboard-outline",
    color: "#3B82F6",
    bg: "rgba(59, 130, 246, 0.15)",
  },
  search: {
    icon: "magnify",
    color: "#8B5CF6",
    bg: "rgba(139, 92, 246, 0.15)",
  },
  rooms: {
    icon: "account-group-outline",
    color: "#10B981",
    bg: "rgba(16, 185, 129, 0.15)",
  },
  chat: {
    icon: "chat-processing-outline",
    color: "#06B6D4",
    bg: "rgba(6, 182, 212, 0.15)",
  },
  livekit: {
    icon: "video-outline",
    color: "#F43F5E",
    bg: "rgba(244, 63, 94, 0.15)",
  },
  quests: {
    icon: "trophy-outline",
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.15)",
  },
  settings: {
    icon: "cog-outline",
    color: "#6366F1",
    bg: "rgba(99, 102, 241, 0.15)",
  },
};

export function TourOverlay() {
  const { colors, isDark } = useTheme();
  const { t, language } = useI18n();
  const isBn = language === "bn";

  const {
    isActive,
    currentStepIndex,
    currentChapter,
    chapters,
    isLastStep,
    nextStep,
    previousStep,
    skipStep,
    skipTour,
  } = useTour();

  // "Peek" mode lets the user minimize the card to a compact pill to see the full screen
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isActive) return null;

  const currentConfig =
    CHAPTER_CONFIGS[currentChapter.id] || CHAPTER_CONFIGS.dashboard!;

  const title =
    currentChapter.title ?? t(currentChapter.titleKey ?? "tour.step1Title");
  const body =
    currentChapter.body ?? t(currentChapter.bodyKey ?? "tour.step1Body");

  return (
    <View pointerEvents="box-none" style={styles.backdrop}>
      {/* ─────────────────────────────────────────────────────────────
          1. MINIMIZED FLOATING PILL (Allows 100% full screen viewing)
          ───────────────────────────────────────────────────────────── */}
      {isMinimized ? (
        <Animated.View
          entering={SlideInDown.springify().damping(16)}
          exiting={SlideOutDown.duration(180)}
          layout={Layout.springify()}
          style={styles.pillContainer}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              triggerHaptic();
              setIsMinimized(false);
            }}
            style={[
              styles.floatingPill,
              {
                backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
                borderColor: currentConfig.color,
              },
            ]}
          >
            <View style={[styles.miniDot, { backgroundColor: currentConfig.color }]} />
            <Text style={[styles.pillTitle, { color: colors.text }]} numberOfLines={1}>
              {isBn ? `ধাপ ${currentStepIndex + 1}/${chapters.length}` : `Step ${currentStepIndex + 1}/${chapters.length}`}: {title}
            </Text>
            <View style={styles.expandTag}>
              <Ionicons name="eye-outline" size={13} color={currentConfig.color} />
              <Text style={[styles.expandText, { color: currentConfig.color }]}>
                {isBn ? "খুলুন" : "Expand"}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        /* ─────────────────────────────────────────────────────────────
           2. COMPACT ANIMATED SPOTLIGHT DOCK CARD
           ───────────────────────────────────────────────────────────── */
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          exiting={SlideOutDown.duration(200)}
          layout={Layout.springify()}
          style={styles.cardContainer}
        >
          <View
            style={[
              styles.tourCard,
              {
                backgroundColor: isDark ? "#131926" : "#FFFFFF",
                borderColor: isDark ? "#1F293D" : "#E2E8F0",
              },
            ]}
          >
            {/* Top 7-Segment Progress Track */}
            <View style={styles.segmentedProgressBar}>
              {chapters.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.progressSegment,
                    {
                      backgroundColor:
                        idx === currentStepIndex
                          ? currentConfig.color
                          : idx < currentStepIndex
                          ? isDark
                            ? "rgba(255,255,255,0.4)"
                            : "rgba(0,0,0,0.3)"
                          : isDark
                          ? "#1E293B"
                          : "#E2E8F0",
                      height: idx === currentStepIndex ? 4 : 3,
                    },
                  ]}
                />
              ))}
            </View>

            {/* Header: Icon, Step Chip, Peek Toggle, and Dismiss */}
            <View style={styles.cardHeaderRow}>
              <View style={styles.stepInfoRow}>
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: currentConfig.bg,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={currentConfig.icon}
                    size={16}
                    color={currentConfig.color}
                  />
                </View>

                <View style={styles.stepBadge}>
                  <Text style={[styles.stepBadgeText, { color: currentConfig.color }]}>
                    {isBn
                      ? `ধাপ ${currentStepIndex + 1} / ${chapters.length}`
                      : `Step ${currentStepIndex + 1} / ${chapters.length}`}
                  </Text>
                </View>
              </View>

              <View style={styles.headerControls}>
                {/* Peek / Minimize Full Screen button */}
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    setIsMinimized(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[
                    styles.controlBtn,
                    { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" },
                  ]}
                >
                  <Ionicons name="eye-outline" size={14} color={colors.muted} />
                  <Text style={[styles.peekText, { color: colors.muted }]}>
                    {isBn ? "পর্দা দেখুন" : "Peek"}
                  </Text>
                </TouchableOpacity>

                {/* Dismiss / Skip Tour */}
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    skipTour();
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.closeBtn}
                >
                  <Ionicons name="close" size={17} color={colors.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Title & Short Instruction */}
            <Animated.View
              key={currentStepIndex}
              entering={FadeIn.duration(200)}
              style={styles.textBlock}
            >
              <Text style={[styles.titleText, { color: colors.text }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.bodyText, { color: colors.muted }]} numberOfLines={2}>
                {body}
              </Text>
            </Animated.View>

            {/* Bottom Actions Row */}
            <View style={styles.actionsRow}>
              {currentStepIndex > 0 ? (
                <TouchableOpacity
                  onPress={previousStep}
                  style={[
                    styles.secondaryBtn,
                    { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" },
                  ]}
                >
                  <Ionicons name="chevron-back" size={15} color={colors.text} />
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                    {isBn ? "আগের" : "Back"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={skipStep}
                  style={[
                    styles.secondaryBtn,
                    { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" },
                  ]}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.muted }]}>
                    {isBn ? "এড়িয়ে যান" : "Skip"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Next Step / Complete Gradient Button */}
              <TouchableOpacity
                onPress={nextStep}
                activeOpacity={0.88}
                style={styles.primaryBtnWrap}
              >
                <LinearGradient
                  colors={
                    isLastStep
                      ? ["#F59E0B", "#D97706"]
                      : ["#3B82F6", "#2563EB"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryBtnText}>
                    {isLastStep
                      ? isBn
                        ? "🏆 +৫ এক্সপি নিয়ে শেষ করুন"
                        : "🏆 Finish & Claim +5 XP"
                      : isBn
                      ? "পরের ধাপ →"
                      : "Next Step →"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "flex-end",
    paddingBottom: 20,
    paddingHorizontal: 14,
    zIndex: 9999,
    elevation: 9999,
  },
  cardContainer: {
    width: "100%",
  },
  tourCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  segmentedProgressBar: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 10,
  },
  progressSegment: {
    flex: 1,
    borderRadius: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  stepInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  peekText: {
    fontSize: 11,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 3,
  },
  textBlock: {
    marginVertical: 4,
  },
  titleText: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 4,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  primaryBtnWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  primaryGradient: {
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  pillContainer: {
    width: "100%",
    alignItems: "center",
  },
  floatingPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillTitle: {
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 220,
  },
  expandTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingLeft: 4,
  },
  expandText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
