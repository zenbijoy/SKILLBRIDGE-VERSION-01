import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Platform,
} from "react-native";
import { router, usePathname } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAppStore } from "@/state/useAppStore";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useTheme, radius } from "@/theme";
import { useI18n } from "@/i18n";
import { triggerHaptic } from "@/components/ui";
import { useWebLayoutStore } from "@/state/useWebLayoutStore";
import { WebSearchModal } from "./WebSearchModal";
import { WebNotificationsDropdown } from "./WebNotificationsDropdown";
import { WebMessagesDropdown } from "./WebMessagesDropdown";

export function WebHeader() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const pathname = usePathname();
  const { session } = useAuth();
  const { mode, setMode, cachedProfile } = useAppStore();
  const { setTheme, language, setLanguage } = usePreferencesStore();

  const {
    toggleNavbar,
    isLeftSidebarVisible,
    toggleLeftSidebar,
    isFocusMode,
    toggleFocusMode,
  } = useWebLayoutStore();

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Global Ctrl+K (search) and Alt+N (toggle navbar) hotkeys
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchModalOpen(true);
      }
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        toggleNavbar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleNavbar]);

  // Notifications query
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: any[] }>("/notifications"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: Boolean(session),
  });
  const unreadNotifications =
    notificationsQuery.data?.notifications?.filter((n) => !n.read_at).length ?? 0;

  // Conversations query
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: any[] }>("/chat/conversations"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: Boolean(session),
  });
  const unreadMessages =
    conversationsQuery.data?.conversations?.reduce(
      (sum, item) => sum + (item.unread_count ?? 0),
      0
    ) ?? 0;

  // Connections / Incoming requests
  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: () =>
      api<{ connections: any[]; incoming: any[]; suggested: any[] }>("/connections"),
    staleTime: 30_000,
    enabled: Boolean(session),
  });
  const pendingRequests = connectionsQuery.data?.incoming?.length ?? 0;

  // Streak query
  const streakQuery = useQuery({
    queryKey: ["activity-streak"],
    queryFn: () => api<{ current_streak_days: number }>("/activity/streak"),
    staleTime: 60_000,
    enabled: Boolean(session),
  });
  const streakDays = streakQuery.data?.current_streak_days ?? 5;

  // Live rooms indicator
  const roomsQuery = useQuery({
    queryKey: ["live-rooms-badge"],
    queryFn: () => api<{ rooms: any[] }>("/rooms?status=live&limit=1"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: Boolean(session),
  });
  const hasLiveRooms = (roomsQuery.data?.rooms?.length ?? 0) > 0;

  const initial = (cachedProfile?.full_name?.trim()?.[0] ?? "U").toUpperCase();
  const avatarUrl = cachedProfile?.avatar_url;

  const handleToggleTheme = () => {
    triggerHaptic();
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
  };

  const handleToggleLanguage = () => {
    triggerHaptic();
    const nextLang = language === "en" ? "bn" : "en";
    setLanguage(nextLang);
  };

  const handleSignOut = async () => {
    triggerHaptic();
    setProfileMenuOpen(false);
    await supabase.auth.signOut();
    router.replace("/(auth)/sign-in" as any);
  };

  // Primary Center Tabs Definition
  const NAV_TABS = [
    {
      key: "home",
      label: "Home",
      iconActive: "home-variant",
      iconInactive: "home-variant-outline",
      route: "/(tabs)",
      active: pathname === "/" || pathname === "/(tabs)" || pathname === "/feed",
      badge: 0,
    },
    {
      key: "discover",
      label: "Discover",
      iconActive: "compass",
      iconInactive: "compass-outline",
      route: "/(tabs)/discover",
      active: pathname.startsWith("/(tabs)/discover"),
      badge: 0,
    },
    {
      key: "rooms",
      label: "Rooms",
      iconActive: "account-group",
      iconInactive: "account-group-outline",
      route: "/(tabs)/rooms",
      active: pathname.startsWith("/(tabs)/rooms") || pathname.startsWith("/room"),
      badge: hasLiveRooms ? "LIVE" : 0,
    },
    {
      key: "network",
      label: "Network",
      iconActive: "account-multiple",
      iconInactive: "account-multiple-outline",
      route: "/connections",
      active: pathname.startsWith("/connections"),
      badge: pendingRequests,
    },
    {
      key: "tools",
      label: "Tools",
      iconActive: "toolbox",
      iconInactive: "toolbox-outline",
      route: "/(tabs)/tools",
      active:
        pathname.startsWith("/(tabs)/tools") ||
        pathname.startsWith("/schedule") ||
        pathname.startsWith("/vault") ||
        pathname.startsWith("/goals") ||
        pathname.startsWith("/planner") ||
        pathname.startsWith("/quiz"),
      badge: 0,
    },
  ];

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        width: "100%",
        height: 60,
        backgroundColor: isDark ? "rgba(18, 18, 21, 0.92)" : "rgba(255, 255, 255, 0.94)",
        backdropFilter: "blur(14px)",
        borderBottom: `1px solid ${colors.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        boxSizing: "border-box",
      }}
    >
      {/* 1. Left Section: Sidebar Toggle, Brand Logo & Global Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Sidebar Toggle Button */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            toggleLeftSidebar();
          }}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: !isLeftSidebarVisible
                ? colors.primarySoft
                : isDark
                ? colors.surface2
                : "#F1F5F9",
              width: 36,
              height: 36,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityLabel="Toggle Sidebar"
        >
          <MaterialCommunityIcons
            name={isLeftSidebarVisible ? "dock-left" : "menu"}
            size={18}
            color={!isLeftSidebarVisible ? colors.primary : colors.text}
          />
        </Pressable>

        {/* Brand Logo with 3D Cyber Yellow Badge */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            router.push("/(tabs)" as any);
          }}
          style={({ pressed }) => [
            styles.brandBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <div
            className="animate-float-1"
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              background: "linear-gradient(135deg, #FEF08A 0%, #FACC15 50%, #EAB308 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(234, 179, 8, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
              border: "1px solid rgba(254, 240, 138, 0.8)",
            }}
          >
            <MaterialCommunityIcons name="school" size={21} color="#0F1015" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.6, color: colors.text, lineHeight: 1.1 }}>
              Skill<span style={{ color: "#EAB308" }}>Bridge</span>
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: colors.muted, textTransform: "uppercase" }}>
              Campus Mesh
            </span>
          </div>
        </Pressable>

        {/* Global Search Bar with 3D Depth */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            setSearchModalOpen(true);
          }}
          style={({ pressed }) => [
            styles.searchBar,
            {
              backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
              borderColor: isDark ? "rgba(250, 204, 21, 0.2)" : "rgba(234, 179, 8, 0.25)",
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={isDark ? "#FACC15" : "#CA8A04"} />
          <Text style={[styles.searchText, { color: colors.muted }]}>
            {t("common.searchEverything", "Search skills, mentors, rooms...")}
          </Text>
          <View style={[styles.kbdBadge, { backgroundColor: isDark ? colors.surface : "#FFFFFF", borderColor: colors.border }]}>
            <Text style={[styles.kbdText, { color: isDark ? "#FACC15" : "#B45309" }]}>Ctrl K</Text>
          </View>
        </Pressable>
      </div>

      {/* 2. Center Section: Primary Navigation Hub with Cyber Yellow Active Indicators */}
      <nav style={{ display: "flex", alignItems: "center", height: "100%", gap: 4 }}>
        {NAV_TABS.map((tab) => {
          const tabActiveColor = isDark ? "#FACC15" : "#CA8A04";
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                triggerHaptic();
                router.push(tab.route as any);
              }}
              style={({ pressed }) => [
                styles.navTab,
                {
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <View style={styles.navIconContainer}>
                <MaterialCommunityIcons
                  name={(tab.active ? tab.iconActive : tab.iconInactive) as any}
                  size={24}
                  color={tab.active ? tabActiveColor : colors.muted}
                />
                {tab.badge === "LIVE" ? (
                  <View style={[styles.liveBadge, { backgroundColor: "#10B981" }]}>
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                ) : typeof tab.badge === "number" && tab.badge > 0 ? (
                  <View style={[styles.countBadge, { backgroundColor: colors.danger }]}>
                    <Text style={styles.countBadgeText}>{tab.badge > 99 ? "99+" : tab.badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.navTabLabel,
                  {
                    color: tab.active ? tabActiveColor : colors.muted,
                    fontWeight: tab.active ? "800" : "500",
                  },
                ]}
              >
                {tab.label}
              </Text>
              {tab.active ? (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: "15%",
                    right: "15%",
                    height: 3,
                    borderRadius: "3px 3px 0 0",
                    background: "linear-gradient(90deg, #FACC15, #EAB308)",
                    boxShadow: "0 0 10px rgba(250, 204, 21, 0.6)",
                  }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </nav>

      {/* 3. Right Section: Action Utilities & Profile Dropdown */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Get Android App Showcase link */}
        <a
          href="https://skillbridgeapk.duckdns.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#E6F7F2",
            color: isDark ? "#34D399" : "#059669",
            border: `1px solid ${isDark ? "rgba(16, 185, 129, 0.3)" : "#A7F3D0"}`,
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
          title="Download SkillBridge Android APK & View Platform Showcase"
        >
          <span style={{ fontSize: 14 }}>📱</span>
          <span>Get Android App</span>
        </a>

        {/* + Create Action Button */}
        <div style={{ position: "relative" }}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setCreateMenuOpen((prev) => !prev);
              setNotificationsOpen(false);
              setMessagesOpen(false);
              setProfileMenuOpen(false);
            }}
            style={({ pressed }) => [
              styles.createActionBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.createActionText}>Create</Text>
          </Pressable>

          {/* Create Dropdown Popover */}
          {createMenuOpen ? (
            <div
              style={{
                position: "absolute",
                top: 44,
                right: 0,
                width: 220,
                backgroundColor: colors.surface,
                borderRadius: 12,
                border: `1px solid ${colors.borderStrong}`,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25)",
                padding: 6,
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {[
                { icon: "square-edit-outline", title: "Create Post", route: "/feed" },
                { icon: "door-open", title: "Host Study Room", route: "/room/create" },
                { icon: "calendar-plus", title: "Schedule Session", route: "/schedule" },
                { icon: "target", title: "New Learning Goal", route: "/goals/create" },
                { icon: "help-circle-outline", title: "Ask Campus Question", route: "/help/questions" },
              ].map((item) => (
                <Pressable
                  key={item.route}
                  onPress={() => {
                    triggerHaptic();
                    setCreateMenuOpen(false);
                    router.push(item.route as any);
                  }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    {
                      backgroundColor: pressed ? colors.surface2 : "transparent",
                      borderRadius: radius.sm,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name={item.icon as any} size={18} color={colors.primary} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>{item.title}</Text>
                </Pressable>
              ))}
            </div>
          ) : null}
        </div>

        {/* Learning Streak Pill */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            router.push("/streak" as any);
          }}
          style={({ pressed }) => [
            styles.streakPill,
            {
              backgroundColor: isDark ? "rgba(249, 115, 22, 0.16)" : "#FFF7ED",
              borderColor: isDark ? "rgba(249, 115, 22, 0.35)" : "#FDBA74",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={styles.streakFlame}>🔥</Text>
          <Text style={[styles.streakText, { color: isDark ? "#FB923C" : "#EA580C" }]}>
            {streakDays}d
          </Text>
        </Pressable>

        {/* Role Mode Switcher (Learner / Mentor) */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            setMode(mode === "learn" ? "teach" : "learn");
          }}
          style={({ pressed }) => [
            styles.modePill,
            {
              backgroundColor: colors.surface2,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={mode === "learn" ? "school-outline" : "account-tie-outline"}
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.modePillText, { color: colors.text }]}>
            {mode === "learn" ? "Learner" : "Mentor"}
          </Text>
        </Pressable>

        {/* Messages / Inbox Icon Button */}
        <div style={{ position: "relative" }}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setMessagesOpen((prev) => !prev);
              setNotificationsOpen(false);
              setCreateMenuOpen(false);
              setProfileMenuOpen(false);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: isDark ? colors.surface2 : "#F1F5F9",
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons name="chat-processing-outline" size={20} color={colors.text} />
            {unreadMessages > 0 ? (
              <View style={[styles.iconBadge, { backgroundColor: colors.danger }]}>
                <Text style={styles.iconBadgeText}>
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <WebMessagesDropdown visible={messagesOpen} onClose={() => setMessagesOpen(false)} />
        </div>

        {/* Notifications Icon Button */}
        <div style={{ position: "relative" }}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setNotificationsOpen((prev) => !prev);
              setMessagesOpen(false);
              setCreateMenuOpen(false);
              setProfileMenuOpen(false);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: isDark ? colors.surface2 : "#F1F5F9",
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color={colors.text} />
            {unreadNotifications > 0 ? (
              <View style={[styles.iconBadge, { backgroundColor: colors.danger }]}>
                <Text style={styles.iconBadgeText}>
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <WebNotificationsDropdown
            visible={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
          />
        </div>

        {/* Theme Switcher Button */}
        <Pressable
          onPress={handleToggleTheme}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: isDark ? colors.surface2 : "#F1F5F9",
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={isDark ? "weather-sunny" : "weather-night"}
            size={20}
            color={colors.text}
          />
        </Pressable>

        {/* Language Switcher Button */}
        <Pressable
          onPress={handleToggleLanguage}
          style={({ pressed }) => [
            styles.langPill,
            {
              backgroundColor: isDark ? colors.surface2 : "#F1F5F9",
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Text style={[styles.langText, { color: colors.text }]}>
            {language.toUpperCase()}
          </Text>
        </Pressable>

        {/* Zen / Focus Mode Toggle */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            toggleFocusMode();
          }}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: isFocusMode
                ? colors.primarySoft
                : isDark
                ? colors.surface2
                : "#F1F5F9",
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityLabel={isFocusMode ? "Exit Zen Mode" : "Zen Mode"}
        >
          <MaterialCommunityIcons
            name={isFocusMode ? "fullscreen-exit" : "fullscreen"}
            size={18}
            color={isFocusMode ? colors.primary : colors.text}
          />
        </Pressable>

        {/* Hide Navbar Button (Alt+N) */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            toggleNavbar();
          }}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: isDark ? colors.surface2 : "#F1F5F9",
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityLabel="Hide Navbar (Alt+N)"
        >
          <MaterialCommunityIcons
            name="chevron-up"
            size={18}
            color={colors.text}
          />
        </Pressable>

        {/* User Profile Avatar Dropdown */}
        <div style={{ position: "relative" }}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setProfileMenuOpen((prev) => !prev);
              setNotificationsOpen(false);
              setMessagesOpen(false);
              setCreateMenuOpen(false);
            }}
            style={({ pressed }) => [
              styles.avatarBtn,
              {
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
              </View>
            )}
            <MaterialCommunityIcons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>

          {/* Profile Dropdown Popover */}
          {profileMenuOpen ? (
            <div
              style={{
                position: "absolute",
                top: 48,
                right: 0,
                width: 250,
                backgroundColor: colors.surface,
                borderRadius: 14,
                border: `1px solid ${colors.borderStrong}`,
                boxShadow: "0 12px 30px -5px rgba(0, 0, 0, 0.3)",
                padding: "10px 6px",
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {/* Profile Card Summary */}
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setProfileMenuOpen(false);
                  router.push("/profile" as any);
                }}
                style={styles.profileSummaryRow}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.summaryAvatar} />
                ) : (
                  <View style={[styles.summaryAvatarFallback, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
                  </View>
                )}
                <View style={styles.summaryTextCol}>
                  <Text style={[styles.summaryName, { color: colors.text }]} numberOfLines={1}>
                    {cachedProfile?.full_name || "SkillBridge Learner"}
                  </Text>
                  <Text style={[styles.summaryLink, { color: colors.primary }]}>View profile</Text>
                </View>
              </Pressable>

              <div style={{ height: 1, backgroundColor: colors.border, margin: "6px 0" }} />

              {/* Menu items */}
              {[
                { icon: "calendar-check", title: "My Bookings", route: "/bookings" },
                { icon: "archive-outline", title: "Study Vault", route: "/vault" },
                { icon: "trophy-outline", title: "Achievements", route: "/achievements" },
                { icon: "bookmark-outline", title: "Saved Items", route: "/saved" },
                { icon: "cog-outline", title: "Settings", route: "/settings" },
                { icon: "shield-crown-outline", title: "Admin Portal", route: "/admin" },
              ].map((item) => (
                <Pressable
                  key={item.route}
                  onPress={() => {
                    triggerHaptic();
                    setProfileMenuOpen(false);
                    router.push(item.route as any);
                  }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    {
                      backgroundColor: pressed ? colors.surface2 : "transparent",
                      borderRadius: radius.sm,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name={item.icon as any} size={18} color={colors.muted} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>{item.title}</Text>
                </Pressable>
              ))}

              <div style={{ height: 1, backgroundColor: colors.border, margin: "6px 0" }} />

              {/* Sign Out Button */}
              <Pressable
                onPress={handleSignOut}
                style={({ pressed }) => [
                  styles.menuItem,
                  {
                    backgroundColor: pressed ? "rgba(239, 68, 68, 0.1)" : "transparent",
                    borderRadius: radius.sm,
                  },
                ]}
              >
                <MaterialCommunityIcons name="logout" size={18} color="#EF4444" />
                <Text style={[styles.menuItemText, { color: "#EF4444", fontWeight: "700" }]}>
                  Log Out
                </Text>
              </Pressable>
            </div>
          ) : null}
        </div>
      </div>

      {/* Spotlight Search Modal */}
      <WebSearchModal visible={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </header>
  );
}

const styles = StyleSheet.create({
  brandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
  } as any,
  brandLogoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 38,
    width: 280,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  searchText: {
    flex: 1,
    fontSize: 13,
  },
  kbdBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  kbdText: {
    fontSize: 10,
    fontWeight: "700",
  },
  navTab: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    height: 60,
    cursor: "pointer",
    position: "relative",
    gap: 3,
  } as any,
  navIconContainer: {
    position: "relative",
  },
  liveBadge: {
    position: "absolute",
    top: -6,
    right: -14,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },
  countBadge: {
    position: "absolute",
    top: -4,
    right: -10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  navTabLabel: {
    fontSize: 11,
  },
  activeUnderline: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  createActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.pill,
    cursor: "pointer",
  } as any,
  createActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  streakFlame: {
    fontSize: 14,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "800",
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  modePillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    cursor: "pointer",
  } as any,
  iconBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  iconBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  langPill: {
    height: 32,
    paddingHorizontal: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  } as any,
  langText: {
    fontSize: 11,
    fontWeight: "800",
  },
  avatarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 3,
    paddingRight: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  avatarImg: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  avatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: "800",
  },
  profileSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: radius.md,
    cursor: "pointer",
  } as any,
  summaryAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  summaryAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTextCol: {
    flex: 1,
    gap: 2,
  },
  summaryName: {
    fontSize: 14,
    fontWeight: "700",
  },
  summaryLink: {
    fontSize: 12,
    fontWeight: "500",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    cursor: "pointer",
  } as any,
  menuItemText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
