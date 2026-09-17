import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useActiveRoomSession } from "./useActiveRoomSession";

type RoomVoiceBannerProps = {
  roomId: string;
  roomTitle: string;
  onPress: () => void;
};

export function RoomVoiceBanner({ roomId, roomTitle, onPress }: RoomVoiceBannerProps) {
  const { colors } = useTheme();
  const session = useActiveRoomSession();

  // If session is active for this room or generally active
  const isActiveHere = session.isVoiceActive && session.activeRoomId === roomId;

  return (
    <Pressable
      onPress={() => {
        triggerHaptic();
        if (!session.isVoiceActive) {
          session.joinVoiceSession(roomId, roomTitle);
        }
        onPress();
      }}
      style={[
        s.banner,
        {
          backgroundColor: colors.success + "16",
          borderColor: colors.success + "40",
        },
      ]}
    >
      <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
        <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
          <View style={[s.pulseDot, { backgroundColor: colors.success }]} />
          <MaterialCommunityIcons name="volume-high" size={18} color={colors.success} />
          <Text style={[s.bannerText, { color: colors.text }]}>
            {isActiveHere ? "Voice Connected" : "Study Voice Room"}
          </Text>
          <Text style={[s.participantsText, { color: colors.muted }]}>
            · {session.participants.length > 0 ? session.participants.length : 4} people
          </Text>
        </Row>

        <View style={[s.joinChip, { backgroundColor: colors.success }]}>
          <Text style={s.joinText}>{isActiveHere ? "Return" : "Join"}</Text>
        </View>
      </Row>
    </Pressable>
  );
}

const s = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  participantsText: {
    fontSize: 12,
  },
  joinChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  joinText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
});
