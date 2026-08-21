import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";
import { Button, triggerHaptic } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type WelcomeContentResponse = {
  contentSets: {
    version: number;
    content: unknown;
  }[];
};

type WelcomeCopy = { id: string; title: string; body: string };
type WelcomeSlide = {
  id: string;
  image: number;
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
      image: require("../../assets/onboarding/01-discover.png"),
      title: serverCopy.get("discover")?.title ?? t("welcome.discoverTitle"),
      subtitle: serverCopy.get("discover")?.body ?? t("welcome.discoverSubtitle"),
      accent: "#2563EB",
    },
    {
      id: "connect",
      image: require("../../assets/onboarding/02-connect.png"),
      title: serverCopy.get("connect")?.title ?? t("welcome.connectTitle"),
      subtitle: serverCopy.get("connect")?.body ?? t("welcome.connectSubtitle"),
      accent: "#0F9F75",
    },
    {
      id: "level_up",
      image: require("../../assets/onboarding/03-level-up.png"),
      title: serverCopy.get("level_up")?.title ?? t("welcome.levelUpTitle"),
      subtitle: serverCopy.get("level_up")?.body ?? t("welcome.levelUpSubtitle"),
      accent: "#4F46E5",
    },
    {
      id: "launch",
      image: require("../../assets/onboarding/04-launch.png"),
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top Header Bar with Skip */}
      <View style={styles.topBar}>
        <Text style={[styles.logoText, { color: colors.primary }]}>SkillBridge</Text>
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
            {/* Artwork Container */}
            <View style={[styles.imageWrapper, { width: Math.min(width * 0.85, 560), height: Math.min(height * 0.48, 560) }]}>
              <Image
                source={item.image}
                style={styles.artworkImage}
                resizeMode="contain"
                accessibilityLabel={item.title}
              />
              <LinearGradient
                colors={["transparent", isDark ? "rgba(10,12,18,0.85)" : "rgba(255,255,255,0.9)"]}
                style={styles.imageGradient}
              />
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
    borderRadius: radius.xl,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  artworkImage: {
    width: "100%",
    height: "100%",
  },
  imageGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
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
