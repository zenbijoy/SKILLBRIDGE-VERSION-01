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
  isEducator?: boolean;
};

export function RoomOSTabs({
  activeTab,
  onTabChange,
  chatUnreadCount,
  isEducator = false,
}: RoomOSTabsProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const unreadCount = Math.max(0, chatUnreadCount ?? 0);

  const tabs: {
    key: RoomOSTabKey;
    label: string;
    isIconOnly?: boolean;
    iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
  }[] = [
    {
      key: "posts",
      label: t("room.posts") || "Posts",
    },
    {
      key: "chat",
      label: t("room.chat") || "Chat",
    },
    {
      key: "learn",
      label: t("room.learn") || "Learn",
    },
    {
      key: "media",
      label: t("room.media") || "Media",
    },
    isEducator
      ? {
          key: "more",
          label: "Manage",
        }
      : {
          key: "more",
          label: "Menu",
          isIconOnly: true,
          iconName: "format-list-bulleted",
        },
  ];

  const activeColor = isDark ? "#60A5FA" : "#2563EB";
  const inactiveColor = isDark ? "#94A3B8" : "#64748B";

  return (
    <View style={[s.container, { borderBottomColor: isDark ? colors.border : "#E2E8F0" }]}>
      <View style={s.tabRow}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              onPress={() => {
                if (!isActive) {
                  triggerHaptic();
                  onTabChange(tab.key);
                }
              }}
              style={s.tabButton}
            >
              <View style={s.tabInnerRow}>
                {tab.isIconOnly && tab.iconName ? (
                  <MaterialCommunityIcons
                    name={tab.iconName}
                    size={20}
                    color={isActive ? activeColor : inactiveColor}
                  />
                ) : (
                  <Text
                    style={[
                      s.tabText,
                      {
                        color: isActive ? activeColor : inactiveColor,
                        fontWeight: isActive ? "700" : "600",
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                )}

                {/* Chat unread badge */}
                {tab.key === "chat" && unreadCount > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                )}
              </View>

              {/* Active Indicator Underline */}
              <View
                style={[
                  s.indicatorBar,
                  {
                    backgroundColor: isActive ? activeColor : "transparent",
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    backgroundColor: "transparent",
    marginBottom: 4,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tabInnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tabText: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  indicatorBar: {
    position: "absolute",
    bottom: 0,
    left: 4,
    right: 4,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
});
