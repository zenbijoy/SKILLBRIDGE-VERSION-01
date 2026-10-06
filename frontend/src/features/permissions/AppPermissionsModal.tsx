import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as ImagePicker from "expo-image-picker";
import { useSegments } from "expo-router";
import { radius, useTheme } from "@/theme";
import { Button, triggerHaptic } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePreferencesStore } from "@/state/usePreferencesStore";

type PermissionStatus = {
  notifications: boolean;
  camera: boolean;
  microphone: boolean;
  media: boolean;
};

async function checkMicPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    } catch {
      return false;
    }
  }
  return true;
}

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Access",
          message: "SkillBridge needs microphone access for interactive peer study rooms and live classes.",
          buttonPositive: "Allow",
          buttonNegative: "Deny",
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }
  return true;
}

export function AppPermissionsModal() {
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const segments = useSegments();
  const hasCompletedPermissionsPrompt = usePreferencesStore(
    (state) => state.hasCompletedPermissionsPrompt,
  );
  const setHasCompletedPermissionsPrompt = usePreferencesStore(
    (state) => state.setHasCompletedPermissionsPrompt,
  );

  const [permissions, setPermissions] = useState<PermissionStatus>({
    notifications: false,
    camera: false,
    microphone: false,
    media: false,
  });
  const [requesting, setRequesting] = useState(false);

  // Check which permissions are already granted on mount
  useEffect(() => {
    let isMounted = true;

    async function checkCurrentPermissions() {
      try {
        const notifStatus = await Notifications.getPermissionsAsync();
        const camStatus = await ImagePicker.getCameraPermissionsAsync();
        const micGranted = await checkMicPermission();
        const mediaStatus = await ImagePicker.getMediaLibraryPermissionsAsync();

        if (isMounted) {
          setPermissions({
            notifications: notifStatus.granted,
            camera: camStatus.granted,
            microphone: micGranted,
            media: mediaStatus.granted,
          });
        }
      } catch (err) {
        console.warn("[AppPermissionsModal] Error checking initial permissions:", err);
      }
    }

    if (session && !hasCompletedPermissionsPrompt) {
      checkCurrentPermissions();
    }

    return () => {
      isMounted = false;
    };
  }, [session, hasCompletedPermissionsPrompt]);

  // Only display the modal after successful login (session exists) and NOT inside (auth) screens
  const inAuth = (segments as string[])[0] === "(auth)";
  const shouldShow = Boolean(session) && !inAuth && !hasCompletedPermissionsPrompt;

  const handleRequestSingle = async (type: keyof PermissionStatus) => {
    triggerHaptic();
    try {
      if (type === "notifications") {
        const res = await Notifications.requestPermissionsAsync();
        setPermissions((prev) => ({ ...prev, notifications: res.granted }));
      } else if (type === "camera") {
        const res = await ImagePicker.requestCameraPermissionsAsync();
        setPermissions((prev) => ({ ...prev, camera: res.granted }));
      } else if (type === "microphone") {
        const granted = await requestMicPermission();
        setPermissions((prev) => ({ ...prev, microphone: granted }));
      } else if (type === "media") {
        const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setPermissions((prev) => ({ ...prev, media: res.granted }));
      }
    } catch (err) {
      console.warn(`[AppPermissionsModal] Error requesting ${type}:`, err);
    }
  };

  const handleGrantAll = async () => {
    triggerHaptic();
    setRequesting(true);

    try {
      // 1. Request Notifications
      if (!permissions.notifications) {
        const notifRes = await Notifications.requestPermissionsAsync();
        setPermissions((prev) => ({ ...prev, notifications: notifRes.granted }));
      }

      // 2. Request Camera
      if (!permissions.camera) {
        const camRes = await ImagePicker.requestCameraPermissionsAsync();
        setPermissions((prev) => ({ ...prev, camera: camRes.granted }));
      }

      // 3. Request Microphone
      if (!permissions.microphone) {
        const micGranted = await requestMicPermission();
        setPermissions((prev) => ({ ...prev, microphone: micGranted }));
      }

      // 4. Request Media Library
      if (!permissions.media) {
        const mediaRes = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setPermissions((prev) => ({ ...prev, media: mediaRes.granted }));
      }
    } catch (err) {
      console.warn("[AppPermissionsModal] Error in handleGrantAll:", err);
    } finally {
      setRequesting(false);
      // Give the user a brief moment to see all green checkmarks
      setTimeout(() => {
        setHasCompletedPermissionsPrompt(true);
      }, 400);
    }
  };

  const handleDismiss = () => {
    triggerHaptic();
    setHasCompletedPermissionsPrompt(true);
  };

  if (!shouldShow) return null;

  const allGranted =
    permissions.notifications &&
    permissions.camera &&
    permissions.microphone &&
    permissions.media;

  const items: {
    key: keyof PermissionStatus;
    title: string;
    description: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
  }[] = [
    {
      key: "notifications",
      title: "Push Notifications",
      description: "Live lecture alerts, study room invites, and classmate messages.",
      icon: "bell-ring-outline",
      color: "#3B82F6",
    },
    {
      key: "camera",
      title: "Camera Access",
      description: "Join interactive video classes, study rooms, and scan handwritten notes.",
      icon: "camera-outline",
      color: "#10B981",
    },
    {
      key: "microphone",
      title: "Microphone",
      description: "Speak in live peer discussions, audio study rooms, and ask doubts.",
      icon: "microphone-outline",
      color: "#8B5CF6",
    },
    {
      key: "media",
      title: "Photos & Documents",
      description: "Upload problem set PDFs, lecture slides, and share campus notes.",
      icon: "folder-open-outline",
      color: "#F59E0B",
    },
  ];

  return (
    <Modal visible={shouldShow} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: isDark ? "#0F172A" : "#FFFFFF",
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Image
                source={require("@/../assets/branding/skillbridge-mark.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Enable App Permissions</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              To give you the best interactive peer learning experience, SkillBridge requires the
              following device permissions:
            </Text>
          </View>

          {/* List of Permissions */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={{ gap: 12, paddingVertical: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item) => {
              const isGranted = permissions[item.key];
              return (
                <Pressable
                  key={item.key}
                  onPress={() => !isGranted && handleRequestSingle(item.key)}
                  style={[
                    styles.card,
                    {
                      backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
                      borderColor: isGranted ? "#10B981" : isDark ? "#334155" : "#E2E8F0",
                    },
                  ]}
                >
                  <View style={[styles.iconBox, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#EEF2FF" }]}>
                    <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
                  </View>

                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                    <Text style={[styles.cardDesc, { color: colors.muted }]}>
                      {item.description}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: isGranted
                          ? "rgba(16, 185, 129, 0.15)"
                          : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "#E0E7FF",
                      },
                    ]}
                  >
                    {isGranted ? (
                      <View style={styles.grantedRow}>
                        <MaterialCommunityIcons name="check-circle" size={14} color="#10B981" />
                        <Text style={styles.grantedText}>Allowed</Text>
                      </View>
                    ) : (
                      <Text style={[styles.allowText, { color: colors.primary }]}>Allow</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Actions */}
          <View style={styles.footer}>
            <Button
              title={
                allGranted
                  ? "Continue to SkillBridge 🚀"
                  : requesting
                  ? "Requesting Permissions..."
                  : "Grant All Permissions"
              }
              onPress={allGranted ? handleDismiss : handleGrantAll}
              loading={requesting}
            />

            {!allGranted && (
              <Pressable onPress={handleDismiss} hitSlop={10} style={styles.skipBtn}>
                <Text style={[styles.skipText, { color: colors.muted }]}>Maybe Later</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  container: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "88%",
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    alignItems: "center",
    marginBottom: 14,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  title: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  list: {
    flexGrow: 0,
    maxHeight: 330,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  grantedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  grantedText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#10B981",
  },
  allowText: {
    fontSize: 12,
    fontWeight: "800",
  },
  footer: {
    marginTop: 16,
    gap: 10,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
