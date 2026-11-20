import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

export interface RoomTeacher {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  headline?: string | null;
  role: string;
  is_owner: boolean;
  is_online: boolean;
}

interface TeacherCallModalProps {
  visible: boolean;
  roomId: string;
  roomTitle: string;
  onClose: () => void;
}

export function TeacherCallModal({
  visible,
  roomId,
  roomTitle,
  onClose,
}: TeacherCallModalProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const teachersQuery = useQuery({
    queryKey: ["room-teachers", roomId],
    queryFn: () => api<{ teachers: RoomTeacher[] }>(`/rooms/${roomId}/teachers`),
    enabled: visible && Boolean(roomId),
    staleTime: 15_000,
  });

  const teachers = teachersQuery.data?.teachers || [];

  const handleStartCall = (teacher: RoomTeacher, type: "audio" | "video") => {
    triggerHaptic();
    onClose();
    router.push({
      pathname: `/call/${teacher.id}` as any,
      params: {
        targetId: teacher.id,
        name: teacher.full_name,
        avatar: teacher.avatar_url || "",
        type,
      },
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable
          style={[s.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <Row style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="phone-outgoing" size={20} color={colors.primary} />
                <Text style={[s.title, { color: colors.text }]}>Direct Call to Teacher</Text>
              </Row>
              <Text style={[s.subtitle, { color: colors.muted }]} numberOfLines={1}>
                {roomTitle} · Select an educator for immediate 1:1 assistance
              </Text>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          </Row>

          {/* Teachers List */}
          {teachersQuery.isLoading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[s.loadingText, { color: colors.muted }]}>Finding teachers...</Text>
            </View>
          ) : teachers.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialCommunityIcons name="account-school-outline" size={40} color={colors.muted} />
              <Text style={[s.emptyTitle, { color: colors.text }]}>No teachers assigned yet</Text>
              <Text style={[s.emptySub, { color: colors.muted }]}>
                The room admin can assign members as teachers in room settings.
              </Text>
            </View>
          ) : (
            <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
              {teachers.map((teacher) => (
                <View
                  key={teacher.id}
                  style={[s.teacherCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                >
                  <Row style={{ alignItems: "center", gap: 12, flex: 1 }}>
                    {/* Avatar with online dot */}
                    <View style={s.avatarWrapper}>
                      {teacher.avatar_url ? (
                        <Image source={{ uri: teacher.avatar_url }} style={s.avatar} />
                      ) : (
                        <View style={[s.avatarFallback, { backgroundColor: colors.primary }]}>
                          <Text style={s.avatarInitial}>
                            {(teacher.full_name?.[0] || "?").toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View
                        style={[
                          s.onlineDot,
                          { backgroundColor: teacher.is_online ? "#10B981" : colors.muted },
                        ]}
                      />
                    </View>

                    {/* Teacher Details */}
                    <View style={{ flex: 1 }}>
                      <Row style={{ alignItems: "center", gap: 6 }}>
                        <Text style={[s.teacherName, { color: colors.text }]} numberOfLines={1}>
                          {teacher.full_name}
                        </Text>
                        <View style={[s.roleBadge, { backgroundColor: `${colors.primary}20` }]}>
                          <Text style={[s.roleBadgeText, { color: colors.primary }]}>
                            {teacher.role}
                          </Text>
                        </View>
                      </Row>
                      <Text style={[s.teacherHandle, { color: colors.muted }]}>
                        @{teacher.username}
                      </Text>
                    </View>
                  </Row>

                  {/* Call Action Buttons */}
                  <Row style={{ gap: 8 }}>
                    <Pressable
                      onPress={() => handleStartCall(teacher, "audio")}
                      style={[s.callBtn, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}
                      accessibilityRole="button"
                      accessibilityLabel="Voice Call"
                    >
                      <MaterialCommunityIcons name="phone" size={18} color={colors.primary} />
                      <Text style={[s.callBtnText, { color: colors.primary }]}>Audio</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleStartCall(teacher, "video")}
                      style={[s.callBtn, { backgroundColor: colors.primary }]}
                      accessibilityRole="button"
                      accessibilityLabel="Video Call"
                    >
                      <MaterialCommunityIcons name="video" size={18} color="#FFFFFF" />
                      <Text style={[s.callBtnText, { color: "#FFFFFF" }]}>Video</Text>
                    </Pressable>
                  </Row>
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: "80%",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.pill,
  },
  loadingBox: {
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 12,
    textAlign: "center",
  },
  list: {
    maxHeight: 420,
  },
  teacherCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
    gap: 8,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 18,
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  teacherName: {
    fontSize: 14,
    fontWeight: "700",
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  teacherHandle: {
    fontSize: 12,
    marginTop: 1,
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  callBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
