import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { triggerHaptic } from "@/components/ui";

interface AnimatedGreetingProps {
  name: string;
  mode: "learn" | "teach";
  onDismiss?: () => void;
}

export function AnimatedGreeting({ name, mode, onDismiss }: AnimatedGreetingProps) {
  const { colors } = useTheme();
  const { language } = useI18n();
  const [isVisible, setIsVisible] = useState(true);

  // 1. Time-aware greeting logic
  const hour = new Date().getHours();
  let greetingPrefix = "Good morning";
  let greetingEmoji = "🌅";

  if (language === "bn") {
    if (hour >= 5 && hour < 12) {
      greetingPrefix = "শুভ সকাল";
      greetingEmoji = "🌅";
    } else if (hour >= 12 && hour < 17) {
      greetingPrefix = "শুভ দুপুর";
      greetingEmoji = "☀️";
    } else if (hour >= 17 && hour < 21) {
      greetingPrefix = "শুভ সন্ধ্যা";
      greetingEmoji = "🌆";
    } else {
      greetingPrefix = "শুভ রাত্রি";
      greetingEmoji = "🌙";
    }
  } else {
    if (hour >= 5 && hour < 12) {
      greetingPrefix = "Good morning";
      greetingEmoji = "🌅";
    } else if (hour >= 12 && hour < 17) {
      greetingPrefix = "Good afternoon";
      greetingEmoji = "☀️";
    } else if (hour >= 17 && hour < 21) {
      greetingPrefix = "Good evening";
      greetingEmoji = "🌆";
    } else {
      greetingPrefix = "Late night focus";
      greetingEmoji = "🌙";
    }
  }

  const fullGreeting = `${greetingPrefix}, ${name} ${greetingEmoji}`;
  const subtitle =
    mode === "learn"
      ? language === "bn"
        ? "আজ নতুন কী শিখতে চান? আপনার স্টাডি নেটওয়ার্ক প্রস্তুত।"
        : "Explore peer study rooms and expand your knowledge."
      : language === "bn"
        ? "নিজের জ্ঞান শেয়ার করুন এবং ক্যাম্পাস রেপুটেশন বাড়ান।"
        : "Mentor fellow learners and build your academic influence.";

  // 2. Typewriter Effect
  const [displayedText, setDisplayedText] = useState("");
  const [isTypingDone, setIsTypingDone] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Typewriter ticker
  useEffect(() => {
    let index = 0;
    setDisplayedText("");
    setIsTypingDone(false);

    const typeInterval = setInterval(() => {
      index++;
      if (index <= fullGreeting.length) {
        setDisplayedText(fullGreeting.slice(0, index));
      } else {
        clearInterval(typeInterval);
        setIsTypingDone(true);
      }
    }, 32);

    return () => clearInterval(typeInterval);
  }, [fullGreeting]);

  // Cursor blink
  useEffect(() => {
    if (isTypingDone) {
      const timeout = setTimeout(() => setCursorVisible(false), 1200);
      return () => clearTimeout(timeout);
    }
    const blinkInterval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500);
    return () => clearInterval(blinkInterval);
  }, [isTypingDone]);

  // 3. Auto-vanish after 10 seconds
  useEffect(() => {
    if (!isTypingDone) return;
    const vanishTimer = setTimeout(() => {
      handleDismiss();
    }, 10_000);

    return () => clearTimeout(vanishTimer);
  }, [isTypingDone]);

  const handleDismiss = () => {
    triggerHaptic();
    setIsVisible(false);
    if (onDismiss) onDismiss();
  };

  if (!isVisible) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(350)}
      exiting={FadeOutUp.duration(400)}
      style={s.wrap}
    >
      <View style={s.contentRow}>
        <View style={s.textCol}>
          <Text style={[s.title, { color: colors.text }]}>
            {displayedText}
            {cursorVisible && <Text style={[s.cursor, { color: colors.primary }]}>|</Text>}
          </Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>{subtitle}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss greeting"
          onPress={handleDismiss}
          hitSlop={10}
          style={s.closeButton}
        >
          <MaterialCommunityIcons name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    paddingHorizontal: 4,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  cursor: {
    fontWeight: "300",
    fontSize: 22,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  closeButton: {
    padding: 6,
    borderRadius: 12,
  },
});
