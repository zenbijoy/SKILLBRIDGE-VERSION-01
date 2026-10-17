import React, { useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius, useTheme } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import type { PostAttachment } from "../../types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface GalleryCardProps {
  images?: string[];
  attachments?: PostAttachment[];
  youtube?: {
    videoId: string;
    title: string;
    thumbnailUrl: string;
    durationSeconds?: number | null;
  };
  onDoubleTapLike?: () => void;
}

export function GalleryCard({
  images = [],
  attachments = [],
  youtube,
  onDoubleTapLike,
}: GalleryCardProps) {
  const { colors, isDark } = useTheme();
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Separate media by type
  const docAttachments = attachments.filter((a) => a.media_type === "document");
  const videoAttachments = attachments.filter((a) => a.media_type === "video");

  // Collect all image URLs
  const allImages = React.useMemo(() => {
    const list = [...images];
    for (const a of attachments) {
      if (a.media_type === "image" || !a.media_type) {
        if (!list.includes(a.url)) list.push(a.url);
      }
    }
    return list;
  }, [images, attachments]);

  const openExternal = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  // Double Tap detection & heart burst animation
  const lastTapRef = useRef<number>(0);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const heartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  const handleImagePress = (idx: number) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected!
      triggerHaptic("impactMedium");
      onDoubleTapLike?.();

      // Trigger Instagram Heart Burst
      heartScale.value = withSequence(
        withSpring(1.2, { damping: 5, stiffness: 220 }),
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 250 }),
      );
      heartOpacity.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 250 }),
      );
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      // Single tap timeout to open lightbox
      setTimeout(() => {
        if (lastTapRef.current === now) {
          setActiveImageIndex(idx);
        }
      }, DOUBLE_TAP_DELAY);
    }
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffset = e.nativeEvent.contentOffset.x;
    const viewSize = e.nativeEvent.layoutMeasurement.width;
    const pageNum = Math.floor((contentOffset + viewSize / 2) / viewSize);
    if (pageNum !== currentSlide && pageNum >= 0 && pageNum < allImages.length) {
      setCurrentSlide(pageNum);
    }
  };

  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH - 28);

  return (
    <View style={styles.container}>
      {/* 1. YouTube Preview Card */}
      {youtube && (
        <Pressable
          onPress={() => openExternal(`https://www.youtube.com/watch?v=${youtube.videoId}`)}
          style={[styles.youtubeCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <View style={styles.youtubeThumbContainer}>
            <Image source={{ uri: youtube.thumbnailUrl }} style={styles.youtubeThumb} />
            <View style={styles.ytPlayOverlay}>
              <MaterialCommunityIcons name="youtube" size={36} color="#EF4444" />
            </View>
          </View>
          <View style={styles.youtubeMeta}>
            <Text style={[styles.youtubeTitle, { color: colors.text }]} numberOfLines={2}>
              {youtube.title}
            </Text>
            <Row style={{ alignItems: "center", gap: 4, marginTop: 4 }}>
              <MaterialCommunityIcons name="youtube" size={14} color="#EF4444" />
              <Text style={[styles.youtubeSub, { color: colors.muted }]}>Watch on YouTube</Text>
            </Row>
          </View>
        </Pressable>
      )}

      {/* 2. Video Attachments */}
      {videoAttachments.map((vid) => (
        <Pressable
          key={vid.id}
          onPress={() => openExternal(vid.url)}
          style={[styles.videoCard, { borderColor: colors.border, backgroundColor: "#0F172A" }]}
        >
          {vid.thumbnail_url ? (
            <Image source={{ uri: vid.thumbnail_url }} style={styles.videoThumb} />
          ) : (
            <View style={styles.videoPlaceholder}>
              <MaterialCommunityIcons name="video" size={40} color="#94A3B8" />
            </View>
          )}
          <View style={styles.videoPlayOverlay}>
            <View style={styles.playCircle}>
              <MaterialCommunityIcons name="play" size={26} color="#FFFFFF" />
            </View>
          </View>
          <View style={styles.videoBottomBar}>
            <Text style={styles.videoBarText}>Video Attachment · Tap to Play</Text>
          </View>
        </Pressable>
      ))}

      {/* 3. Document / PDF Attachments */}
      {docAttachments.map((doc) => {
        const sizeMb = doc.file_size_bytes
          ? `${(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
          : "PDF Document";
        const fileName = (doc as any).name || doc.url.split("/").pop() || "Document.pdf";

        return (
          <Pressable
            key={doc.id}
            onPress={() => openExternal(doc.url)}
            style={[styles.docCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <View style={[styles.docIconWrapper, { backgroundColor: `${colors.primary}15` }]}>
              <MaterialCommunityIcons name="file-pdf-box" size={30} color="#EF4444" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.docName, { color: colors.text }]} numberOfLines={1}>
                {fileName}
              </Text>
              <Text style={[styles.docSize, { color: colors.muted }]}>{sizeMb} • PDF</Text>
            </View>
            <Row style={[styles.docOpenBtn, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="file-eye-outline" size={15} color={colors.primary} />
              <Text style={[styles.docOpenText, { color: colors.primary }]}>Read</Text>
            </Row>
          </Pressable>
        );
      })}

      {/* 4. Instagram-Style Photo Display & Multi-Image Carousel */}
      {allImages.length > 0 && (
        <View
          style={[styles.instaMediaWrapper, { backgroundColor: isDark ? "#0A0D14" : "#F1F5F9" }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0) setContainerWidth(w);
          }}
        >
          {/* Top-Right Carousel Counter Badge (e.g. 1/3) */}
          {allImages.length > 1 && (
            <View style={styles.pageBadgeTopRight} pointerEvents="none">
              <Text style={styles.pageBadgeText}>
                {currentSlide + 1}/{allImages.length}
              </Text>
            </View>
          )}

          {/* Double-Tap Heart Burst Animation Center Overlay */}
          <Animated.View style={[styles.centerHeartOverlay, heartAnimStyle]} pointerEvents="none">
            <MaterialCommunityIcons name="heart" size={90} color="#FFFFFF" style={styles.heartShadow} />
          </Animated.View>

          {allImages.length === 1 ? (
            <Pressable
              onPress={() => handleImagePress(0)}
              style={[styles.imageContainer, { width: containerWidth }]}
            >
              <Image
                source={{ uri: allImages[0] }}
                style={[styles.instaImage, { width: containerWidth }]}
                resizeMode="cover"
              />
            </Pressable>
          ) : (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              style={{ width: containerWidth }}
            >
              {allImages.map((uri, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => handleImagePress(idx)}
                  style={[styles.imageContainer, { width: containerWidth }]}
                >
                  <Image
                    source={{ uri }}
                    style={[styles.instaImage, { width: containerWidth }]}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Instagram Carousel Indicator Dots */}
          {allImages.length > 1 && (
            <View style={styles.dotsRow} pointerEvents="none">
              {allImages.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    idx === currentSlide
                      ? [styles.activeDot, { backgroundColor: colors.primary }]
                      : [styles.inactiveDot, { backgroundColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)" }],
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Full Screen Image Lightbox Modal */}
      {activeImageIndex !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setActiveImageIndex(null)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={styles.modalCloseBtn} onPress={() => setActiveImageIndex(null)}>
              <MaterialCommunityIcons name="close" size={26} color="#FFFFFF" />
            </Pressable>
            <Image
              source={{ uri: allImages[activeImageIndex] }}
              style={styles.modalFullImage}
              resizeMode="contain"
            />
            {allImages.length > 1 && (
              <Row style={styles.modalNavRow}>
                <Pressable
                  disabled={activeImageIndex === 0}
                  onPress={() => setActiveImageIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
                  style={[styles.modalNavBtn, activeImageIndex === 0 && { opacity: 0.3 }]}
                >
                  <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.modalCounter}>
                  {activeImageIndex + 1} / {allImages.length}
                </Text>
                <Pressable
                  disabled={activeImageIndex === allImages.length - 1}
                  onPress={() => setActiveImageIndex((prev) => (prev !== null && prev < allImages.length - 1 ? prev + 1 : prev))}
                  style={[styles.modalNavBtn, activeImageIndex === allImages.length - 1 && { opacity: 0.3 }]}
                >
                  <MaterialCommunityIcons name="chevron-right" size={28} color="#FFFFFF" />
                </Pressable>
              </Row>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  instaMediaWrapper: {
    position: "relative",
    borderRadius: radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  imageContainer: {
    height: 380,
    justifyContent: "center",
    alignItems: "center",
  },
  instaImage: {
    height: 380,
  },
  centerHeartOverlay: {
    position: "absolute",
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  heartShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  pageBadgeTopRight: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0, 0, 0, 0.68)",
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    zIndex: 15,
  },
  pageBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dotsRow: {
    position: "absolute",
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    zIndex: 15,
  },
  dot: {
    borderRadius: 3,
    height: 6,
  },
  activeDot: {
    width: 18,
  },
  inactiveDot: {
    width: 6,
  },
  youtubeCard: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 6,
  },
  youtubeThumbContainer: {
    width: 120,
    height: 80,
    position: "relative",
  },
  youtubeThumb: {
    width: "100%",
    height: "100%",
  },
  ytPlayOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  youtubeMeta: {
    flex: 1,
    padding: 8,
    justifyContent: "center",
  },
  youtubeTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  youtubeSub: {
    fontSize: 11,
  },
  videoCard: {
    height: 200,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  videoThumb: {
    width: "100%",
    height: "100%",
  },
  videoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlayOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  videoBarText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    marginBottom: 6,
  },
  docIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  docName: {
    fontSize: 13,
    fontWeight: "600",
  },
  docSize: {
    fontSize: 11,
  },
  docOpenBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignItems: "center",
    gap: 4,
  },
  docOpenText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  modalFullImage: {
    width: "100%",
    height: "80%",
  },
  modalNavRow: {
    position: "absolute",
    bottom: 40,
    alignItems: "center",
    gap: 20,
  },
  modalNavBtn: {
    padding: 10,
  },
  modalCounter: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
