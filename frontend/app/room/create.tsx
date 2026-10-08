import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import type { Profile, Room } from "@/types";
import { Button, Card, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import MapPicker from "@/components/MapPicker";
import { optimizeImageForUpload } from "@/lib/imageOptimizer";
import { ROOM_COVER_PRESETS } from "@/features/room/roomCovers";

// Mirrors backend env MAX_ROOM_CAPACITY (default 250) so validation never mismatches.
const MAX_ROOM_CAPACITY = 250;
const CAPACITY_PRESETS = [10, 30, 50, 100];

// Discord Activities / Telegram Channel style presets (Theme-driven color keys)
const ACTIVITY_PRESETS = [
  {
    id: "voice_lounge",
    name: "Voice Lounge",
    icon: "headset",
    colorKey: "primary",
    defaultTopic: "Open Audio Discussion & Study",
    tags: ["voice", "casual", "study"],
    desc: "Discord-style open voice room for relaxed studying and group discussions.",
  },
  {
    id: "coding_lab",
    name: "Coding Lab",
    icon: "code-tags",
    colorKey: "success",
    defaultTopic: "Software Dev & Algorithms",
    tags: ["programming", "projects", "leetcode"],
    desc: "Collaborative programming, pair debugging, and project building.",
  },
  {
    id: "pomodoro",
    name: "Silent Focus",
    icon: "timer-sand",
    colorKey: "warning",
    defaultTopic: "Deep Work & Pomodoro",
    tags: ["focus", "pomodoro", "silent"],
    desc: "Quiet study session with synchronized 25/5 min focus intervals.",
  },
  {
    id: "channel",
    name: "Telegram Channel",
    icon: "bullhorn-outline",
    colorKey: "info",
    defaultTopic: "Campus Notes & Announcements",
    tags: ["channel", "resources", "broadcast"],
    desc: "Broadcast-style space to share lecture summaries, PDFs and announcements.",
  },
  {
    id: "exam_prep",
    name: "Exam Arena",
    icon: "trophy-outline",
    colorKey: "accent",
    defaultTopic: "Final Exam Problem Solving",
    tags: ["exam", "revision", "practice"],
    desc: "High-intensity past papers, quick questions, and peer problem-solving.",
  },
] as const;

const ROOM_ICONS = [
  "book-open-page-variant",
  "laptop",
  "code-tags",
  "headset",
  "bullhorn-outline",
  "calculator",
  "flask-outline",
  "lightbulb-on-outline",
  "rocket-launch-outline",
  "timer-sand",
  "account-group-outline",
  "gamepad-variant-outline",
];

export default function CreateRoomScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [selectedPreset, setSelectedPreset] = useState<string>("voice_lounge");
  const [selectedIcon, setSelectedIcon] = useState<string>("headset");
  const [coverImageUrl, setCoverImageUrl] = useState<string>("");
  const [storageProvider, setStorageProvider] = useState<string>("");
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("Open Audio Discussion & Study");
  const [description, setDescription] = useState("");
  const [rules] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(["voice", "study"]);
  const [visibility, setVisibility] = useState<"public" | "private" | "invite_only">("public");
  const [capacity, setCapacity] = useState("30");
  const [mode, setMode] = useState<"online" | "offline" | "hybrid">("online");
  const [campusLocation, setCampusLocation] = useState("");
  const [selectedInviteUsernames, setSelectedInviteUsernames] = useState<string[]>([]);
  const [customUsername, setCustomUsername] = useState("");

  const getPresetColor = (colorKey: string) => {
    return (colors as any)[colorKey] || colors.primary;
  };

  // Real-time Cloudflare R2 Cover Photo Upload
  const handlePickCover = async (source: "gallery" | "camera") => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Permission Required", "Camera access is needed to capture a room cover photo.");
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Permission Required", "Photo library access is needed to upload a room cover photo.");
          return;
        }
      }

      const pickerFn =
        source === "camera"
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync;

      const result = await pickerFn({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setIsUploadingCover(true);
      setUploadProgressMsg("Optimizing cover photo...");

      const originalName = asset.fileName || `cover_${Date.now()}.jpg`;
      const optimized = await optimizeImageForUpload(
        asset.uri,
        {
          maxWidth: 1280,
          maxHeight: 720,
          quality: 0.82,
          format: "jpeg",
          base64: true,
        },
        originalName,
      );

      let fileBase64 = optimized.base64 || asset.base64;

      // Resilient fallback for base64
      if (!fileBase64 && asset.uri) {
        try {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.replace(/^data:[^;]+;base64,/, ""));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (readErr) {
          console.warn("[createRoom] Base64 fallback failed", readErr);
        }
      }

      if (!fileBase64) {
        throw new Error("Could not process image file data.");
      }

      setUploadProgressMsg("Uploading to Cloudflare R2...");

      const uploadRes = await api<{
        url: string;
        mediaObjectId?: string | null;
        provider?: string;
        fileSizeBytes?: number;
      }>("/rooms/cover/upload", {
        method: "POST",
        body: JSON.stringify({
          fileBase64,
          contentType: optimized.mimeType || "image/jpeg",
          fileName: optimized.fileName || originalName,
        }),
      });

      if (!uploadRes?.url) {
        throw new Error("No URL returned from Cloudflare R2 storage.");
      }

      setCoverImageUrl(uploadRes.url);
      setStorageProvider(uploadRes.provider || "r2");
      triggerHaptic("notificationSuccess");
    } catch (err: any) {
      Alert.alert("Cover Upload Failed", err.message || "Failed to upload to Cloudflare R2 storage.");
    } finally {
      setIsUploadingCover(false);
      setUploadProgressMsg("");
    }
  };

  const handleSelectPresetCover = (url: string) => {
    triggerHaptic("selection");
    setCoverImageUrl(url);
    setStorageProvider("preset");
  };

  const handleRemoveCover = () => {
    triggerHaptic("selection");
    setCoverImageUrl("");
    setStorageProvider("");
  };

  // Fetch connections for interactive invite system
  const { data: connectionsData } = useQuery<{
    connections: Profile[];
  }>({
    queryKey: ["connections"],
    queryFn: () => api("/connections"),
  });

  const connections = connectionsData?.connections ?? [];

  const handleSelectPreset = (preset: typeof ACTIVITY_PRESETS[number]) => {
    triggerHaptic("selection");
    setSelectedPreset(preset.id);
    setSelectedIcon(preset.icon);
    setTopic(preset.defaultTopic);
    setDescription(preset.desc);
    setTags([...preset.tags]);
  };

  const toggleInviteUser = (username: string) => {
    triggerHaptic("selection");
    if (selectedInviteUsernames.includes(username)) {
      setSelectedInviteUsernames(selectedInviteUsernames.filter((u) => u !== username));
    } else {
      setSelectedInviteUsernames([...selectedInviteUsernames, username]);
    }
  };

  const addCustomInvite = () => {
    const clean = customUsername.trim().replace(/^@/, "").toLowerCase();
    if (clean && !selectedInviteUsernames.includes(clean)) {
      triggerHaptic("selection");
      setSelectedInviteUsernames([...selectedInviteUsernames, clean]);
      setCustomUsername("");
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const capNumber = parseInt(capacity, 10);
      // Backend enforces MAX_ROOM_CAPACITY (default 250) — keep the client in sync
      // so users never submit a value the API will reject.
      if (isNaN(capNumber) || capNumber < 2 || capNumber > MAX_ROOM_CAPACITY) {
        throw new Error(`Capacity must be between 2 and ${MAX_ROOM_CAPACITY}.`);
      }

      if ((mode === "offline" || mode === "hybrid") && !campusLocation.trim()) {
        throw new Error("Campus location is required for in-person or hybrid spaces.");
      }

      const payload = {
        title: title.trim(),
        topic: topic.trim(),
        description: description.trim(),
        rules: rules.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        visibility,
        capacity: capNumber,
        mode,
        campus_location: mode !== "online" ? campusLocation.trim() : undefined,
        cover_image_url: coverImageUrl.trim() ? coverImageUrl.trim() : undefined,
      };

      const res = await api<Room>("/rooms", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Send invitations to picked peers
      if (selectedInviteUsernames.length > 0 && res?.id) {
        for (const username of selectedInviteUsernames) {
          try {
            await api(`/rooms/${res.id}/invitations`, {
              method: "POST",
              body: JSON.stringify({ username }),
            });
          } catch {
            // non-fatal
          }
        }
      }

      return res;
    },
    onSuccess: (newRoom) => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["rooms"] });
      Alert.alert("Space Created!", `"${newRoom.title}" is live and ready for your peers.`, [
        {
          text: "Enter Space",
          onPress: () => router.replace(`/room/${newRoom.id}` as any),
        },
      ]);
    },
    onError: (err: any) => {
      Alert.alert("Could Not Create Room", err.message || "An unexpected error occurred.");
    },
  });

  const handleSubmit = () => {
    if (title.trim().length < 3) {
      Alert.alert("Title Too Short", "Please give your room a title with at least 3 characters.");
      return;
    }
    if (topic.trim().length < 2) {
      Alert.alert("Topic Required", "Please specify a subject or study focus.");
      return;
    }
    if ((mode === "offline" || mode === "hybrid") && !campusLocation.trim()) {
      Alert.alert("Location Required", "Please specify where on campus this room will meet.");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          s.scrollContent,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom + 20, 36),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Row style={s.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: colors.text }]}>Start Study Space</Text>
            <Muted style={{ fontSize: 11 }}>Discord Activities & Telegram-style channels</Muted>
          </View>
        </Row>

        {/* 1. Discord-Style Activity Presets */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Choose Space Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetsScroll}>
            {ACTIVITY_PRESETS.map((preset) => {
              const isSel = selectedPreset === preset.id;
              const presetColor = getPresetColor(preset.colorKey);
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => handleSelectPreset(preset)}
                  style={[
                    s.presetCard,
                    {
                      backgroundColor: isSel ? colors.primarySoft : colors.surface,
                      borderColor: isSel ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={[s.presetIconBox, { backgroundColor: isSel ? colors.primarySoft : colors.surface2 }]}>
                    <MaterialCommunityIcons name={preset.icon as any} size={24} color={presetColor} />
                  </View>
                  <Text style={[s.presetName, { color: isSel ? colors.primary : colors.text }]}>
                    {preset.name}
                  </Text>
                  <Text style={[s.presetDesc, { color: colors.muted }]} numberOfLines={2}>
                    {preset.desc}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 2. Room Cover Photo Card (Cloudflare R2 Direct Upload & Presets) */}
        <Card style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="image-outline" size={18} color={colors.primary} />
              <Text style={[s.cardHeading, { color: colors.text, marginBottom: 0 }]}>
                Room Cover Photo
              </Text>
            </Row>
            {coverImageUrl ? (
              <Pill tone={storageProvider === "r2" ? "success" : "primary"}>
                {storageProvider === "r2" ? "Cloudflare R2" : storageProvider === "preset" ? "Theme Preset" : "Selected"}
              </Pill>
            ) : null}
          </Row>
          <Muted style={{ fontSize: 11, marginBottom: 12 }}>
            16:9 banner stored in Cloudflare R2 in real time, displayed on campus cards.
          </Muted>

          {isUploadingCover ? (
            <View style={[s.uploadingBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[s.uploadingText, { color: colors.text }]}>{uploadProgressMsg}</Text>
              <Muted style={{ fontSize: 11 }}>Synchronizing with Cloudflare R2 storage bucket...</Muted>
            </View>
          ) : coverImageUrl ? (
            <View style={s.coverPreviewContainer}>
              {/* 16:9 Live Preview Banner (mimics live feed card) */}
              <View style={[s.coverPreviewCard, { borderColor: colors.border }]}>
                <Image source={{ uri: coverImageUrl }} style={s.coverPreviewImage} resizeMode="cover" />
                <LinearGradient
                  colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.85)"]}
                  style={s.coverGradient}
                />
                {/* Top overlay badges */}
                <View style={s.previewTopBar}>
                  <View style={[s.previewBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                    <Text style={[s.previewBadgeText, { color: colors.white }]}>
                      {mode === "online" ? "🌐 Online" : mode === "offline" ? "📍 Campus" : "⚡ Hybrid"}
                    </Text>
                  </View>
                  <View style={[s.previewBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[s.previewBadgeText, { color: colors.white }]}>
                      {storageProvider === "r2" ? "☁️ R2 Synced" : "Live Preview"}
                    </Text>
                  </View>
                </View>
                {/* Bottom title & topic overlay */}
                <View style={s.previewBottomBar}>
                  <Text style={[s.previewTitle, { color: colors.white }]} numberOfLines={1}>
                    {title.trim() || "Your Space Name"}
                  </Text>
                  <Text style={[s.previewTopic, { color: colors.white }]} numberOfLines={1}>
                    #{topic.trim() || "Study Focus"}
                  </Text>
                </View>
              </View>

              {/* Action buttons below preview */}
              <Row style={{ gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={() => handlePickCover("gallery")}
                  style={[s.coverActionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name="image-edit-outline" size={16} color={colors.text} />
                  <Text style={[s.coverActionText, { color: colors.text }]}>Change (Gallery)</Text>
                </Pressable>
                <Pressable
                  onPress={() => handlePickCover("camera")}
                  style={[s.coverActionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name="camera-outline" size={16} color={colors.text} />
                  <Text style={[s.coverActionText, { color: colors.text }]}>Take Photo</Text>
                </Pressable>
                <Pressable
                  onPress={handleRemoveCover}
                  style={[s.coverActionBtn, { backgroundColor: colors.background, borderColor: colors.danger }]}
                >
                  <MaterialCommunityIcons name="delete-outline" size={16} color={colors.danger} />
                  <Text style={[s.coverActionText, { color: colors.danger }]}>Remove</Text>
                </Pressable>
              </Row>
            </View>
          ) : (
            <View>
              {/* Upload Drop Zone */}
              <View style={[s.uploadDropBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={[s.uploadIconCircle, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="cloud-upload-outline" size={26} color={colors.primary} />
                </View>
                <Text style={[s.uploadDropTitle, { color: colors.text }]}>
                  Upload Custom Cover Photo
                </Text>
                <Muted style={{ fontSize: 11, textAlign: "center", marginBottom: 12 }}>
                  PNG, JPG, or WebP up to 10MB • Automatically optimized for 16:9
                </Muted>

                <Row style={{ gap: 10, width: "100%" }}>
                  <Pressable
                    onPress={() => handlePickCover("gallery")}
                    style={[s.uploadChoiceBtn, { flex: 1, backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                  >
                    <MaterialCommunityIcons name="image-outline" size={18} color={colors.primary} />
                    <Text style={[s.uploadChoiceText, { color: colors.primary }]}>From Gallery</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handlePickCover("camera")}
                    style={[s.uploadChoiceBtn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="camera-outline" size={18} color={colors.text} />
                    <Text style={[s.uploadChoiceText, { color: colors.text }]}>Take Photo</Text>
                  </Pressable>
                </Row>
              </View>

              {/* Or Select from Study Cover Presets */}
              <View style={{ marginTop: 12 }}>
                <Text style={[s.presetSectionLabel, { color: colors.muted }]}>
                  Or select a curated study theme:
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  {ROOM_COVER_PRESETS.map((preset) => {
                    const isSelected = coverImageUrl === preset.url;
                    return (
                      <Pressable
                        key={preset.id}
                        onPress={() => handleSelectPresetCover(preset.url)}
                        style={[
                          s.coverPresetThumbCard,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            borderWidth: isSelected ? 2 : 1,
                          },
                        ]}
                      >
                        <Image source={{ uri: preset.url }} style={s.coverPresetThumbImg} resizeMode="cover" />
                        <View style={[s.coverPresetOverlay, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
                          <Text style={[s.coverPresetName, { color: colors.white }]} numberOfLines={1}>
                            {preset.name}
                          </Text>
                          {isSelected && (
                            <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}
        </Card>

        {/* 2. Custom Icon Picker */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Space Icon</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.iconsScroll}>
            {ROOM_ICONS.map((iconName) => {
              const isSel = selectedIcon === iconName;
              return (
                <Pressable
                  key={iconName}
                  onPress={() => {
                    triggerHaptic("selection");
                    setSelectedIcon(iconName);
                  }}
                  style={[
                    s.iconSelectBtn,
                    {
                      backgroundColor: isSel ? colors.primary : colors.surface,
                      borderColor: isSel ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={iconName as any}
                    size={20}
                    color={isSel ? colors.white : colors.text}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 3. Space Details Card */}
        <Card style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.cardHeading, { color: colors.text }]}>Space Details</Text>

          <View style={s.fieldWrapper}>
            <Text style={[s.label, { color: colors.text }]}>Space Name *</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Distributed Systems Lab or CS201 Jam"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
          </View>

          <View style={s.fieldWrapper}>
            <Text style={[s.label, { color: colors.text }]}>Subject / Focus *</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Algorithms, Calculus, Machine Learning"
              placeholderTextColor={colors.muted}
              value={topic}
              onChangeText={setTopic}
              maxLength={60}
            />
          </View>

          <View style={s.fieldWrapper}>
            <Text style={[s.label, { color: colors.text }]}>Description</Text>
            <TextInput
              style={[s.input, s.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="What will members explore or work on in this room?"
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
              maxLength={400}
            />
          </View>

          {/* Tags */}
          <View style={s.fieldWrapper}>
            <Text style={[s.label, { color: colors.text }]}>Tags</Text>
            <Row style={{ gap: 8 }}>
              <TextInput
                style={[s.input, { flex: 1, backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Add tag (e.g. python, finals)"
                placeholderTextColor={colors.muted}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={addTag}
              />
              <Button title="Add" onPress={addTag} variant="secondary" compact />
            </Row>
            {tags.length > 0 && (
              <Row style={s.tagsContainer}>
                {tags.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => removeTag(t)}
                    style={[s.tagPill, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>#{t}</Text>
                    <MaterialCommunityIcons name="close" size={12} color={colors.primary} style={{ marginLeft: 3 }} />
                  </Pressable>
                ))}
              </Row>
            )}
          </View>
        </Card>

        {/* 4. Format & Delivery Mode */}
        <Card style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.cardHeading, { color: colors.text }]}>Format & Visibility</Text>

          <View style={s.fieldWrapper}>
            <Text style={[s.label, { color: colors.text }]}>Delivery Mode</Text>
            <Row style={{ gap: 8 }}>
              {(["online", "offline", "hybrid"] as const).map((m) => {
                const isSel = mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      triggerHaptic("selection");
                      setMode(m);
                    }}
                    style={[
                      s.optionBtn,
                      {
                        flex: 1,
                        backgroundColor: isSel ? colors.primarySoft : colors.background,
                        borderColor: isSel ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={m === "online" ? "video-outline" : m === "offline" ? "map-marker-outline" : "transit-connection-variant"}
                      size={18}
                      color={isSel ? colors.primary : colors.muted}
                    />
                    <Text style={[s.optionText, { color: isSel ? colors.primary : colors.text }]}>
                      {m.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </View>

          {(mode === "offline" || mode === "hybrid") && (
            <View style={s.fieldWrapper}>
              <Text style={[s.label, { color: colors.text }]}>Campus Meeting Point *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. Science Library 3rd Floor Lab"
                placeholderTextColor={colors.muted}
                value={campusLocation}
                onChangeText={setCampusLocation}
              />
              <MapPicker onLocationSelect={(loc) => setCampusLocation(loc)} />
            </View>
          )}

          <View style={s.fieldWrapper}>
            <Text style={[s.label, { color: colors.text }]}>Room Visibility</Text>
            <Row style={{ gap: 8 }}>
              {(["public", "private", "invite_only"] as const).map((v) => {
                const isSel = visibility === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => {
                      triggerHaptic("selection");
                      setVisibility(v);
                    }}
                    style={[
                      s.optionBtn,
                      {
                        flex: 1,
                        backgroundColor: isSel ? colors.primarySoft : colors.background,
                        borderColor: isSel ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={v === "public" ? "earth" : v === "private" ? "lock-outline" : "email-lock-outline"}
                      size={18}
                      color={isSel ? colors.primary : colors.muted}
                    />
                    <Text style={[s.optionText, { color: isSel ? colors.primary : colors.text }]}>
                      {v === "public" ? "Public" : v === "private" ? "Private" : "Invites"}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </View>

          <View style={s.fieldWrapper}>
            <Text style={[s.label, { color: colors.text }]}>Capacity Limit</Text>
            <Row style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <TextInput
                style={[s.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border, maxWidth: 120 }]}
                value={capacity}
                onChangeText={(v) => setCapacity(v.replace(/[^0-9]/g, "").slice(0, 3))}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="30"
                placeholderTextColor={colors.muted}
              />
              {CAPACITY_PRESETS.map((n) => {
                const active = capacity === String(n);
                return (
                  <Pressable
                    key={n}
                    onPress={() => {
                      triggerHaptic("selection");
                      setCapacity(String(n));
                    }}
                    style={[
                      s.capChip,
                      {
                        backgroundColor: active ? colors.primary : colors.background,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: active ? colors.white : colors.textSecondary,
                      }}
                    >
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
            <Text style={[s.hint, { color: colors.muted }]}>
              Between 2 and {MAX_ROOM_CAPACITY} members.
            </Text>
          </View>
        </Card>

        {/* 5. Peer Invite System (Telegram / Discord Style) */}
        <Card style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="account-plus-outline" size={18} color={colors.primary} />
              <Text style={[s.cardHeading, { color: colors.text, marginBottom: 0 }]}>
                Invite Friends & Peers
              </Text>
            </Row>
            {selectedInviteUsernames.length > 0 && (
              <Pill tone="primary">{selectedInviteUsernames.length} selected</Pill>
            )}
          </Row>
          <Muted style={{ fontSize: 11, marginBottom: 10 }}>
            Pick from your network to invite them instantly upon launch.
          </Muted>

          {/* Quick peer selection chips */}
          {connections.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {connections.map((peer) => {
                const username = peer.username || peer.id;
                const isSelected = selectedInviteUsernames.includes(username);
                return (
                  <Pressable
                    key={peer.id}
                    onPress={() => toggleInviteUser(username)}
                    style={[
                      s.peerChip,
                      {
                        backgroundColor: isSelected ? colors.primarySoft : colors.background,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={s.peerAvatar}>
                      {peer.avatar_url ? (
                        <Image source={{ uri: peer.avatar_url }} style={s.peerAvatarImg} />
                      ) : (
                        <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>
                          {peer.full_name?.[0] || "U"}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                      {peer.full_name?.split(" ")[0]}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={14} color={colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Muted style={{ fontSize: 11, fontStyle: "italic", marginBottom: 8 }}>
              No connected peers yet. You can invite anyone by typing their username below.
            </Muted>
          )}

          {/* Add custom username */}
          <Row style={{ gap: 8, marginTop: 10 }}>
            <TextInput
              style={[s.input, { flex: 1, backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="Invite by username (e.g. sam12)"
              placeholderTextColor={colors.muted}
              value={customUsername}
              onChangeText={setCustomUsername}
              autoCapitalize="none"
              onSubmitEditing={addCustomInvite}
            />
            <Button title="Add" onPress={addCustomInvite} variant="secondary" compact />
          </Row>

          {/* Selected usernames tag view */}
          {selectedInviteUsernames.length > 0 && (
            <Row style={s.tagsContainer}>
              {selectedInviteUsernames.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => toggleInviteUser(u)}
                  style={[s.tagPill, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>@{u}</Text>
                  <MaterialCommunityIcons name="close" size={12} color={colors.primary} style={{ marginLeft: 3 }} />
                </Pressable>
              ))}
            </Row>
          )}
        </Card>

        {/* Submit Button */}
        <View style={s.submitContainer}>
          <Button
            title={createMutation.isPending ? "Launching Space..." : "🚀 Launch Study Space"}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerRow: {
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  presetsScroll: {
    gap: 10,
    paddingVertical: 2,
  },
  presetCard: {
    width: 140,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
  },
  presetIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  presetName: {
    fontSize: 13,
    fontWeight: "800",
  },
  presetDesc: {
    fontSize: 10,
    lineHeight: 14,
  },
  iconsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  iconSelectBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  cardHeading: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 12,
  },
  capChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  hint: {
    fontSize: 11,
    marginTop: 6,
  },
  fieldWrapper: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
  },
  textArea: {
    minHeight: 56,
    textAlignVertical: "top",
  },
  tagsContainer: {
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 11,
    fontWeight: "800",
  },
  peerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  peerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  peerAvatarImg: {
    width: "100%",
    height: "100%",
  },
  submitContainer: {
    marginTop: 8,
    marginBottom: 20,
  },
  uploadingBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: "700",
  },
  coverPreviewContainer: {
    gap: 8,
  },
  coverPreviewCard: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
  },
  coverPreviewImage: {
    width: "100%",
    height: "100%",
  },
  coverGradient: {
    ...StyleSheet.absoluteFill,
  },
  previewTopBar: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  previewBottomBar: {
    position: "absolute",
    bottom: 10,
    left: 12,
    right: 12,
    gap: 2,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  previewTopic: {
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.9,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  coverActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  coverActionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  uploadDropBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  uploadDropTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  uploadChoiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  uploadChoiceText: {
    fontSize: 12,
    fontWeight: "700",
  },
  presetSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
  },
  coverPresetThumbCard: {
    width: 100,
    height: 60,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  coverPresetThumbImg: {
    width: "100%",
    height: "100%",
  },
  coverPresetOverlay: {
    ...StyleSheet.absoluteFill,
    padding: 4,
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  coverPresetName: {
    fontSize: 9,
    fontWeight: "700",
    alignSelf: "flex-start",
  },
});
