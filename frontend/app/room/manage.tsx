import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Room, RoomInvite, RoomMode } from "@/types";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  H1,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";

type TabMode = "created" | "joined";

const AVAILABLE_MODULES = [
  { key: "posts", label: "Posts & Discussions", icon: "post-outline" },
  { key: "chat", label: "Chat & Channels", icon: "chat-outline" },
  { key: "learn", label: "Learn & Sessions", icon: "school-outline" },
  { key: "media", label: "Media & Playlists", icon: "video-outline" },
  { key: "voice", label: "Voice Lounge", icon: "microphone-outline" },
];

export default function RoomManageScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabMode>("created");

  // Modify Room Settings Modal State
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMode, setFormMode] = useState<RoomMode>("online");
  const [formCampusLocation, setFormCampusLocation] = useState("");
  const [formVisibility, setFormVisibility] = useState<"public" | "private" | "invite_only">("public");
  const [formCapacity, setFormCapacity] = useState(30);
  const [formRules, setFormRules] = useState("");
  const [formModules, setFormModules] = useState<string[]>(["posts", "chat", "learn", "media", "voice"]);
  const [formLandingTab, setFormLandingTab] = useState<string>("posts");

  // Invite Generator Modal State
  const [inviteRoom, setInviteRoom] = useState<Room | null>(null);
  const [roomInvites, setRoomInvites] = useState<RoomInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  // Fetch all my rooms (created + joined)
  const myRoomsQuery = useQuery({
    queryKey: ["my-rooms-manage"],
    queryFn: async () => {
      const res = await api<{ rooms: Room[]; total: number }>("/rooms?mine=true&limit=100");
      const list = res.rooms ?? [];
      const currentUid = user?.id;

      const created = list.filter((r) => r.owner_id === currentUid);
      const joined = list.filter((r) => r.owner_id !== currentUid);
      return { all: list, created, joined };
    },
  });

  // Mutation: Save room settings
  const updateSettingsMutation = useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: any }) =>
      api<{ room: Room }>(`/rooms/${roomId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Settings Updated! 🛠️", "Room settings and permissions have been saved.");
      setEditingRoom(null);
      qc.invalidateQueries({ queryKey: ["my-rooms-manage"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (err: any) => {
      Alert.alert("Update Failed", err.message || "Failed to update room settings");
    },
  });

  // Mutation: Leave room
  const leaveMutation = useMutation({
    mutationFn: (roomId: string) => api(`/rooms/${roomId}/leave`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Left Room", "You have left the study room.");
      qc.invalidateQueries({ queryKey: ["my-rooms-manage"] });
    },
    onError: (err: any) => Alert.alert("Error", err.message),
  });

  const createdList = myRoomsQuery.data?.created ?? [];
  const joinedList = myRoomsQuery.data?.joined ?? [];

  const openSettingsModal = (room: Room) => {
    triggerHaptic();
    setEditingRoom(room);
    setFormTitle(room.title || "");
    setFormTopic(room.topic || "");
    setFormDescription(room.description || "");
    setFormMode(room.mode || "online");
    setFormCampusLocation(room.campus_location || "");
    setFormVisibility(room.visibility || "public");
    setFormCapacity(room.capacity || 30);
    setFormRules(room.rules || "");
    setFormModules(room.enabled_modules || ["posts", "chat", "learn", "media", "voice"]);
    setFormLandingTab(room.default_landing_tab || "posts");
  };

  const handleSaveSettings = () => {
    if (!editingRoom) return;
    if (!formTitle.trim()) {
      Alert.alert("Validation", "Room title is required.");
      return;
    }
    if (!formTopic.trim()) {
      Alert.alert("Validation", "Room topic is required.");
      return;
    }
    if ((formMode === "offline" || formMode === "hybrid") && !formCampusLocation.trim()) {
      Alert.alert("Validation", "Campus location is required for in-person / hybrid rooms.");
      return;
    }

    updateSettingsMutation.mutate({
      roomId: editingRoom.id,
      data: {
        title: formTitle.trim(),
        topic: formTopic.trim(),
        description: formDescription.trim(),
        mode: formMode,
        campus_location: formMode === "online" ? null : formCampusLocation.trim(),
        visibility: formVisibility,
        capacity: formCapacity,
        rules: formRules.trim(),
        enabled_modules: formModules,
        default_landing_tab: formLandingTab,
      },
    });
  };

  const openInviteModal = async (room: Room) => {
    triggerHaptic();
    setInviteRoom(room);
    setLoadingInvites(true);
    try {
      const data = await api<RoomInvite[]>(`/rooms/${room.id}/invites`);
      setRoomInvites(data || []);
    } catch {
      setRoomInvites([]);
    } finally {
      setLoadingInvites(false);
    }
  };

  const handleCreateInviteCode = async () => {
    if (!inviteRoom) return;
    triggerHaptic();
    setGeneratingInvite(true);
    try {
      const res = await api<{ invite: RoomInvite }>(`/rooms/${inviteRoom.id}/invites`, {
        method: "POST",
        body: JSON.stringify({ expiresInHours: 168 }), // 7 days
      });
      if (res.invite) {
        setRoomInvites((prev) => [res.invite, ...prev]);
        Alert.alert("Code Generated! 🎟️", `Share code: ${res.invite.code}`);
      }
    } catch (err: any) {
      Alert.alert("Failed", err.message || "Could not generate invite code");
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleShareInvite = (code: string) => {
    triggerHaptic();
    void Share.share({
      message: `Join our academic study space "${inviteRoom?.title}" on SkillBridge with code: ${code}`,
    });
  };

  return (
    <Screen>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
          <Row style={{ alignItems: "center", gap: 10 }}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
            </Pressable>
            <View>
              <H1 style={{ fontSize: 20 }}>Room Control Center</H1>
              <Muted style={{ fontSize: 12 }}>Modify settings, invites & room controls</Muted>
            </View>
          </Row>

          <Pressable
            onPress={() => {
              triggerHaptic();
              router.push("/room/create" as any);
            }}
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.createBtnText}>Host Room</Text>
          </Pressable>
        </Row>

        {/* Tab Switcher */}
        <View style={[styles.tabTrack, { backgroundColor: colors.surface2 }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("created");
            }}
            style={[
              styles.tabPill,
              activeTab === "created" && [styles.tabPillActive, { backgroundColor: colors.surface }],
            ]}
          >
            <MaterialCommunityIcons
              name="crown"
              size={16}
              color={activeTab === "created" ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "created" ? colors.primary : colors.muted },
                activeTab === "created" && styles.tabTextBold,
              ]}
            >
              Created by Me ({createdList.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("joined");
            }}
            style={[
              styles.tabPill,
              activeTab === "joined" && [styles.tabPillActive, { backgroundColor: colors.surface }],
            ]}
          >
            <MaterialCommunityIcons
              name="door-open"
              size={16}
              color={activeTab === "joined" ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "joined" ? colors.primary : colors.muted },
                activeTab === "joined" && styles.tabTextBold,
              ]}
            >
              Joined Rooms ({joinedList.length})
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={myRoomsQuery.isRefetching}
            onRefresh={() => myRoomsQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {myRoomsQuery.isLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={130} />
            <Skeleton height={130} />
            <Skeleton height={130} />
          </View>
        ) : myRoomsQuery.isError ? (
          <ErrorState detail={(myRoomsQuery.error as Error).message} onRetry={() => myRoomsQuery.refetch()} />
        ) : activeTab === "created" ? (
          createdList.length === 0 ? (
            <Empty
              icon="door-closed-lock"
              title="No Hosted Rooms"
              detail="You haven't created any study rooms or collaboration spaces yet."
              actionTitle="Create a Room"
              onAction={() => router.push("/room/create" as any)}
            />
          ) : (
            <View style={{ gap: 14 }}>
              {createdList.map((room) => (
                <Card key={room.id} style={[styles.roomCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {/* Top Bar */}
                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <Pill tone="primary">HOST</Pill>
                      <Pill tone="default">{(room.mode || "online").toUpperCase()}</Pill>
                      <Pill tone={room.visibility === "private" ? "danger" : "info"}>
                        {(room.visibility || "public").toUpperCase()}
                      </Pill>
                    </Row>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      Capacity: {room.capacity || 30}
                    </Text>
                  </Row>

                  {/* Title & Topic */}
                  <View style={{ gap: 2 }}>
                    <Text style={[styles.roomTitle, { color: colors.text }]}>{room.title}</Text>
                    <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>{room.topic}</Text>
                    {room.description ? (
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={2}>
                        {room.description}
                      </Text>
                    ) : null}
                    {room.campus_location ? (
                      <Row style={{ alignItems: "center", gap: 4, marginTop: 4 }}>
                        <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.muted} />
                        <Text style={{ fontSize: 11, color: colors.muted }}>{room.campus_location}</Text>
                      </Row>
                    ) : null}
                  </View>

                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                  {/* Action Toolbar */}
                  <Row style={{ flexWrap: "wrap", gap: 8 }}>
                    {/* Modify Settings Button */}
                    <Pressable
                      onPress={() => openSettingsModal(room)}
                      style={[styles.actionBtn, { backgroundColor: colors.primarySoft }]}
                    >
                      <MaterialCommunityIcons name="tune" size={15} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>Modify Settings</Text>
                    </Pressable>

                    {/* Invite Code / Link Button */}
                    <Pressable
                      onPress={() => openInviteModal(room)}
                      style={[styles.actionBtn, { backgroundColor: colors.surface2 }]}
                    >
                      <MaterialCommunityIcons name="ticket-outline" size={15} color={colors.text} />
                      <Text style={[styles.actionBtnText, { color: colors.text }]}>Invite Code</Text>
                    </Pressable>

                    {/* Enter Room Button */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        router.push(`/room/${room.id}` as any);
                      }}
                      style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    >
                      <MaterialCommunityIcons name="login-variant" size={15} color="#FFFFFF" />
                      <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>Enter Room</Text>
                    </Pressable>
                  </Row>
                </Card>
              ))}
            </View>
          )
        ) : (
          joinedList.length === 0 ? (
            <Empty
              icon="door-open"
              title="No Joined Rooms"
              detail="You haven't joined any active rooms yet. Discover study sessions and drop in!"
              actionTitle="Discover Rooms"
              onAction={() => router.push("/(tabs)/rooms" as any)}
            />
          ) : (
            <View style={{ gap: 14 }}>
              {joinedList.map((room) => (
                <Card key={room.id} style={[styles.roomCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <Pill tone="default">MEMBER</Pill>
                      <Pill tone="default">{(room.mode || "online").toUpperCase()}</Pill>
                    </Row>
                    <Text style={{ fontSize: 11, color: colors.muted }}>Cap: {room.capacity || 30}</Text>
                  </Row>

                  <View style={{ gap: 2 }}>
                    <Text style={[styles.roomTitle, { color: colors.text }]}>{room.title}</Text>
                    <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>{room.topic}</Text>
                  </View>

                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                  <Row style={{ justifyContent: "flex-end", gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        Alert.alert("Leave Room", `Are you sure you want to leave "${room.title}"?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Leave", style: "destructive", onPress: () => leaveMutation.mutate(room.id) },
                        ]);
                      }}
                      style={[styles.smallBtn, { backgroundColor: `${colors.danger}15` }]}
                    >
                      <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}>Leave</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        router.push(`/room/${room.id}` as any);
                      }}
                      style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600" }}>Enter Room Space</Text>
                    </Pressable>
                  </Row>
                </Card>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* MODAL 1: MODIFY ROOM SETTINGS MODAL                            */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(editingRoom)}
        animationType="slide"
        onRequestClose={() => setEditingRoom(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Room Settings & Control</Text>
              <Muted style={{ fontSize: 12 }}>Modify settings for {editingRoom?.title}</Muted>
            </View>
            <Pressable onPress={() => setEditingRoom(null)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            {/* Title */}
            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>ROOM TITLE</Text>
              <TextInput
                value={formTitle}
                onChangeText={setFormTitle}
                style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            {/* Topic */}
            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>TOPIC / SUBJECT</Text>
              <TextInput
                value={formTopic}
                onChangeText={setFormTopic}
                style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>DESCRIPTION</Text>
              <TextInput
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
                numberOfLines={3}
                style={[styles.inputBox, { minHeight: 70, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            {/* Mode: Online, Offline, Hybrid */}
            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>ROOM MODE</Text>
              <Row style={{ gap: 8 }}>
                {(["online", "offline", "hybrid"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      triggerHaptic();
                      setFormMode(m);
                    }}
                    style={[
                      styles.choiceChip,
                      {
                        backgroundColor: formMode === m ? colors.primary : colors.surface,
                        borderColor: formMode === m ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: formMode === m ? "#FFFFFF" : colors.text }}>
                      {m.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            {/* Campus location if offline or hybrid */}
            {(formMode === "offline" || formMode === "hybrid") && (
              <View style={{ gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>CAMPUS PHYSICAL LOCATION</Text>
                <TextInput
                  value={formCampusLocation}
                  onChangeText={setFormCampusLocation}
                  placeholder="e.g. Science Complex Rm 302"
                  placeholderTextColor={colors.muted}
                  style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                />
              </View>
            )}

            {/* Visibility */}
            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>PRIVACY & VISIBILITY</Text>
              <Row style={{ gap: 8 }}>
                {(["public", "private", "invite_only"] as const).map((vis) => (
                  <Pressable
                    key={vis}
                    onPress={() => {
                      triggerHaptic();
                      setFormVisibility(vis);
                    }}
                    style={[
                      styles.choiceChip,
                      {
                        backgroundColor: formVisibility === vis ? colors.primary : colors.surface,
                        borderColor: formVisibility === vis ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: formVisibility === vis ? "#FFFFFF" : colors.text }}>
                      {vis === "public" ? "Public" : vis === "private" ? "Private" : "Invite-Only"}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            {/* Capacity */}
            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>MEMBER CAPACITY ({formCapacity})</Text>
              <Row style={{ gap: 8 }}>
                {[15, 30, 50, 100].map((cap) => (
                  <Pressable
                    key={cap}
                    onPress={() => {
                      triggerHaptic();
                      setFormCapacity(cap);
                    }}
                    style={[
                      styles.choiceChip,
                      {
                        backgroundColor: formCapacity === cap ? colors.primary : colors.surface,
                        borderColor: formCapacity === cap ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: formCapacity === cap ? "#FFFFFF" : colors.text }}>
                      {cap} seats
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            {/* Enabled Modules Toggle */}
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>ACTIVE WORKSPACE MODULES</Text>
              {AVAILABLE_MODULES.map((mod) => {
                const isEnabled = formModules.includes(mod.key);
                return (
                  <Row key={mod.key} style={[styles.moduleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                      <MaterialCommunityIcons name={mod.icon as any} size={20} color={colors.primary} />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{mod.label}</Text>
                    </Row>
                    <Switch
                      value={isEnabled}
                      onValueChange={() => {
                        triggerHaptic();
                        if (isEnabled && formModules.length <= 1) {
                          Alert.alert("At least one module must remain active.");
                          return;
                        }
                        setFormModules((prev) =>
                          isEnabled ? prev.filter((m) => m !== mod.key) : [...prev, mod.key]
                        );
                      }}
                      trackColor={{ false: colors.border, true: colors.primarySoft }}
                      thumbColor={isEnabled ? colors.primary : "#f4f3f4"}
                    />
                  </Row>
                );
              })}
            </View>

            {/* Rules */}
            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>ROOM RULES & GUIDELINES</Text>
              <TextInput
                value={formRules}
                onChangeText={setFormRules}
                placeholder="e.g. Mute when not speaking, be respectful..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[styles.inputBox, { minHeight: 60, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          </ScrollView>

          <View style={[styles.footerBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <Button
              title={updateSettingsMutation.isPending ? "Saving Settings..." : "Save Room Settings"}
              disabled={updateSettingsMutation.isPending}
              onPress={handleSaveSettings}
            />
          </View>
        </View>
      </Modal>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* MODAL 2: INVITE GENERATOR MODAL                                */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(inviteRoom)}
        animationType="slide"
        onRequestClose={() => setInviteRoom(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Room Invites & Codes</Text>
              <Muted style={{ fontSize: 12 }}>{inviteRoom?.title}</Muted>
            </View>
            <Pressable onPress={() => setInviteRoom(null)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={[styles.inviteGeneratorBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}>Generate Quick Access Code</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginVertical: 4 }}>
                Generate an 8-character invite code valid for 7 days. Anyone with this code can instantly join this room.
              </Text>
              <Button
                title={generatingInvite ? "Generating..." : "+ Generate 7-Day Invite Code"}
                disabled={generatingInvite}
                onPress={handleCreateInviteCode}
              />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>ACTIVE INVITE CODES</Text>

            {loadingInvites ? (
              <ActivityIndicator color={colors.primary} />
            ) : roomInvites.length === 0 ? (
              <Empty
                icon="ticket-outline"
                title="No Invite Codes"
                detail="Click above to generate your first room invitation code."
              />
            ) : (
              roomInvites.map((invite) => (
                <View
                  key={invite.id}
                  style={[styles.inviteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 18, fontWeight: "900", letterSpacing: 2, color: colors.primary }}>
                      {invite.code}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      Created: {new Date(invite.created_at).toLocaleDateString()}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleShareInvite(invite.code)}
                    style={[styles.shareCodeBtn, { backgroundColor: colors.primarySoft }]}
                  >
                    <MaterialCommunityIcons name="share-variant-outline" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Share</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 14,
  },
  backBtn: {
    padding: 4,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  tabTrack: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.pill,
  },
  tabPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  tabPillActive: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
  },
  tabTextBold: {
    fontWeight: "700",
  },
  roomCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  roomTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    paddingTop: 48,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  footerBar: {
    padding: 16,
    borderTopWidth: 1,
  },
  inviteGeneratorBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  shareCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
