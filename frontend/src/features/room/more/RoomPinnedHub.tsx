import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import type { RoomPinnedItem } from "@/types";

type RoomPinnedHubProps = {
  roomId: string;
  visible: boolean;
  canPin?: boolean;
  onClose: () => void;
  onSelectItem?: (item: RoomPinnedItem) => void;
};

export function RoomPinnedHub({
  roomId,
  visible,
  canPin,
  onClose,
  onSelectItem,
}: RoomPinnedHubProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ pinnedItems: RoomPinnedItem[] }>({
    queryKey: ["room-pinned", roomId],
    queryFn: () => api<{ pinnedItems: RoomPinnedItem[] }>(`/rooms/${roomId}/pinned`),
    enabled: visible,
  });

  const unpinMutation = useMutation({
    mutationFn: (pinnedId: string) =>
      api(`/rooms/${roomId}/pinned/${pinnedId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-pinned", roomId] });
      qc.invalidateQueries({ queryKey: ["room-posts", roomId] });
    },
  });

  const getItemIcon = (type: RoomPinnedItem["item_type"]): keyof typeof MaterialCommunityIcons.glyphMap => {
    switch (type) {
      case "announcement":
        return "bullhorn";
      case "question":
        return "help-circle-outline";
      case "resource":
        return "file-document-outline";
      case "video":
        return "play-box-outline";
      case "message":
        return "chat-processing-outline";
      default:
        return "pin-outline";
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <Row style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onClose();
            }}
            style={s.backBtn}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.text }]}>Pinned Content Hub</Text>
          <View style={{ width: 32 }} />
        </Row>

        {/* Content List */}
        {isLoading ? (
          <View style={s.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (data?.pinnedItems ?? []).length === 0 ? (
          <View style={s.center}>
            <MaterialCommunityIcons name="pin-off-outline" size={48} color={colors.muted} />
            <Text style={[s.emptyText, { color: colors.muted }]}>
              No pinned items in this room yet. Important notices, exam formulas, and key lectures will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={data?.pinnedItems ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  if (onSelectItem) onSelectItem(item);
                  onClose();
                }}
                style={[s.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Row style={{ alignItems: "flex-start", gap: 12 }}>
                  <View style={[s.iconBox, { backgroundColor: colors.primary + "14" }]}>
                    <MaterialCommunityIcons name={getItemIcon(item.item_type)} size={22} color={colors.primary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Row style={{ alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <View style={[s.badge, { backgroundColor: colors.primary + "18" }]}>
                        <Text style={[s.badgeText, { color: colors.primary }]}>{item.item_type.toUpperCase()}</Text>
                      </View>
                      <Text style={[s.date, { color: colors.muted }]}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </Row>

                    <Text style={[s.title, { color: colors.text }]}>{item.title}</Text>
                    {Boolean(item.subtitle) && (
                      <Text style={[s.subtitle, { color: colors.muted }]} numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                    )}
                  </View>

                  {canPin && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        unpinMutation.mutate(item.id);
                      }}
                      style={s.unpinBtn}
                    >
                      <MaterialCommunityIcons name="pin-off" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                </Row>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  itemCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  date: {
    fontSize: 11,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  unpinBtn: {
    padding: 6,
  },
});
