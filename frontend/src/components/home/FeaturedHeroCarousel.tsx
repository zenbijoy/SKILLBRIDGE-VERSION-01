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
    maxHeight: scaleY.value === 0 ? 0 : 260,
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
                ? "আজ নতুন কী শিখবেন?"
                : "What will you master today?"
              : language === "bn"
                ? "কাকে সাহায্য করবেন আজ?"
                : "Who will you empower today?"}
          </Text>

          <Text style={s.cardDetail}>
            {mode === "learn"
              ? language === "bn"
                ? "ক্যাম্পাসের অভিজ্ঞ মেন্টর ও সহপাঠীদের সাথে কানেক্ট করুন।"
                : "Join live study rooms and discover verified campus mentors."
              : language === "bn"
                ? "কাদের আপনার স্কিল দরকার তা দেখে লাইভ সেশনে শেখান।"
                : "Share your expertise, answer peer questions, and boost your streak."}
          </Text>

          <Row style={{ marginTop: 12, justifyContent: "flex-start", gap: 10 }}>
            <Button
              title={mode === "learn" ? "মেন্টর খুঁজুন" : "স্টাডি রুম খুলুন"}
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
            {language === "bn" ? "ভার্চুয়াল লার্নিং রুমে যোগ দিন" : "Jump Into Interactive Rooms"}
          </Text>

          <Text style={s.cardDetail}>
            {language === "bn"
              ? "সহপাঠীদের সাথে ইনস্ট্যান্ট ভিডিও কল, স্ক্রিন শেয়ার ও গ্রুপ স্টাডি।"
              : "Collaborate real-time with peers using LiveKit HD audio/video rooms."}
          </Text>

          <Row style={{ marginTop: 12, justifyContent: "flex-start", gap: 10 }}>
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
            {language === "bn" ? "প্রোফাইল কোয়েস্ট সম্পন্ন করুন" : "Boost Your Campus Reputation"}
          </Text>

          <Text style={s.cardDetail}>
            {language === "bn"
              ? "স্কিল ও পরিচিতি যুক্ত করে ভেরিফায়েড ব্যাজ এবং লিডারবোর্ড র‍্যাংক বাড়ান।"
              : "Complete onboarding steps, answer campus questions, and earn badges."}
          </Text>

          <Row style={{ marginTop: 12, justifyContent: "flex-start", gap: 10 }}>
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
    fontSize: 19,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  cardDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.82)",
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
