import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";

export type RoomOSTabKey = "posts" | "chat" | "learn" | "media" | "more";

type RoomOSTabsProps = {
  activeTab: RoomOSTabKey;
  onTabChange: (tab: RoomOSTabKey) => void;
  chatUnreadCount?: number;
};

export function RoomOSTabs({ activeTab, onTabChange, chatUnreadCount }: RoomOSTabsProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const tabs: { key: RoomOSTabKey; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { key: "posts", label: t("room.posts") || "Posts", icon: "newspaper-variant-outline" },
    { key: "chat", label: t("room.chat") || "Chat", icon: "message-text-outline" },
    { key: "learn", label: t("room.learn") || "Learn", icon: "school-outline" },
    { key: "media", label: t("room.media") || "Media", icon: "folder-play-outline" },
    { key: "more", label: t("room.more") || "More", icon: "dots-horizontal-circle-outline" },
  ];

  return (
    <View style={[s.tabsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (!isActive) {
                triggerHaptic();
                onTabChange(tab.key);
              }
            }}
            style={s.tabItem}
          >
            <View style={s.tabIconWrap}>
              <MaterialCommunityIcons
                name={tab.icon}
                size={20}
                color={isActive ? colors.primary : colors.muted}
              />
              {tab.key === "chat" && Boolean(chatUnreadCount && chatUnreadCount > 0) && (
                <View style={[s.badge, { backgroundColor: colors.danger }]} />
              )}
            </View>
            <Text
              style={[
                s.tabLabel,
                { color: isActive ? colors.primary : colors.muted, fontWeight: isActive ? "800" : "600" },
              ]}
            >
              {tab.label}
            </Text>
            {isActive && <View style={[s.activeIndicator, { backgroundColor: colors.primary }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  tabsBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    height: 48,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    gap: 2,
  },
  tabIconWrap: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: -0.2,
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
});
