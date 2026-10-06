import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme";
import { Button, triggerHaptic } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { WelcomeUIMockup } from "@/features/welcome/WelcomeUIMockup";

type WelcomeContentResponse = {
  contentSets: {
    version: number;
    content: unknown;
  }[];
};

type WelcomeCopy = { id: string; title: string; body: string };
type WelcomeSlide = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
};

export default function WelcomeCarouselScreen() {
  const { colors, isDark } = useTheme();
  const { t, language } = useI18n();
  const { width, height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<WelcomeSlide>>(null);

  const contentQuery = useQuery({
    queryKey: ["experience-content", "welcome", language],
    queryFn: () => api<WelcomeContentResponse>(`/experience/content?type=welcome&locale=${language}`),
    staleTime: 5 * 60_000,
  });
  const serverCopy = useMemo(() => {
    const value = contentQuery.data?.contentSets[0]?.content;
    if (!Array.isArray(value)) return new Map<string, WelcomeCopy>();
    return new Map(value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      return typeof candidate.id === "string" && typeof candidate.title === "string" && typeof candidate.body === "string"
        ? [[candidate.id, candidate as WelcomeCopy] as const]
        : [];
    }));
  }, [contentQuery.data]);

  const slides: WelcomeSlide[] = [
    {
      id: "discover",
      title: serverCopy.get("discover")?.title ?? t("welcome.discoverTitle"),
      subtitle: serverCopy.get("discover")?.body ?? t("welcome.discoverSubtitle"),
      accent: "#2563EB",
    },
    {
      id: "connect",
      title: serverCopy.get("connect")?.title ?? t("welcome.connectTitle"),
      subtitle: serverCopy.get("connect")?.body ?? t("welcome.connectSubtitle"),
      accent: "#0F9F75",
    },
    {
      id: "level_up",
      title: serverCopy.get("level_up")?.title ?? t("welcome.levelUpTitle"),
      subtitle: serverCopy.get("level_up")?.body ?? t("welcome.levelUpSubtitle"),
      accent: "#4F46E5",
    },
    {
      id: "launch",
      title: serverCopy.get("launch")?.title ?? t("welcome.launchTitle"),
      subtitle: serverCopy.get("launch")?.body ?? t("welcome.launchSubtitle"),
      accent: "#D97706",
    },
  ];

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slideIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (slideIndex !== activeIndex && slideIndex >= 0 && slideIndex < slides.length) {
      setActiveIndex(slideIndex);
    }
  };

  const handleNext = () => {
    triggerHaptic();
    if (activeIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
      setActiveIndex(activeIndex + 1);
    } else {
      router.push("/(auth)/sign-up" as any);
    }
  };

  const handleSkip = () => {
    triggerHaptic();
    router.push("/(auth)/sign-up" as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={["top", "bottom", "left", "right"]}>
      {/* Top Header Bar with Skip */}
      <View style={styles.topBar}>
        <View style={styles.brandContainer}>
          <Image
            source={require("@/../assets/branding/skillbridge-mark.png")}
            style={styles.logoMark}
            resizeMode="contain"
          />
          <Text style={[styles.logoText, { color: colors.text }]}>SkillBridge</Text>
        </View>
        {activeIndex < slides.length - 1 ? (
          <Pressable onPress={handleSkip} hitSlop={12} style={styles.skipButton}>
            <Text style={[styles.skipText, { color: colors.muted }]}>{t("welcome.skip")}</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Carousel FlatList */}
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            {/* Real App UI Screen Mockup Preview */}
            <View style={[styles.imageWrapper, { width: Math.min(width * 0.88, 360), height: Math.min(height * 0.44, 340) }]}>
              <WelcomeUIMockup slideId={item.id} />
            </View>

            {/* Content Container */}
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>{item.subtitle}</Text>
            </View>
          </View>
        )}
      />

      {/* Bottom Controls */}
      <View style={styles.bottomBar}>
        {/* Pagination Dots */}
        <View style={styles.paginationRow}>
          {slides.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                { backgroundColor: idx === activeIndex ? colors.primary : colors.border },
                idx === activeIndex && styles.activeDot,
              ]}
            />
          ))}
        </View>

        {/* Action Button */}
        <View style={styles.actionButtonContainer}>
          <Button
            title={activeIndex === slides.length - 1 ? t("welcome.getStarted") : t("welcome.next")}
            onPress={handleNext}
          />
          <Button
            title={t("welcome.signIn")}
            variant="secondary"
            onPress={() => router.push("/(auth)/sign-in" as any)}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  logoText: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  imageWrapper: {
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  textContainer: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: "92%",
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
    borderRadius: 4,
  },
  actionButtonContainer: {
    width: "100%",
    gap: 10,
  },
});
