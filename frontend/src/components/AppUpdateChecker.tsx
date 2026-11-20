import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Linking,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";

// Safely resolve IntentLauncher if native module is present in the build
let IntentLauncherModule: any = null;
try {
  IntentLauncherModule = require("expo-intent-launcher");
} catch {
  IntentLauncherModule = null;
}

export interface VersionResponse {
  success: boolean;
  version: string;
  current_version?: string;
  version_code?: number;
  min_supported_version?: string;
  recommended_version?: string;
  update_prompt_enabled?: boolean;
  update_title?: string;
  update_message?: string;
  download_url: string;
  direct_apk_url?: string;
  showcase_url?: string;
  apk?: {
    filename: string;
    file_size_formatted: string;
    file_size_bytes?: number;
    sha256?: string;
    min_android_version?: string;
    architectures?: string[];
  };
  release_notes?: string[];
  published_at?: string;
}

const DEFAULT_DOWNLOAD_URL = "https://skillbridgeapk.duckdns.org/download/SkillBridge.apk";

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function AppUpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const localVersion = Constants.expoConfig?.version ?? "2.0.10";

  useEffect(() => {
    let mounted = true;
    const checkVersion = async () => {
      try {
        const res = await fetch("https://ruetskillbridge.duckdns.org/api/v1/app/version");
        if (!res.ok) return;
        const data: VersionResponse = await res.json();
        if (!mounted || !data.version) return;

        if (data.version !== localVersion && data.update_prompt_enabled !== false) {
          setVersionInfo(data);
          setUpdateAvailable(true);
        }
      } catch {
        // Silent fail on network error
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 10 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [localVersion]);

  if (!updateAvailable || dismissed || !versionInfo) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(16).stiffness(120)}
      exiting={FadeOutUp.duration(200)}
      style={styles.floatingContainer}
    >
      <UpdateInfoCard
        versionInfo={versionInfo}
        localVersion={localVersion}
        onDismiss={() => {
          triggerHaptic();
          setDismissed(true);
        }}
      />
    </Animated.View>
  );
}

