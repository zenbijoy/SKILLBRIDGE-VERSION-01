import React from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useActiveRoomSession, type VoiceParticipant } from "./useActiveRoomSession";

type RoomVoiceSheetProps = {
  visible: boolean;
  roomId: string;
  roomTitle: string;
  isHostOrMod?: boolean;
  onClose: () => void;
};

export function RoomVoiceSheet({
  visible,
  roomId,
  roomTitle,
  isHostOrMod,
  onClose,
}: RoomVoiceSheetProps) {
  const { colors } = useTheme();
  const session = useActiveRoomSession();

  // Mock initial participant roster if session participants empty
  const participants: VoiceParticipant[] = session.participants.length > 0 ? session.participants : [
    { id: "1", name: "Rahim", isSpeaking: true, isMuted: false, role: "teacher" },
    { id: "2", name: "Nadia", isSpeaking: false, isMuted: false, role: "moderator" },
    { id: "3", name: "Tanvir", isSpeaking: false, isMuted: true, role: "member" },
    { id: "me", name: "You", isSpeaking: false, isMuted: session.isMuted, role: "member" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />

          {/* Title & Minimize */}
          <Row style={s.header}>
            <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
              <View style={[s.liveDot, { backgroundColor: colors.success }]} />
              <Text style={[s.title, { color: colors.text }]}>Voice Room</Text>
              <Text style={[s.roomName, { color: colors.muted }]}>· {roomTitle}</Text>
            </Row>

            <Pressable
              onPress={() => {
                triggerHaptic();
                onClose();
              }}
              style={s.minimizeBtn}
            >
              <MaterialCommunityIcons name="chevron-down" size={24} color={colors.text} />
            </Pressable>
          </Row>

          {/* Participant Avatars Grid */}
          <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
            {participants.map((p) => {
              return (
                <View key={p.id} style={s.participantItem}>
                  <View
                    style={[
                      s.avatarRing,
                      {
                        borderColor: p.isSpeaking ? colors.success : "transparent",
                        backgroundColor: p.isSpeaking ? colors.success + "18" : "transparent",
                      },
                    ]}
                  >
                    <View style={[s.avatar, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={[s.avatarText, { color: colors.primary }]}>{p.name[0]}</Text>
                    </View>

                    {p.isMuted && (
                      <View style={[s.mutedBadge, { backgroundColor: colors.danger }]}>
                        <MaterialCommunityIcons name="microphone-off" size={10} color="#FFFFFF" />
                      </View>
                    )}
                  </View>

                  <Text style={[s.pName, { color: colors.text }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[s.pRole, { color: colors.muted }]}>
                    {p.isSpeaking ? "Speaking" : p.isMuted ? "Muted" : p.role || "Member"}
                  </Text>

                  {isHostOrMod && p.id !== "me" && (
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        Alert.alert("Host Action", `Moderate ${p.name}`, [
                          { text: "Mute", onPress: () => {} },
                          { text: "Remove", style: "destructive", onPress: () => {} },
                          { text: "Cancel", style: "cancel" },
                        ]);
                      }}
                      style={s.modDots}
                    >
                      <MaterialCommunityIcons name="dots-horizontal" size={14} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Audio Action Controls */}
          <Row style={[s.controls, { borderTopColor: colors.border }]}>
            {/* Mute Button */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                session.toggleMute();
              }}
              style={[
                s.controlBtn,
                {
                  backgroundColor: session.isMuted ? colors.danger + "20" : colors.surfaceMuted,
                  borderColor: session.isMuted ? colors.danger : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={session.isMuted ? "microphone-off" : "microphone"}
                size={22}
                color={session.isMuted ? colors.danger : colors.text}
              />
              <Text style={[s.controlLabel, { color: session.isMuted ? colors.danger : colors.text }]}>
                {session.isMuted ? "Unmute" : "Mute"}
              </Text>
            </Pressable>

            {/* Speaker Button */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                session.toggleSpeaker();
              }}
              style={[
                s.controlBtn,
                {
                  backgroundColor: session.isSpeakerOn ? colors.primary + "18" : colors.surfaceMuted,
                  borderColor: session.isSpeakerOn ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={session.isSpeakerOn ? "volume-high" : "volume-medium"}
                size={22}
                color={session.isSpeakerOn ? colors.primary : colors.text}
              />
              <Text style={[s.controlLabel, { color: session.isSpeakerOn ? colors.primary : colors.text }]}>
                {session.isSpeakerOn ? "Speaker" : "Earpiece"}
              </Text>
            </Pressable>

            {/* Leave Voice Room */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                session.leaveVoiceSession();
                onClose();
              }}
              style={[s.controlBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
            >
              <MaterialCommunityIcons name="phone-hangup" size={22} color="#FFFFFF" />
              <Text style={[s.controlLabel, { color: "#FFFFFF", fontWeight: "700" }]}>Leave</Text>
            </Pressable>
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: "75%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  header: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  roomName: {
    fontSize: 13,
  },
  minimizeBtn: {
    padding: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingVertical: 12,
    justifyContent: "space-around",
  },
  participantItem: {
    alignItems: "center",
    width: 76,
  },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "800",
  },
  mutedBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  pName: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  pRole: {
    fontSize: 10,
    marginTop: 1,
    textAlign: "center",
  },
  modDots: {
    marginTop: 2,
    padding: 2,
  },
  controls: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 16,
    justifyContent: "space-around",
  },
  controlBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 84,
    gap: 4,
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
