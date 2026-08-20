import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Conversation } from "@/types";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";

const Icon = ({ name, color }: { name: keyof typeof MaterialCommunityIcons.glyphMap; color: any }) => (
  <MaterialCommunityIcons name={name} size={23} color={color} />
);

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: Conversation[] }>("/chat/conversations"),
    staleTime: 30_000,
  });
  const unread = conversations.data?.conversations.reduce((sum, item) => sum + (item.unread_count ?? 0), 0) ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: 68,
          paddingTop: 7,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("nav.home"), tabBarIcon: ({ color }) => <Icon name="home-variant-outline" color={color} /> }} />
      <Tabs.Screen name="discover" options={{ title: t("nav.discover"), tabBarIcon: ({ color }) => <Icon name="compass-outline" color={color} /> }} />
      <Tabs.Screen name="rooms" options={{ title: t("nav.rooms"), tabBarIcon: ({ color }) => <Icon name="account-group-outline" color={color} /> }} />
      <Tabs.Screen name="inbox" options={{ title: t("nav.inbox"), tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined, tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.white, fontSize: 10 }, tabBarIcon: ({ color }) => <Icon name="message-text-outline" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: t("nav.profile"), tabBarIcon: ({ color }) => <Icon name="account-circle-outline" color={color} /> }} />
    </Tabs>
  );
}