export function UpdateInfoCard({
  versionInfo,
  localVersion = Constants.expoConfig?.version ?? "2.0.10",
  onDismiss,
  compact = false,
}: {
  versionInfo: VersionResponse;
  localVersion?: string;
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  // Download & Installation Progress States
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0); // 0 to 1
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [cachedApkUri, setCachedApkUri] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const downloadTaskRef = useRef<FileSystem.DownloadResumable | null>(null);

  const targetVer = versionInfo.version || "latest";
  const apkFileName = versionInfo.apk?.filename || `SkillBridge_v${targetVer}.apk`;
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
  const localTargetUri = `${baseDir}${apkFileName}`;
  const displayFileSize = versionInfo.apk?.file_size_formatted || "62.1 MB";

  // Check on mount whether this APK version is already downloaded
  useEffect(() => {
    let mounted = true;
    const checkLocalCache = async () => {
      try {
        if (Platform.OS === "web") return;
        const fileInfo = await FileSystem.getInfoAsync(localTargetUri);
        if (fileInfo.exists && fileInfo.size && fileInfo.size > 5 * 1024 * 1024) {
          if (mounted) {
            setCachedApkUri(localTargetUri);
            setIsDownloaded(true);
            setDownloadedBytes(fileInfo.size);
            setTotalBytes(fileInfo.size);
            setDownloadProgress(1);
          }
        }
      } catch {
        // Cache read fallback
      }
    };

    checkLocalCache();
    return () => {
      mounted = false;
    };
  }, [localTargetUri]);

  // Install APK directly inside the app without opening web browser
  const launchNativeInstaller = async (fileUri: string) => {
    triggerHaptic();
    setStatusMessage("Opening package installer...");

    if (Platform.OS === "web") {
      const url = versionInfo.download_url || versionInfo.direct_apk_url || DEFAULT_DOWNLOAD_URL;
      if (typeof window !== "undefined") window.open(url, "_blank");
      return;
    }

    try {
      if (Platform.OS === "android") {
        // Step 1: Convert local file:// URI to content:// URI via FileProvider
        const contentUri = await FileSystem.getContentUriAsync(fileUri);

        // Step 2: Try native IntentLauncher with FLAG_GRANT_READ_URI_PERMISSION (1)
        if (IntentLauncherModule?.startActivityAsync) {
          try {
            await IntentLauncherModule.startActivityAsync("android.intent.action.VIEW", {
              data: contentUri,
              flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
              type: "application/vnd.android.package-archive",
            });
            setStatusMessage("Installer opened. Please tap 'Update' or 'Install'.");
            return;
          } catch (intentErr) {
            console.warn("IntentLauncher fallback:", intentErr);
          }
        }

        // Step 3: Try expo-sharing fallback
        try {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/vnd.android.package-archive",
            dialogTitle: `Install SkillBridge v${versionInfo.version}`,
            UTI: "com.android.package-archive",
          });
          setStatusMessage("Select Package Installer to proceed.");
          return;
        } catch (sharingErr) {
          console.warn("Sharing fallback error:", sharingErr);
        }
      }

      // Step 4: Fallback to direct URL if native intents fail
      const targetUrl = versionInfo.download_url || versionInfo.direct_apk_url || DEFAULT_DOWNLOAD_URL;
      await Linking.openURL(targetUrl);
    } catch (err: any) {
      console.error("Installation failed:", err);
      setStatusMessage("Could not launch installer. Tap to retry.");
    }
  };

  // Download APK directly inside the app with real-time progress
  const startInAppDownload = async () => {
    triggerHaptic();
    const downloadUrl = versionInfo.direct_apk_url || versionInfo.download_url || DEFAULT_DOWNLOAD_URL;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setStatusMessage("Connecting and downloading APK...");

    try {
      // Remove any broken partial download
      const existing = await FileSystem.getInfoAsync(localTargetUri);
      if (existing.exists) {
        await FileSystem.deleteAsync(localTargetUri, { idempotent: true });
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        localTargetUri,
        {},
        (data) => {
          if (data.totalBytesExpectedToWrite > 0) {
            const ratio = Math.min(Math.max(data.totalBytesWritten / data.totalBytesExpectedToWrite, 0), 1);
            setDownloadProgress(ratio);
            setDownloadedBytes(data.totalBytesWritten);
            setTotalBytes(data.totalBytesExpectedToWrite);
          }
        }
      );

      downloadTaskRef.current = downloadResumable;
      const result = await downloadResumable.downloadAsync();

      if (result && result.uri) {
        setCachedApkUri(result.uri);
        setIsDownloaded(true);
        setIsDownloading(false);
        setDownloadProgress(1);
        setStatusMessage("Download complete! Launching installer...");

        // Automatically trigger in-app package installer
        await launchNativeInstaller(result.uri);
      } else {
        throw new Error("Download finished without valid local URI.");
      }
    } catch (err: any) {
      console.error("Download error:", err);
      setIsDownloading(false);
      setStatusMessage(err?.message || "Download failed. Please tap to retry.");
    }
  };

  // Primary Action Button Handler
  const handlePrimaryPress = async () => {
    if (isDownloading) return;

    if (isDownloaded && cachedApkUri) {
      // Already downloaded on the device: trigger reinstall directly without re-downloading!
      await launchNativeInstaller(cachedApkUri);
    } else {
      // Not yet downloaded: download in-app with live progress
      await startInAppDownload();
    }
  };

  // Delete cached APK and re-download
  const handleRedownload = async () => {
    triggerHaptic();
    try {
      if (cachedApkUri) {
        await FileSystem.deleteAsync(cachedApkUri, { idempotent: true });
      }
    } catch {}
    setIsDownloaded(false);
    setCachedApkUri(null);
    setDownloadProgress(0);
    await startInAppDownload();
  };

  const releaseNotes = versionInfo.release_notes || [
    "High-fidelity Live Study Rooms with WebRTC Audio & Video",
    "Central Academic Vault with instant offline search",
    "Smart Routine Extractor & Class Calendar sync",
    "In-App 1-Tap APK download & native package installation",
  ];

  const percentLabel = `${Math.round(downloadProgress * 100)}%`;

  return (
    <>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? "#0d1a14" : "#f4fcf8",
            borderColor: isDark ? "rgba(16, 185, 129, 0.45)" : "rgba(16, 185, 129, 0.35)",
            shadowColor: isDark ? "#059669" : "#10b981",
          },
        ]}
      >
        {/* Subtle decorative gradient glow behind header */}
        <LinearGradient
          colors={
            isDark
              ? ["rgba(16, 185, 129, 0.18)", "rgba(5, 150, 105, 0.04)", "transparent"]
              : ["rgba(16, 185, 129, 0.12)", "rgba(5, 150, 105, 0.03)", "transparent"]
          }
          style={styles.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {/* Card Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={
                isDownloaded
                  ? ["#059669", "#047857"]
                  : isDownloading
                  ? ["#3b82f6", "#2563eb"]
                  : ["#10b981", "#059669"]
              }
              style={styles.iconBadge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons
                name={
                  isDownloaded
                    ? "check-decagram"
                    : isDownloading
                    ? "download"
                    : "cellphone-arrow-down"
                }
                size={24}
                color="#ffffff"
              />
            </LinearGradient>

            <View style={styles.headerTextGroup}>
              <View style={styles.badgeRow}>
                {isDownloading ? (
                  <View style={[styles.statusPill, { backgroundColor: isDark ? "rgba(59, 130, 246, 0.25)" : "rgba(59, 130, 246, 0.15)" }]}>
                    <ActivityIndicator size={10} color="#3b82f6" />
                    <Text style={[styles.statusPillText, { color: isDark ? "#60a5fa" : "#2563eb" }]}>
                      DOWNLOADING {percentLabel}
                    </Text>
                  </View>
                ) : isDownloaded ? (
                  <View style={[styles.statusPill, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.3)" : "rgba(16, 185, 129, 0.2)" }]}>
                    <MaterialCommunityIcons name="check-circle" size={12} color="#10b981" />
                    <Text style={[styles.statusPillText, { color: isDark ? "#34d399" : "#059669" }]}>
                      APK READY TO INSTALL
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.statusPill, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.15)" }]}>
                    <View style={styles.pulsingDot} />
                    <Text style={[styles.statusPillText, { color: isDark ? "#34d399" : "#059669" }]}>
                      NEW UPDATE READY
                    </Text>
                  </View>
                )}

                <View style={[styles.versionPill, { backgroundColor: isDark ? "#1f2937" : "#e5e7eb" }]}>
                  <Text style={[styles.versionPillText, { color: isDark ? "#e5e7eb" : "#374151" }]}>
                    v{versionInfo.version}
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardTitle, { color: isDark ? "#ffffff" : "#064e3b" }]}>
                {isDownloaded
                  ? `SkillBridge v${versionInfo.version} is Ready`
                  : versionInfo.update_title || `SkillBridge v${versionInfo.version} Available`}
              </Text>
            </View>
          </View>

          {onDismiss && (
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              style={({ pressed }) => [
                styles.dismissBtn,
                {
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)",
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons name="close" size={16} color={isDark ? "#9ca3af" : "#6b7280"} />
            </Pressable>
          )}
        </View>

        {/* Card Body / Update Info */}
        <Text style={[styles.cardMessage, { color: isDark ? "#94a3b8" : "#4b5563" }]}>
          {isDownloaded
            ? "The APK package is already downloaded on your device. Tap below to reinstall or update directly without leaving the app!"
            : versionInfo.update_message ||
              "Get the latest enhancements, faster performance, and new collaboration tools for your campus."}
        </Text>

        {/* Spec Chips / Metadata Highlights */}
        <View style={styles.specsRow}>
          <View style={[styles.specChip, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff" }]}>
            <MaterialCommunityIcons name="package-variant-closed" size={14} color="#10b981" />
            <Text style={[styles.specChipText, { color: isDark ? "#cbd5e1" : "#334155" }]}>
              {displayFileSize} APK
            </Text>
          </View>

          <View style={[styles.specChip, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff" }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={14} color="#10b981" />
            <Text style={[styles.specChipText, { color: isDark ? "#cbd5e1" : "#334155" }]}>
              Verified & Safe
            </Text>
          </View>

          <View style={[styles.specChip, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff" }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={14} color="#f59e0b" />
            <Text style={[styles.specChipText, { color: isDark ? "#cbd5e1" : "#334155" }]}>
              In-App Install
            </Text>
          </View>
        </View>

        {/* Live In-App Download Progress Bar */}
        {isDownloading && (
          <View style={styles.progressSection}>
            <View style={styles.progressLabelsRow}>
              <Text style={[styles.progressStatusText, { color: isDark ? "#93c5fd" : "#1d4ed8" }]}>
                {downloadedBytes > 0 && totalBytes > 0
                  ? `Downloading: ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                  : "Downloading update..."}
              </Text>
              <Text style={[styles.progressPercentText, { color: isDark ? "#ffffff" : "#1e3a8a" }]}>
                {percentLabel}
              </Text>
            </View>

            <View style={[styles.progressBarTrack, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0" }]}>
              <LinearGradient
                colors={["#3b82f6", "#10b981"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${Math.max(downloadProgress * 100, 3)}%` }]}
              />
            </View>
          </View>
        )}

        {/* Status / Alert Message */}
        {statusMessage && !isDownloading && (
          <View style={[styles.statusMessageBox, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#ecfdf5" }]}>
            <MaterialCommunityIcons name="information-outline" size={14} color="#10b981" />
            <Text style={[styles.statusMessageText, { color: isDark ? "#a7f3d0" : "#065f46" }]}>
              {statusMessage}
            </Text>
          </View>
        )}

        {/* Collapsible Highlights Preview */}
        {!compact && !isDownloading && (
          <View style={styles.changelogSection}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                setShowChangelog(!showChangelog);
              }}
              style={styles.changelogToggle}
            >
              <Text style={[styles.changelogToggleText, { color: isDark ? "#34d399" : "#059669" }]}>
                {showChangelog ? "Hide What's New" : "What's New in this Version"}
              </Text>
              <MaterialCommunityIcons
                name={showChangelog ? "chevron-up" : "chevron-down"}
                size={16}
                color={isDark ? "#34d399" : "#059669"}
              />
            </Pressable>

            {showChangelog && (
              <View style={[styles.changelogList, { backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.7)" }]}>
                {releaseNotes.slice(0, 4).map((note, index) => (
                  <View key={index} style={styles.changelogItem}>
                    <MaterialCommunityIcons name="check-circle" size={14} color="#10b981" style={{ marginTop: 2 }} />
                    <Text style={[styles.changelogText, { color: isDark ? "#cbd5e1" : "#374151" }]}>
                      {note}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Primary CTA: WONDERFUL CARD BUTTON */}
        <View style={styles.actionsContainer}>
          <Pressable
            onPress={handlePrimaryPress}
            disabled={isDownloading}
            style={({ pressed }) => [
              styles.downloadButtonWrapper,
              {
                transform: [{ scale: pressed && !isDownloading ? 0.98 : 1 }],
                shadowOpacity: pressed ? 0.2 : 0.45,
                opacity: isDownloading ? 0.9 : 1,
              },
            ]}
          >
            <LinearGradient
              colors={
                isDownloaded
                  ? ["#059669", "#047857", "#065f46"]
                  : isDownloading
                  ? ["#3b82f6", "#2563eb", "#1d4ed8"]
                  : ["#10b981", "#059669", "#047857"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.downloadButtonGradient}
            >
              <View style={styles.downloadIconCircle}>
                {isDownloading ? (
                  <ActivityIndicator size={16} color="#2563eb" />
                ) : (
                  <MaterialCommunityIcons
                    name={isDownloaded ? "rocket-launch" : "download"}
                    size={18}
                    color={isDownloaded ? "#047857" : "#059669"}
                  />
                )}
              </View>

              <View style={styles.downloadTextContainer}>
                <Text style={styles.downloadButtonMainText}>
                  {isDownloading
                    ? `Downloading APK... ${percentLabel}`
                    : isDownloaded
                    ? "Reinstall SkillBridge Now"
                    : "Download & Install Update"}
                </Text>
                <Text style={styles.downloadButtonSubText}>
                  {isDownloading
                    ? "Downloading inside app • Please keep app open"
                    : isDownloaded
                    ? `APK ready on phone • 1-Tap Package Installer`
                    : `Direct APK • ${displayFileSize} • 1-Tap In-App Setup`}
                </Text>
              </View>

              <MaterialCommunityIcons
                name={isDownloaded ? "arrow-right-bold-circle" : isDownloading ? "loading" : "arrow-right"}
                size={22}
                color="#ffffff"
                style={styles.arrowIcon}
              />
            </LinearGradient>
          </Pressable>

          {/* Secondary Actions Row */}
          <View style={styles.secondaryActionsRow}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                setShowModal(true);
              }}
              style={styles.detailsBtn}
            >
              <MaterialCommunityIcons name="text-box-search-outline" size={15} color={isDark ? "#94a3b8" : "#64748b"} />
              <Text style={[styles.detailsBtnText, { color: isDark ? "#94a3b8" : "#64748b" }]}>
                Full Release Notes
              </Text>
            </Pressable>

            {isDownloaded && !isDownloading && (
              <Pressable onPress={handleRedownload} style={styles.redownloadBtn}>
                <MaterialCommunityIcons name="refresh" size={14} color={isDark ? "#34d399" : "#059669"} />
                <Text style={[styles.redownloadText, { color: isDark ? "#34d399" : "#059669" }]}>
                  Re-download APK
                </Text>
              </Pressable>
            )}

            {onDismiss && (
              <Pressable onPress={onDismiss} style={styles.laterBtn}>
                <Text style={[styles.laterBtnText, { color: isDark ? "#64748b" : "#94a3b8" }]}>
                  Remind Later
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Full Release Notes Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? "#0f172a" : "#ffffff",
                borderColor: isDark ? "#1e293b" : "#e2e8f0",
              },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <LinearGradient
                colors={["#10b981", "#059669"]}
                style={styles.modalIcon}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="rocket-launch" size={24} color="#ffffff" />
              </LinearGradient>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.modalTitle, { color: isDark ? "#ffffff" : "#0f172a" }]}>
                  {versionInfo.update_title || `SkillBridge v${versionInfo.version}`}
                </Text>
                <Text style={[styles.modalSubtitle, { color: isDark ? "#94a3b8" : "#64748b" }]}>
                  Current: v{localVersion} → New: v{versionInfo.version}
                </Text>
              </View>

              <Pressable
                onPress={() => setShowModal(false)}
                style={[styles.modalCloseBtn, { backgroundColor: isDark ? "#1e293b" : "#f1f5f9" }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={isDark ? "#94a3b8" : "#64748b"} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalDescription, { color: isDark ? "#cbd5e1" : "#334155" }]}>
                {versionInfo.update_message ||
                  "A major new update is ready for download. Here are the highlights of what was improved in this build:"}
              </Text>

              {/* Release Notes List */}
              <View style={[styles.modalNotesBox, { backgroundColor: isDark ? "#1e293b" : "#f8fafc" }]}>
                <Text style={[styles.modalNotesTitle, { color: isDark ? "#34d399" : "#059669" }]}>
                  Highlights & Changelog
                </Text>
                {releaseNotes.map((note, idx) => (
                  <View key={idx} style={styles.modalNoteItem}>
                    <MaterialCommunityIcons name="check-decagram" size={16} color="#10b981" style={{ marginTop: 2 }} />
                    <Text style={[styles.modalNoteText, { color: isDark ? "#e2e8f0" : "#1e293b" }]}>
                      {note}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Build Metadata Box */}
              <View style={[styles.metaBox, { borderColor: isDark ? "#334155" : "#e2e8f0" }]}>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: isDark ? "#94a3b8" : "#64748b" }]}>File:</Text>
                  <Text style={[styles.metaValue, { color: isDark ? "#e2e8f0" : "#1e293b" }]}>
                    {apkFileName} ({displayFileSize})
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: isDark ? "#94a3b8" : "#64748b" }]}>Target:</Text>
                  <Text style={[styles.metaValue, { color: isDark ? "#e2e8f0" : "#1e293b" }]}>
                    {versionInfo.apk?.min_android_version || "Android 8.0+ (ARM64, x86_64)"}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: isDark ? "#94a3b8" : "#64748b" }]}>In-App Install:</Text>
                  <Text style={[styles.metaValue, { color: isDark ? "#34d399" : "#059669" }]}>
                    {isDownloaded ? "Cached & Ready" : "Supported"}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => {
                  setShowModal(false);
                  handlePrimaryPress();
                }}
                style={styles.modalDownloadCTA}
              >
                <LinearGradient
                  colors={isDownloaded ? ["#059669", "#047857"] : ["#10b981", "#059669"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalDownloadGradient}
                >
                  <MaterialCommunityIcons
                    name={isDownloaded ? "rocket-launch" : "download"}
                    size={20}
                    color="#ffffff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.modalDownloadBtnText}>
                    {isDownloaded ? "Reinstall APK Now" : "Download & Install Now"}
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable onPress={() => setShowModal(false)} style={styles.modalDismissCTA}>
                <Text style={[styles.modalDismissText, { color: isDark ? "#94a3b8" : "#64748b" }]}>
                  Dismiss
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    zIndex: 9999,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    overflow: "hidden",
    position: "relative",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
  cardGradient: {
    ...StyleSheet.absoluteFill,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  headerTextGroup: {
    marginLeft: 12,
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 5,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  versionPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  versionPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMessage: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  specsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  specChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  specChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  progressSection: {
    marginBottom: 12,
    gap: 6,
  },
  progressLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: "800",
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  statusMessageBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    marginBottom: 10,
  },
  statusMessageText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  changelogSection: {
    marginBottom: 12,
  },
  changelogToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
  },
  changelogToggleText: {
    fontSize: 12,
    fontWeight: "700",
  },
  changelogList: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    gap: 6,
  },
  changelogItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  changelogText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  actionsContainer: {
    gap: 8,
  },
  downloadButtonWrapper: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  downloadButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  downloadIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  downloadTextContainer: {
    flex: 1,
  },
  downloadButtonMainText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  downloadButtonSubText: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  arrowIcon: {
    marginLeft: 6,
  },
  secondaryActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    flexWrap: "wrap",
    gap: 8,
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  redownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  redownloadText: {
    fontSize: 12,
    fontWeight: "700",
  },
  laterBtn: {
    paddingVertical: 4,
  },
  laterBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    marginBottom: 16,
  },
  modalDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  modalNotesBox: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    gap: 8,
  },
  modalNotesTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  modalNoteItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  modalNoteText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  metaBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  metaValue: {
    fontSize: 11,
    fontWeight: "700",
  },
  modalFooter: {
    gap: 8,
  },
  modalDownloadCTA: {
    borderRadius: 14,
    overflow: "hidden",
  },
  modalDownloadGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  modalDownloadBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  modalDismissCTA: {
    alignItems: "center",
    paddingVertical: 8,
  },
  modalDismissText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
