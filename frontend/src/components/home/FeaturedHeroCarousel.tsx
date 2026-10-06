import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Button, Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { nextGenAnimations, nextGenAnimationsV2 } from "@/assets/nextgen";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 32; // 16px padding on each side

interface FeaturedHeroCarouselProps {
  mode: "learn" | "teach";
  onDismiss?: () => void;
}

export function FeaturedHeroCarousel({ mode, onDismiss }: FeaturedHeroCarouselProps) {
  const { colors } = useTheme();
  const { language } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const isInteractingRef = useRef(false);

  // Reanimated collapse
  const opacity = useSharedValue(1);
  const scaleY = useSharedValue(1);

  const handleDismiss = () => {
    triggerHaptic();
    opacity.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) });
    scaleY.value = withTiming(0, { duration: 380, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) {
        runOnJS(setIsDismissed)(true);
        if (onDismiss) runOnJS(onDismiss)();
      }
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleY: scaleY.value }],
    maxHeight: scaleY.value * 320,
    marginBottom: scaleY.value * 16,
  }));

  // Auto slide ticker (every 4.5 seconds)
  useEffect(() => {
    if (isDismissed) return;
    const interval = setInterval(() => {
      if (isInteractingRef.current) return;
      setActiveIndex((prev) => {
        const next = (prev + 1) % 3;
        scrollRef.current?.scrollTo({ x: next * CARD_WIDTH, animated: true });
        return next;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [isDismissed]);

  // Auto vanish after 10 seconds, reappears on screen reload/refresh
  useEffect(() => {
    if (isDismissed) return;
    const autoVanishTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 450, easing: Easing.out(Easing.quad) });
      scaleY.value = withTiming(0, { duration: 500, easing: Easing.inOut(Easing.quad) }, (finished) => {
        if (finished) {
          runOnJS(setIsDismissed)(true);
          if (onDismiss) runOnJS(onDismiss)();
        }
      });
    }, 10000);

    return () => clearTimeout(autoVanishTimer);
  }, [isDismissed, onDismiss]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / CARD_WIDTH);
    if (index !== activeIndex && index >= 0 && index < 3) {
      setActiveIndex(index);
    }
  };

  if (isDismissed) return null;

  return (
    <Animated.View style={[s.wrap, animatedStyle]}>
      {/* Cards ScrollView */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onTouchStart={() => {
          isInteractingRef.current = true;
        }}
        onTouchEnd={() => {
          setTimeout(() => {
            isInteractingRef.current = false;
          }, 2000);
        }}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
      >
        {/* CARD 1: Knowledge Network / Helping Peers */}
        <View
          style={[
            s.card,
            {
              width: CARD_WIDTH,
              backgroundColor: mode === "learn" ? "#0F5132" : "#0D6832",
              borderColor: `${colors.primary}60`,
            },
          ]}
        >
          <View style={s.cardHeaderRow}>
            <View style={s.eyebrowBadge}>
              <MaterialCommunityIcons name="lightning-bolt" size={12} color="#A7F3D0" />
              <Text style={s.eyebrowText}>SKILLBRIDGE NETWORK</Text>
            </View>
            <Pressable onPress={handleDismiss} hitSlop={10} style={s.cardDismiss}>
              <MaterialCommunityIcons name="close" size={16} color="#A7F3D0" />
            </Pressable>
          </View>

          <Text style={s.cardTitle}>
            {mode === "learn"
              ? language === "bn"
                ? "মেন্টর ও স্টাডি পার্টনার"
                : "Knowledge Network"
              : language === "bn"
                ? "ক্যাম্পাস মেন্টরশিপ"
                : "Peer Empowerment"}
          </Text>

          {/* Visual Glanceable Badges instead of heavy text */}
          <View style={s.chipRow}>
            <View style={s.microChip}>
              <Text style={s.chipEmoji}>🎓</Text>
              <Text style={s.chipText}>{language === "bn" ? "টপ মেন্টর" : "Top Mentors"}</Text>
            </View>
            <View style={s.microChip}>
              <Text style={s.chipEmoji}>⚡</Text>
              <Text style={s.chipText}>{language === "bn" ? "লাইভ কানেক্ট" : "Instant Connect"}</Text>
            </View>
            <View style={s.microChip}>
              <Text style={s.chipEmoji}>🏆</Text>
              <Text style={s.chipText}>{language === "bn" ? "+50 XP" : "+50 XP"}</Text>
            </View>
          </View>

          <Row style={{ marginTop: 8, justifyContent: "flex-start", gap: 10 }}>
            <Button
              title={mode === "learn" ? (language === "bn" ? "মেন্টর খুঁজুন" : "Find Mentors") : (language === "bn" ? "রুম খুলুন" : "Host Room")}
              variant="primary"
              compact
              onPress={() => {
                triggerHaptic();
                if (mode === "learn") router.push("/discover" as any);
                else router.push("/rooms" as any);
              }}
            />
          </Row>
        </View>

        {/* CARD 2: Live Study Rooms with livePulse GIF */}
        <View
          style={[
            s.card,
            {
              width: CARD_WIDTH,
              backgroundColor: "#1E1B4B",
              borderColor: "#4F46E560",
            },
          ]}
        >
          <View style={s.cardHeaderRow}>
            <View style={[s.eyebrowBadge, { backgroundColor: "#312E81" }]}>
              <Image
                source={nextGenAnimations.livePulse}
                style={{ width: 12, height: 12 }}
                resizeMode="contain"
              />
              <Text style={[s.eyebrowText, { color: "#C7D2FE" }]}>LIVE STUDY ROOMS</Text>
            </View>
            <Pressable onPress={handleDismiss} hitSlop={10} style={s.cardDismiss}>
              <MaterialCommunityIcons name="close" size={16} color="#C7D2FE" />
            </Pressable>
          </View>

          <Text style={s.cardTitle}>
            {language === "bn" ? "ভার্চুয়াল লার্নিং রুমে যোগ দিন" : "Join Virtual Study Rooms"}
          </Text>
          <Text style={{ fontSize: 13, color: "#E0E7FF", lineHeight: 18, marginTop: 2 }}>
            {language === "bn"
              ? "সহপাঠীদের সাথে ইনস্ট্যান্ট ভিডিও কল, স্ক্রিন শেয়ার ও গ্রুপ স্টাডি।"
              : "Instant video calls, screen sharing & collaborative group study."}
          </Text>

          <View style={s.chipRow}>
            <View style={[s.microChip, { backgroundColor: "rgba(99, 102, 241, 0.25)" }]}>
              <Text style={s.chipEmoji}>📹</Text>
              <Text style={[s.chipText, { color: "#C7D2FE" }]}>HD Audio/Video</Text>
            </View>
            <View style={[s.microChip, { backgroundColor: "rgba(99, 102, 241, 0.25)" }]}>
              <Text style={s.chipEmoji}>💬</Text>
              <Text style={[s.chipText, { color: "#C7D2FE" }]}>Live Chat</Text>
            </View>
            <View style={[s.microChip, { backgroundColor: "rgba(99, 102, 241, 0.25)" }]}>
              <Text style={s.chipEmoji}>🖥</Text>
              <Text style={[s.chipText, { color: "#C7D2FE" }]}>Screen Share</Text>
            </View>
          </View>

          <Row style={{ marginTop: 8, justifyContent: "flex-start", gap: 10 }}>
            <Button
              title={language === "bn" ? "রুম এক্সপ্লোর করুন" : "Browse Rooms"}
              variant="secondary"
              compact
              onPress={() => {
                triggerHaptic();
                router.push("/rooms" as any);
              }}
            />
          </Row>
        </View>

        {/* CARD 3: Daily Quest / Level Up with progressRing GIF */}
        <View
          style={[
            s.card,
            {
              width: CARD_WIDTH,
              backgroundColor: "#111827",
              borderColor: "#374151",
            },
          ]}
        >
          <View style={s.cardHeaderRow}>
            <View style={[s.eyebrowBadge, { backgroundColor: "#1F2937" }]}>
              <Image
                source={nextGenAnimationsV2.progressRing}
                style={{ width: 14, height: 14 }}
                resizeMode="contain"
              />
              <Text style={[s.eyebrowText, { color: "#93C5FD" }]}>DAILY QUEST • MISSION</Text>
            </View>
            <Pressable onPress={handleDismiss} hitSlop={10} style={s.cardDismiss}>
              <MaterialCommunityIcons name="close" size={16} color="#93C5FD" />
            </Pressable>
          </View>

          <Text style={s.cardTitle}>
            {language === "bn" ? "ক্যাম্পাস রেপুটেশন বুস্ট" : "Campus Reputation & XP"}
          </Text>

          <View style={s.chipRow}>
            <View style={[s.microChip, { backgroundColor: "rgba(59, 130, 246, 0.2)" }]}>
              <Text style={s.chipEmoji}>⭐</Text>
              <Text style={[s.chipText, { color: "#BFDBFE" }]}>Verified Badge</Text>
            </View>
            <View style={[s.microChip, { backgroundColor: "rgba(59, 130, 246, 0.2)" }]}>
              <Text style={s.chipEmoji}>🔥</Text>
              <Text style={[s.chipText, { color: "#BFDBFE" }]}>Daily Streaks</Text>
            </View>
            <View style={[s.microChip, { backgroundColor: "rgba(59, 130, 246, 0.2)" }]}>
              <Text style={s.chipEmoji}>🚀</Text>
              <Text style={[s.chipText, { color: "#BFDBFE" }]}>Top 5% Rank</Text>
            </View>
          </View>

          <Row style={{ marginTop: 8, justifyContent: "flex-start", gap: 10 }}>
            <Button
              title={language === "bn" ? "মিশন দেখুন" : "View Quests"}
              variant="primary"
              compact
              onPress={() => {
                triggerHaptic();
                router.push("/leaderboard" as any);
              }}
            />
          </Row>
        </View>
      </ScrollView>

      {/* Modern Active Dots Indicator */}
      <View style={s.dotsRow}>
        {[0, 1, 2].map((idx) => {
          const isActive = activeIndex === idx;
          return (
            <Pressable
              key={idx}
              onPress={() => {
                triggerHaptic();
                setActiveIndex(idx);
                scrollRef.current?.scrollTo({ x: idx * CARD_WIDTH, animated: true });
              }}
              style={[
                s.dot,
                {
                  backgroundColor: isActive ? colors.primary : `${colors.muted}40`,
                  width: isActive ? 20 : 6,
                },
              ]}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
  scroll: {
    width: "100%",
  },
  scrollContent: {},
  card: {
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    gap: 6,
    justifyContent: "center",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  eyebrowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  eyebrowText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#A7F3D0",
  },
  cardDismiss: {
    padding: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  microChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  chipEmoji: {
    fontSize: 11,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
