import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Linking,
} from "react-native";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface SessionReplayModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  videoId?: string | null;
  recordingUrl?: string | null;
  provider?: "youtube" | "google_drive" | "r2" | "custom" | null;
  durationSeconds?: number | null;
}

function extractYouTubeId(urlOrId?: string | null): string | null {
  if (!urlOrId) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/,
  );
  return match && match[1] ? match[1] : null;
}

export function SessionReplayModal({
  visible,
  onClose,
  title,
  videoId,
  recordingUrl,
  durationSeconds,
}: SessionReplayModalProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const resolvedVideoId = videoId || extractYouTubeId(recordingUrl);

  const durationMinutes = durationSeconds ? Math.round(durationSeconds / 60) : null;

  const handleOpenExternal = () => {
    const url = recordingUrl || (resolvedVideoId ? `https://www.youtube.com/watch?v=${resolvedVideoId}` : null);
    if (url) {
      void Linking.openURL(url);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="play-circle" size={22} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close Replay">
              <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Embedded Video Area */}
          <View style={styles.playerContainer}>
            {resolvedVideoId && Platform.OS === "web" ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${resolvedVideoId}?autoplay=1&modestbranding=1&rel=0`}
                style={{ width: "100%", height: "100%", border: "none" } as any}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={title}
              />
            ) : (
              <View style={styles.nativeFallback}>
                <MaterialCommunityIcons name="play-circle-outline" size={48} color={colors.primary} />
                <Text style={[styles.fallbackTitle, { color: colors.text }]}>
                  {t("live.recordingAvailable") || "Session Recording Ready"}
                </Text>
                <TouchableOpacity
                  onPress={handleOpenExternal}
                  style={[styles.openBtn, { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons name="open-in-new" size={16} color="#FFFFFF" />
                  <Text style={styles.openBtnText}>
                    {t("live.replay") || "Watch Session Replay"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Footer Metadata */}
          <View style={[styles.footer, { backgroundColor: colors.surface2 }]}>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="clock-outline" size={15} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {durationMinutes ? `${durationMinutes} min` : "Full Recording"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="shield-check-outline" size={15} color={colors.primary} />
              <Text style={[styles.badge, { color: colors.primary, backgroundColor: `${colors.primary}1A` }]}>
                Unlisted / Private
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 760,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  playerContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  nativeFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  openBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
});
