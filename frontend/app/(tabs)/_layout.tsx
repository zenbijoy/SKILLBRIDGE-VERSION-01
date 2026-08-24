import { useEffect } from "react";
import { Platform, BackHandler, ToastAndroid } from "react-native";
import { Tabs, usePathname, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useEffect as useReanimatedEffect } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Conversation } from "@/types";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";

const Icon = ({ name, color, focused }: { name: keyof typeof MaterialCommunityIcons.glyphMap; color: any; focused: boolean }) => {
  const scale = useSharedValue(focused ? 1.15 : 1);

  useReanimatedEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, { damping: 12, stiffness: 200 });
  }, [focused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <MaterialCommunityIcons name={name} size={24} color={color} />
    </Animated.View>
  );
};

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: Conversation[] }>("/chat/conversations"),
    staleTime: 30_000,
  });
  const unread = conversations.data?.conversations.reduce((sum, item) => sum + (item.unread_count ?? 0), 0) ?? 0;

  // Safe bottom padding for Android gesture/navigation bar and iOS home indicator
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 14 : 10);
  const tabHeight = 58 + bottomInset;

  // Android Back button handler: Return to home tab from secondary tabs to prevent accidental app exit
  useEffect(() => {
    if (Platform.OS !== "android") return;

    let backPressTime = 0;
    const onBackPress = () => {
      // If user is on a secondary tab, return to Home tab first
      const isHome = pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/" || pathname === "/(tabs)/index";
      if (!isHome && pathname.startsWith("/(tabs)")) {
        router.push("/(tabs)");
        return true; // Handled
      }

      if (isHome) {
        const now = Date.now();
        if (now - backPressTime < 2000) {
          BackHandler.exitApp();
          return true;
        }
        backPressTime = now;
        ToastAndroid.show("Press back again to exit SkillBridge", ToastAndroid.SHORT);
        return true; // Handled
      }

      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [pathname, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabHeight,
          paddingTop: 8,
          paddingBottom: bottomInset,
          elevation: 8,
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 2 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("nav.home"), tabBarIcon: ({ color, focused }) => <Icon name={focused ? "home-variant" : "home-variant-outline"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="discover" options={{ title: t("nav.discover"), tabBarIcon: ({ color, focused }) => <Icon name={focused ? "compass" : "compass-outline"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="rooms" options={{ title: t("nav.rooms"), tabBarIcon: ({ color, focused }) => <Icon name={focused ? "account-group" : "account-group-outline"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="inbox" options={{ title: t("nav.inbox"), tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined, tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.white, fontSize: 10 }, tabBarIcon: ({ color, focused }) => <Icon name={focused ? "message-text" : "message-text-outline"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: t("nav.profile"), tabBarIcon: ({ color, focused }) => <Icon name={focused ? "account-circle" : "account-circle-outline"} color={color} focused={focused} /> }} />
    </Tabs>
  );
}
