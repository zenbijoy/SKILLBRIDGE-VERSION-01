import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Linking, Modal } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useTheme, radius } from "@/theme";

interface VersionResponse {
  success: boolean;
  version: string;
  min_supported_version?: string;
  update_prompt_enabled?: boolean;
  update_title?: string;
  update_message?: string;
  download_url: string;
  showcase_url?: string;
  apk?: {
    filename: string;
    file_size_formatted: string;
  };
}

export function AppUpdateChecker() {
  const { colors, isDark } = useTheme();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const localVersion = Constants.expoConfig?.version ?? "2.0.10";

  useEffect(() => {
    let mounted = true;
    const checkVersion = async () => {
      try {
        const res = await fetch("https://ruetskillbridge.duckdns.org/api/v1/app/version");
        if (!res.ok) return;
        const data: VersionResponse = await res.json();
        if (!mounted || !data.version) return;

        // Simple semver compare: if server version is different or greater
        if (data.version !== localVersion && data.update_prompt_enabled !== false) {
          setVersionInfo(data);
          setUpdateAvailable(true);
        }
      } catch {
        // Silent fail on network error
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 10 * 60 * 1000); // Check every 10 mins
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [localVersion]);

  if (!updateAvailable || dismissed || !versionInfo) {
    return null;
  }

  const handleUpdate = () => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.open(versionInfo.download_url || "https://skillbridgeapk.duckdns.org/download/SkillBridge.apk", "_blank");
      }
    } else {
      Linking.openURL(versionInfo.download_url || "https://skillbridgeapk.duckdns.org/download/SkillBridge.apk");
    }
  };

  return (
    <>
      <View
        style={[
          styles.banner,
          {
            backgroundColor: isDark ? "#0f2e24" : "#e6f7f2",
            borderColor: isDark ? "#059669" : "#10b981",
          },
        ]}
      >
        <View style={styles.bannerLeft}>
          <View style={[styles.iconCircle, { backgroundColor: isDark ? "#059669" : "#10b981" }]}>
            <MaterialCommunityIcons name="rocket-launch-outline" size={18} color="#ffffff" />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: isDark ? "#ffffff" : "#064e3b" }]}>
              New Update: v{versionInfo.version} Available
            </Text>
            <Text style={[styles.subtitle, { color: isDark ? "#a7f3d0" : "#047857" }]}>
              {versionInfo.apk?.file_size_formatted ? `${versionInfo.apk.file_size_formatted} • ` : ""}
              Live Rooms, Vault & Routine Sync
            </Text>
          </View>
        </View>

        <View style={styles.bannerRight}>
          <Pressable
            style={[styles.updateButton, { backgroundColor: isDark ? "#10b981" : "#059669" }]}
            onPress={handleUpdate}
          >
            <MaterialCommunityIcons name="download" size={15} color="#ffffff" style={{ marginRight: 4 }} />
            <Text style={styles.updateButtonText}>Download</Text>
          </Pressable>

          <Pressable
            style={styles.detailsButton}
            onPress={() => setShowModal(true)}
          >
            <MaterialCommunityIcons name="information-outline" size={18} color={isDark ? "#a7f3d0" : "#047857"} />
          </Pressable>

          <Pressable
            style={styles.closeButton}
            onPress={() => setDismissed(true)}
          >
            <MaterialCommunityIcons name="close" size={16} color={isDark ? "#6ee7b7" : "#065f46"} />
          </Pressable>
        </View>
      </View>

      {/* Details Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: isDark ? "#111827" : "#ffffff",
                borderColor: isDark ? "#374151" : "#e5e7eb",
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={[styles.iconCircle, { backgroundColor: "#10b981", width: 40, height: 40, borderRadius: 20 }]}>
                <MaterialCommunityIcons name="cellphone-arrow-down" size={24} color="#ffffff" />
              </View>
              <Text style={[styles.modalTitle, { color: isDark ? "#ffffff" : "#111827" }]}>
                {versionInfo.update_title || `SkillBridge v${versionInfo.version}`}
              </Text>
              <Pressable onPress={() => setShowModal(false)} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={20} color={isDark ? "#9ca3af" : "#6b7280"} />
              </Pressable>
            </View>

            <Text style={[styles.modalBody, { color: isDark ? "#d1d5db" : "#4b5563" }]}>
              {versionInfo.update_message}
            </Text>

            <View style={[styles.infoBox, { backgroundColor: isDark ? "#1f2937" : "#f3f4f6" }]}>
              <Text style={[styles.infoText, { color: isDark ? "#9ca3af" : "#6b7280" }]}>
                • Latest Version: v{versionInfo.version} (Local: v{localVersion})
              </Text>
              <Text style={[styles.infoText, { color: isDark ? "#9ca3af" : "#6b7280" }]}>
                • Package: SkillBridge.apk ({versionInfo.apk?.file_size_formatted || "62 MB"})
              </Text>
              <Text style={[styles.infoText, { color: isDark ? "#9ca3af" : "#6b7280" }]}>
                • Compatibility: Android 8.0+ (ARM64 & x86_64)
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalDownloadBtn, { backgroundColor: "#10b981" }]}
                onPress={() => {
                  setShowModal(false);
                  handleUpdate();
                }}
              >
                <MaterialCommunityIcons name="download" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.modalDownloadText}>Download & Install APK</Text>
              </Pressable>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: isDark ? "#374151" : "#d1d5db" }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: isDark ? "#9ca3af" : "#6b7280" }]}>Later</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    zIndex: 9999,
  },
  bannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  bannerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  updateButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  detailsButton: {
    padding: 6,
  },
  closeButton: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 480,
    borderRadius: radius.lg,
    padding: 24,
    borderWidth: 1,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginLeft: 12,
    flex: 1,
  },
  modalClose: {
    padding: 4,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  infoBox: {
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 20,
    gap: 6,
  },
  infoText: {
    fontSize: 12,
    fontWeight: "500",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalDownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  modalDownloadText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
