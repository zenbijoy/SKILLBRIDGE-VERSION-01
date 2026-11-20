import React, { ReactNode, useEffect } from "react";
import {
  View,
  useWindowDimensions,
  Platform,
  StyleSheet,
} from "react-native";
import { usePathname } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { useWebLayoutStore } from "@/state/useWebLayoutStore";
import { WebHeader } from "./WebHeader";
import { WebLeftSidebar } from "./WebLeftSidebar";
import { WebRightSidebar } from "./WebRightSidebar";
import { WebFloatingToolbar } from "./WebFloatingToolbar";

interface WebResponsiveShellProps {
  children: ReactNode;
}

export function WebResponsiveShell({ children }: WebResponsiveShellProps) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { colors, isDark } = useTheme();
  const { session } = useAuth();

  const {
    isNavbarVisible,
    toggleNavbar,
    isLeftSidebarVisible,
    isRightSidebarVisible,
  } = useWebLayoutStore();

  // Global Alt+N keyboard shortcut to hide/show navbar
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        toggleNavbar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleNavbar]);

  // If running on native iOS or Android, pass through directly
  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  // Full-screen immersive routes (e.g. video/audio calls, live room broadcast)
  const isImmersiveRoute =
    pathname.startsWith("/live") ||
    pathname.startsWith("/call") ||
    pathname.startsWith("/broadcast");

  if (isImmersiveRoute) {
    return (
      <View style={[styles.fullRoot, { backgroundColor: colors.bg }]}>
        {children}
      </View>
    );
  }

  // Auth / Onboarding routes
  const isAuthRoute =
    pathname.startsWith("/(auth)") ||
    pathname.startsWith("/auth") ||
    !session;

  if (isAuthRoute) {
    return (
      <View style={[styles.authRoot, { backgroundColor: colors.bg }]}>
        <View style={styles.authContainer}>
          {children}
        </View>
      </View>
    );
  }

  // Breakpoints:
  // Desktop Widescreen: >= 1260px (3 Columns: Left Sidebar + Center + Right Sidebar)
  // Laptop: 1000px - 1259px (2 Columns: Left Sidebar + Center)
  // Tablet: 768px - 999px (1 Column Centered with Web Header)
  // Mobile Web: < 768px (Mobile Web View)
  const showLeftSidebar = width >= 1000;
  const showRightSidebar = width >= 1260;
  const isDesktopOrTablet = width >= 768;

  // Decide center content width depending on page type
  // Wide pages like rooms, discover, tools, calendar, dashboard can breathe up to 1280px
  // Reading/feed pages look best at 880px - 940px for comfortable desktop typography
  const isWidePage =
    pathname.includes("rooms") ||
    pathname.includes("discover") ||
    pathname.includes("tools") ||
    pathname.includes("schedule") ||
    pathname.includes("calendar") ||
    pathname.includes("vault") ||
    pathname.includes("leaderboard") ||
    pathname.includes("clubs") ||
    pathname.includes("quiz") ||
    pathname === "/" ||
    pathname === "/(tabs)" ||
    pathname === "/(tabs)/index";

  const centerMaxWidth = showRightSidebar && isRightSidebarVisible
    ? isWidePage
      ? 1160
      : 880
    : showLeftSidebar && isLeftSidebarVisible
    ? isWidePage
      ? 1260
      : 920
    : isWidePage
    ? 1400
    : 980;

  return (
    <div
      className="web-mesh-canvas"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
        backgroundColor: colors.bg,
      }}
    >
      {/* 1. Sticky Web Top Header or Floating Restore Pill */}
      {isDesktopOrTablet ? (
        isNavbarVisible ? (
          <WebHeader />
        ) : (
          <div
            className="animate-slide-down"
            style={{
              position: "fixed",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 999,
              display: "flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: isDark ? "rgba(24, 24, 27, 0.94)" : "rgba(255, 255, 255, 0.96)",
              backdropFilter: "blur(14px)",
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 999,
              padding: "7px 18px",
              boxShadow: isDark
                ? "0 10px 30px rgba(0, 0, 0, 0.5)"
                : "0 8px 24px rgba(0, 0, 0, 0.12)",
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={toggleNavbar}
            title="Show Navigation / ন্যাপবার আনুন (Alt+N)"
          >
            <MaterialCommunityIcons name="chevron-down" size={18} color={colors.primary} />
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
              Show Navbar / ন্যাপবার আনুন
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.primary,
                backgroundColor: colors.primarySoft,
                padding: "2px 7px",
                borderRadius: 6,
                letterSpacing: 0.5,
              }}
            >
              Alt+N
            </span>
          </div>
        )
      ) : null}

      {/* 2. Main Content Body with Responsive 3-Column Layout */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-start",
          width: "100%",
          flex: 1,
          boxSizing: "border-box",
        }}
      >
        {/* Left Sticky Sidebar */}
        {showLeftSidebar && isLeftSidebarVisible ? <WebLeftSidebar /> : null}

        {/* Center Main Stage Content */}
        <main
          style={{
            flex: 1,
            width: "100%",
            maxWidth: centerMaxWidth,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: isNavbarVisible ? "calc(100vh - 60px)" : "100vh",
            boxSizing: "border-box",
            padding: isDesktopOrTablet
              ? isNavbarVisible
                ? "16px 20px 48px 20px"
                : "36px 20px 48px 20px"
              : "0",
            transition: "max-width 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {children}
        </main>

        {/* Right Sticky Sidebar */}
        {showRightSidebar && isRightSidebarVisible ? <WebRightSidebar /> : null}
      </div>

      {/* 3. Floating Speed-dial Toolbar (Display Controls, Top Scroll, Zen Mode) */}
      <WebFloatingToolbar />
    </div>
  );
}

const styles = StyleSheet.create({
  fullRoot: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  authRoot: {
    flex: 1,
    width: "100%",
    minHeight: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  authContainer: {
    width: "100%",
    maxWidth: 520,
    flex: 1,
  },
});
