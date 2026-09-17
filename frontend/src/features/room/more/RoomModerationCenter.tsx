import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Button, Card, Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import type { RoomModerationLog, RoomModerationReport } from "@/types";

type RoomModerationCenterProps = {
  roomId: string;
  visible: boolean;
  onClose: () => void;
};

export function RoomModerationCenter({ roomId, visible, onClose }: RoomModerationCenterProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"reports" | "logs">("reports");

  const { data: reportsData, isLoading: reportsLoading } = useQuery<{ reports: RoomModerationReport[] }>({
    queryKey: ["room-mod-reports", roomId],
    queryFn: () => api<{ reports: RoomModerationReport[] }>(`/rooms/${roomId}/moderation/reports`),
    enabled: visible && activeTab === "reports",
  });

  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: RoomModerationLog[] }>({
    queryKey: ["room-mod-logs", roomId],
    queryFn: () => api<{ logs: RoomModerationLog[] }>(`/rooms/${roomId}/moderation/logs`),
    enabled: visible && activeTab === "logs",
  });

  const actionMutation = useMutation({
    mutationFn: (body: { action: string; targetType: string; targetId: string; reason: string; reportId?: string }) =>
      api(`/rooms/${roomId}/moderation/actions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-mod-reports", roomId] });
      qc.invalidateQueries({ queryKey: ["room-mod-logs", roomId] });
      qc.invalidateQueries({ queryKey: ["room-posts", roomId] });
      Alert.alert("Success", "Moderation action executed and logged.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Action failed");
    },
  });

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
          <Text style={[s.headerTitle, { color: colors.text }]}>Room Moderation Center</Text>
          <View style={{ width: 32 }} />
        </Row>

        {/* Tab Switcher */}
        <Row style={[s.subTabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("reports");
            }}
            style={[
              s.tabBtn,
              { borderBottomColor: activeTab === "reports" ? colors.primary : "transparent" },
            ]}
          >
            <Text style={[s.tabBtnText, { color: activeTab === "reports" ? colors.primary : colors.muted }]}>
              Reports Queue
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("logs");
            }}
            style={[
              s.tabBtn,
              { borderBottomColor: activeTab === "logs" ? colors.primary : "transparent" },
            ]}
          >
            <Text style={[s.tabBtnText, { color: activeTab === "logs" ? colors.primary : colors.muted }]}>
              Audit Trail
            </Text>
          </Pressable>
        </Row>

        {/* Reports Queue */}
        {activeTab === "reports" ? (
          reportsLoading ? (
            <View style={s.center}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (reportsData?.reports ?? []).length === 0 ? (
            <View style={s.center}>
              <MaterialCommunityIcons name="shield-check-outline" size={48} color={colors.success} />
              <Text style={[s.emptyTitle, { color: colors.text }]}>Moderation Queue Clear</Text>
              <Text style={[s.emptyDesc, { color: colors.muted }]}>No reported content or pending moderation tickets in this room.</Text>
            </View>
          ) : (
            <FlatList
              data={reportsData?.reports ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.list}
              renderItem={({ item }) => (
                <View style={[s.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Row style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <View style={[s.badge, { backgroundColor: colors.danger + "18" }]}>
                      <Text style={[s.badgeText, { color: colors.danger }]}>{item.target_type.toUpperCase()}</Text>
                    </View>
                    <Text style={[s.reportDate, { color: colors.muted }]}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                  </Row>

                  <Text style={[s.reportReason, { color: colors.text }]}>{item.reason}</Text>
                  {Boolean(item.details) && (
                    <Text style={[s.reportDetails, { color: colors.muted }]}>{item.details}</Text>
                  )}

                  <Row style={{ gap: 8, marginTop: 12 }}>
                    <Button
                      title="Dismiss"
                      variant="ghost"
                      onPress={() =>
                        actionMutation.mutate({
                          action: "dismiss_report",
                          targetType: item.target_type,
                          targetId: item.target_id,
                          reason: "Dismissed by moderator",
                          reportId: item.id,
                        })
                      }
                    />
                    <Button
                      title="Remove Content"
                      variant="danger"
                      onPress={() =>
                        actionMutation.mutate({
                          action: "remove_content",
                          targetType: item.target_type,
                          targetId: item.target_id,
                          reason: item.reason,
                          reportId: item.id,
                        })
                      }
                    />
                  </Row>
                </View>
              )}
            />
          )
        ) : (
          /* Audit Logs */
          logsLoading ? (
            <View style={s.center}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (logsData?.logs ?? []).length === 0 ? (
            <View style={s.center}>
              <MaterialCommunityIcons name="history" size={48} color={colors.muted} />
              <Text style={[s.emptyTitle, { color: colors.text }]}>No Moderation Actions</Text>
              <Text style={[s.emptyDesc, { color: colors.muted }]}>Audit entries will appear here when moderators take action.</Text>
            </View>
          ) : (
            <FlatList
              data={logsData?.logs ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.list}
              renderItem={({ item }) => (
                <View style={[s.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={[s.logAction, { color: colors.primary }]}>{item.action.replace("_", " ").toUpperCase()}</Text>
                    <Text style={[s.reportDate, { color: colors.muted }]}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </Row>
                  <Text style={[s.logActor, { color: colors.text }]}>
                    by {item.actor?.full_name || "Moderator"} on {item.target_type}
                  </Text>
                  {Boolean(item.reason) && (
                    <Text style={[s.reportDetails, { color: colors.muted }]}>Reason: {item.reason}</Text>
                  )}
                </View>
              )}
            />
          )
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
  subTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  reportCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
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
  reportDate: {
    fontSize: 11,
  },
  reportReason: {
    fontSize: 14,
    fontWeight: "700",
  },
  reportDetails: {
    fontSize: 12,
    marginTop: 4,
  },
  logCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  logAction: {
    fontSize: 12,
    fontWeight: "800",
  },
  logActor: {
    fontSize: 13,
    fontWeight: "600",
  },
});
