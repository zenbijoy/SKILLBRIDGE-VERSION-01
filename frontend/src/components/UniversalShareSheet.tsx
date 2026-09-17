import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, H2, Muted, Pill, Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import type { Room } from "@/types";

export type ShareableEntityType =
  | "post"
  | "announcement"
  | "question"
  | "event"
  | "resource"
  | "research";

type UniversalShareSheetProps = {
  visible: boolean;
  sourceType: ShareableEntityType;
  sourceId: string;
  sourceTitle: string;
  sourceVisibility?: "public" | "private";
  onClose: () => void;
  onShared?: () => void;
};

export function UniversalShareSheet({
  visible,
  sourceType,
  sourceId,
  sourceTitle,
  sourceVisibility = "public",
  onClose,
  onShared,
}: UniversalShareSheetProps) {
  const { colors } = useTheme();
  const [destination, setDestination] = useState<"campus_feed" | "room" | "chat">("chat");
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>();
  const [shareNote, setShareNote] = useState("");

  const isPrivateSource = sourceVisibility === "private";

  // Fetch joined rooms for room sharing
  const roomsQuery = useQuery({
    queryKey: ["my-rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms/mine"),
    enabled: visible && destination === "room",
  });

  const joinedRooms = roomsQuery.data?.rooms ?? [];

  const shareMutation = useMutation({
    mutationFn: () =>
      api("/shares", {
        method: "POST",
        body: JSON.stringify({
          sourceType,
          sourceId,
          destinationType: destination,
          destinationId: destination === "room" ? selectedRoomId : undefined,
          note: shareNote.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      onClose();
      if (onShared) onShared();
      Alert.alert("Content Shared! 🚀", "A canonical reference has been routed to your chosen destination.");
    },
    onError: (err: any) => {
      Alert.alert("Share Blocked", err.message || "Unable to share content to this destination.");
    },
  });

  const handleCopyLink = () => {
    triggerHaptic();
    const url = `https://skillbridge.app/${sourceType}/${sourceId}`;
    void Share.share({
      message: `Check this out on SkillBridge: ${url}`,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={s.header}>
            <View style={{ flex: 1 }}>
              <H2 style={s.title}>Share Content</H2>
              <Muted numberOfLines={1} style={{ fontSize: 12 }}>{sourceTitle}</Muted>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          {/* Canonical Source Banner */}
          <Card tone="soft" style={s.sourceBanner}>
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="link-variant" size={18} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>
                Canonical reference · Updates and solutions sync automatically.
              </Text>
            </Row>
          </Card>

          {/* Destination Selector */}
          <View style={{ gap: 8, marginVertical: 12 }}>
            <Text style={[s.sectionLabel, { color: colors.text }]}>Choose Destination</Text>

            {/* Destination 1: Send to Chat */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                setDestination("chat");
              }}
              style={[
                s.destOption,
                {
                  backgroundColor: destination === "chat" ? colors.primarySoft : colors.bg,
                  borderColor: destination === "chat" ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons name="chat-outline" size={20} color={destination === "chat" ? colors.primary : colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[s.destTitle, { color: colors.text }]}>Send to 1:1 or Group Chat</Text>
                <Muted style={{ fontSize: 11 }}>Share private link directly to a study partner</Muted>
              </View>
              {destination === "chat" && (
                <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
              )}
            </Pressable>

            {/* Destination 2: Share to Room */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                setDestination("room");
              }}
              style={[
                s.destOption,
                {
                  backgroundColor: destination === "room" ? colors.primarySoft : colors.bg,
                  borderColor: destination === "room" ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons name="door-open" size={20} color={destination === "room" ? colors.primary : colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[s.destTitle, { color: colors.text }]}>Share to Study Room</Text>
                <Muted style={{ fontSize: 11 }}>Cross-post reference into one of your rooms</Muted>
              </View>
              {destination === "room" && (
                <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
              )}
            </Pressable>

            {/* Destination 3: Campus Feed (Only if source is PUBLIC) */}
            <Pressable
              disabled={isPrivateSource}
              onPress={() => {
                if (isPrivateSource) return;
                triggerHaptic();
                setDestination("campus_feed");
              }}
              style={[
                s.destOption,
                {
                  backgroundColor: destination === "campus_feed" ? colors.primarySoft : colors.bg,
                  borderColor: destination === "campus_feed" ? colors.primary : colors.border,
                  opacity: isPrivateSource ? 0.45 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons name="newspaper-variant-outline" size={20} color={destination === "campus_feed" ? colors.primary : colors.muted} />
              <View style={{ flex: 1 }}>
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <Text style={[s.destTitle, { color: colors.text }]}>Campus Feed</Text>
                  {isPrivateSource && <Pill tone="danger">LOCKED</Pill>}
                </Row>
                <Muted style={{ fontSize: 11 }}>
                  {isPrivateSource
                    ? "Private content cannot be broadcast to the public feed"
                    : "Broadcast to all students at your university"}
                </Muted>
              </View>
              {destination === "campus_feed" && (
                <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
              )}
            </Pressable>
          </View>

          {/* Room picker if destination === "room" */}
          {destination === "room" && (
            <View style={{ marginBottom: 10 }}>
              <Text style={[s.sectionLabel, { color: colors.muted, fontSize: 11 }]}>SELECT TARGET ROOM</Text>
              <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {joinedRooms.map((r) => {
                  const isPicked = selectedRoomId === r.id;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => {
                        triggerHaptic();
                        setSelectedRoomId(r.id);
                      }}
                      style={[
                        s.roomPill,
                        {
                          backgroundColor: isPicked ? colors.primary : colors.bg,
                          borderColor: isPicked ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 12, color: isPicked ? "#FFF" : colors.text }}>
                        {r.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </Row>
            </View>
          )}

          {/* Optional Note */}
          <TextInput
            placeholder="Add an optional comment or context..."
            placeholderTextColor={colors.muted}
            value={shareNote}
            onChangeText={setShareNote}
            style={[s.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
          />

          {/* Action Row */}
          <Row style={{ gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Copy Link 🔗"
                variant="secondary"
                onPress={handleCopyLink}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={shareMutation.isPending ? "Sharing..." : "Share"}
                disabled={shareMutation.isPending || (destination === "room" && !selectedRoomId)}
                onPress={() => shareMutation.mutate()}
              />
            </View>
          </Row>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    padding: 20,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  sourceBanner: {
    padding: 10,
    borderRadius: radius.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  destOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  destTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  roomPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
});
