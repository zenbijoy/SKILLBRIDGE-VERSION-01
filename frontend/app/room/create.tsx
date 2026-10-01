import React, { useState } from "react";
import {
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
import { api } from "@/lib/api";
import type { Profile, Room } from "@/types";
import { Button, Card, H1, H2, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import MapPicker from "@/components/MapPicker";

// Mirrors backend env MAX_ROOM_CAPACITY (default 250) so validation never mismatches.
const MAX_ROOM_CAPACITY = 250;
const CAPACITY_PRESETS = [10, 30, 50, 100];

// Discord Activities / Telegram Channel style presets
const ACTIVITY_PRESETS = [
  {
    id: "voice_lounge",
    name: "Voice Lounge",
    icon: "headset",
    color: "#6366F1",
    defaultTopic: "Open Audio Discussion & Study",
    tags: ["voice", "casual", "study"],
    desc: "Discord-style open voice room for relaxed studying and group discussions.",
  },
  {
    id: "coding_lab",
    name: "Coding Lab",
    icon: "code-tags",
    color: "#10B981",
    defaultTopic: "Software Dev & Algorithms",
    tags: ["programming", "projects", "leetcode"],
    desc: "Collaborative programming, pair debugging, and project building.",
  },
  {
    id: "pomodoro",
    name: "Silent Focus",
    icon: "timer-sand",
    color: "#F59E0B",
    defaultTopic: "Deep Work & Pomodoro",
    tags: ["focus", "pomodoro", "silent"],
    desc: "Quiet study session with synchronized 25/5 min focus intervals.",
  },
  {
    id: "channel",
    name: "Telegram Channel",
    icon: "bullhorn-outline",
    color: "#0EA5E9",
    defaultTopic: "Campus Notes & Announcements",
    tags: ["channel", "resources", "broadcast"],
    desc: "Broadcast-style space to share lecture summaries, PDFs and announcements.",
  },
  {
    id: "exam_prep",
    name: "Exam Arena",
    icon: "trophy-outline",
    color: "#EC4899",
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
  const { colors, isDark } = useTheme();
  const qc = useQueryClient();

  const [selectedPreset, setSelectedPreset] = useState<string>("voice_lounge");
  const [selectedIcon, setSelectedIcon] = useState<string>("headset");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("Open Audio Discussion & Study");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(["voice", "study"]);
  const [visibility, setVisibility] = useState<"public" | "private" | "invite_only">("public");
  const [capacity, setCapacity] = useState("30");
  const [mode, setMode] = useState<"online" | "offline" | "hybrid">("online");
  const [campusLocation, setCampusLocation] = useState("");
  const [selectedInviteUsernames, setSelectedInviteUsernames] = useState<string[]>([]);
  const [customUsername, setCustomUsername] = useState("");

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
      <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
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
                  <View style={[s.presetIconBox, { backgroundColor: preset.color + "22" }]}>
                    <MaterialCommunityIcons name={preset.icon as any} size={24} color={preset.color} />
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
                    color={isSel ? "#FFFFFF" : colors.text}
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
                        color: active ? "#FFFFFF" : colors.textSecondary,
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
});
