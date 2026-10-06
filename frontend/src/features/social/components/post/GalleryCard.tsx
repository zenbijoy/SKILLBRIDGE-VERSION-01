import React, { useState } from "react";
import { View, Text, StyleSheet, Image, Pressable, Modal, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import type { PostAttachment } from "../../types";

interface GalleryCardProps {
  images?: string[];
  attachments?: PostAttachment[];
  youtube?: {
    videoId: string;
    title: string;
    thumbnailUrl: string;
    durationSeconds?: number | null;
  };
}

export function GalleryCard({ images = [], attachments = [], youtube }: GalleryCardProps) {
  const { colors } = useTheme();
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

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
          : "Document";
        const fileName = doc.url.split("/").pop() || "Document.pdf";

        return (
          <Pressable
            key={doc.id}
            onPress={() => openExternal(doc.url)}
            style={[styles.docCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <View style={[styles.docIconWrapper, { backgroundColor: `${colors.primary}15` }]}>
              <MaterialCommunityIcons name="file-pdf-box" size={28} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docName, { color: colors.text }]} numberOfLines={1}>
                {fileName}
              </Text>
              <Text style={[styles.docSize, { color: colors.muted }]}>{sizeMb}</Text>
            </View>
            <Row style={[styles.docOpenBtn, { backgroundColor: `${colors.primary}15` }]}>
              <MaterialCommunityIcons name="download" size={15} color={colors.primary} />
              <Text style={[styles.docOpenText, { color: colors.primary }]}>Open</Text>
            </Row>
          </Pressable>
        );
      })}

      {/* 4. Multi-Image Grid Layouts with Page Counter Badge */}
      {allImages.length > 0 && (
        <View style={styles.gridContainer}>
          {allImages.length > 1 && (
            <View style={styles.pageBadgeTopRight} pointerEvents="none">
              <Text style={styles.pageBadgeText}>1/{allImages.length}</Text>
            </View>
          )}

          {docAttachments.length > 0 && (
            <View style={styles.docBadgeTopLeft} pointerEvents="none">
              <MaterialCommunityIcons name="file-document-outline" size={13} color="#FFFFFF" />
              <Text style={styles.pageBadgeText}>
                {(docAttachments[0] as any)?.name?.split(".")[0] || docAttachments[0]?.url?.split("/").pop()?.split(".")[0] || "Document"} • {allImages.length || 2} pages
              </Text>
            </View>
          )}

          {allImages.length === 1 && (
            <Pressable onPress={() => setActiveImageIndex(0)} style={styles.imageWrapper}>
              <Image source={{ uri: allImages[0] }} style={styles.singleImage} resizeMode="cover" />
            </Pressable>
          )}

          {allImages.length === 2 && (
            <Row style={{ gap: 6 }}>
              {allImages.map((url, idx) => (
                <Pressable key={idx} onPress={() => setActiveImageIndex(idx)} style={{ flex: 1 }}>
                  <Image source={{ uri: url }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
              ))}
            </Row>
          )}

          {allImages.length === 3 && (
            <View style={{ gap: 6 }}>
              <Pressable onPress={() => setActiveImageIndex(0)}>
                <Image source={{ uri: allImages[0] }} style={styles.tripleTopImage} resizeMode="cover" />
              </Pressable>
              <Row style={{ gap: 6 }}>
                <Pressable onPress={() => setActiveImageIndex(1)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[1] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
                <Pressable onPress={() => setActiveImageIndex(2)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[2] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
              </Row>
            </View>
          )}

          {allImages.length === 4 && (
            <View style={{ gap: 6 }}>
              <Row style={{ gap: 6 }}>
                <Pressable onPress={() => setActiveImageIndex(0)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[0] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
                <Pressable onPress={() => setActiveImageIndex(1)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[1] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
              </Row>
              <Row style={{ gap: 6 }}>
                <Pressable onPress={() => setActiveImageIndex(2)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[2] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
                <Pressable onPress={() => setActiveImageIndex(3)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[3] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
              </Row>
            </View>
          )}

          {allImages.length >= 5 && (
            <View style={{ gap: 6 }}>
              <Row style={{ gap: 6 }}>
                <Pressable onPress={() => setActiveImageIndex(0)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[0] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
                <Pressable onPress={() => setActiveImageIndex(1)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[1] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
              </Row>
              <Row style={{ gap: 6 }}>
                <Pressable onPress={() => setActiveImageIndex(2)} style={{ flex: 1 }}>
                  <Image source={{ uri: allImages[2] }} style={styles.doubleImage} resizeMode="cover" />
                </Pressable>
                <Pressable onPress={() => setActiveImageIndex(3)} style={{ flex: 1, position: "relative" }}>
                  <Image source={{ uri: allImages[3] }} style={styles.doubleImage} resizeMode="cover" />
                  {/* Overlay with +N counter */}
                  <View style={styles.overlayPlus}>
                    <Text style={styles.overlayPlusText}>+{allImages.length - 3}</Text>
                  </View>
                </Pressable>
              </Row>
            </View>
          )}
        </View>
      )}

      {/* Full Screen Image Viewer Modal */}
      {activeImageIndex !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setActiveImageIndex(null)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={styles.modalCloseBtn} onPress={() => setActiveImageIndex(null)}>
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
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
  gridContainer: {
    position: "relative",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  pageBadgeTopRight: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 10,
  },
  docBadgeTopLeft: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pageBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  imageWrapper: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  singleImage: {
    width: "100%",
    height: 240,
    borderRadius: radius.md,
  },
  doubleImage: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
  },
  tripleTopImage: {
    width: "100%",
    height: 170,
    borderRadius: radius.md,
  },
  overlayPlus: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayPlusText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  youtubeCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  youtubeThumbContainer: {
    width: 120,
    height: 75,
    position: "relative",
    backgroundColor: "#000000",
  },
  youtubeThumb: {
    width: "100%",
    height: "100%",
  },
  ytPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  youtubeMeta: {
    flex: 1,
    paddingRight: 10,
  },
  youtubeTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  youtubeSub: {
    fontSize: 11,
  },
  videoCard: {
    height: 190,
    borderRadius: radius.md,
    overflow: "hidden",
    position: "relative",
    marginBottom: 8,
    borderWidth: 1,
  },
  videoThumb: {
    width: "100%",
    height: "100%",
  },
  videoPlaceholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 5,
    alignItems: "center",
  },
  videoBarText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  docIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  docName: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  docSize: {
    fontSize: 11,
    marginTop: 2,
  },
  docOpenBtn: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  docOpenText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseBtn: {
    position: "absolute",
    top: 48,
    right: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
  },
  modalFullImage: {
    width: "95%",
    height: "75%",
  },
  modalNavRow: {
    position: "absolute",
    bottom: 40,
    alignItems: "center",
    gap: 20,
  },
  modalNavBtn: {
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
  },
  modalCounter: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
