import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { useActiveRoomSession } from "./useActiveRoomSession";

type RoomVoiceBannerProps = {
  roomId: string;
  roomTitle: string;
  memberCount?: number;
  onPress: () => void;
};

export function RoomVoiceBanner({ roomId, roomTitle, memberCount = 0, onPress }: RoomVoiceBannerProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const session = useActiveRoomSession();

  // Only render when an actual voice session is currently active
  const isActiveHere = session.isVoiceActive && session.activeRoomId === roomId;
  if (!isActiveHere) {
    return null;
  }
  const count = session.participants.length > 0 ? session.participants.length : Math.max(memberCount, 1);

  return (
    <Pressable
      onPress={() => {
        triggerHaptic();
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
            Live Audio Session Connected
          </Text>
          <Text style={[s.participantsText, { color: colors.muted }]}>
            · {count} {t("rooms.voice.peopleCount")}
          </Text>
        </Row>

        <View style={[s.joinChip, { backgroundColor: colors.success }]}>
          <Text style={s.joinText}>{t("rooms.voice.return")}</Text>
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
