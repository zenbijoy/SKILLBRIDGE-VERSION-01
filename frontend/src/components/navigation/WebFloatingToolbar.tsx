import React, { useState, useEffect } from "react";
import {
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useWebLayoutStore } from "@/state/useWebLayoutStore";

export function WebFloatingToolbar() {
  const { colors, isDark } = useTheme();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    isNavbarVisible,
    toggleNavbar,
    isLeftSidebarVisible,
    toggleLeftSidebar,
    isFocusMode,
    toggleFocusMode,
  } = useWebLayoutStore();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleScrollToTop = () => {
    triggerHaptic();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (Platform.OS !== "web") return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 900,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      {/* Expanded Quick Options Menu */}
      {isExpanded ? (
        <div
          className="animate-slide-up"
          style={{
            backgroundColor: isDark ? "rgba(24, 24, 27, 0.95)" : "rgba(255, 255, 255, 0.96)",
            backdropFilter: "blur(14px)",
            borderRadius: 16,
            border: `1px solid ${colors.borderStrong}`,
            padding: "8px 6px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25)",
            marginBottom: 4,
          }}
        >
          {/* 1. Toggle Top Navbar (ন্যাপবার লুকান / দেখান) */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              toggleNavbar();
            }}
            style={({ pressed }) => [
              styles.toolBtn,
              {
                backgroundColor: !isNavbarVisible ? colors.primarySoft : pressed ? colors.surface2 : "transparent",
              },
            ]}
          >
            <MaterialCommunityIcons
              name={isNavbarVisible ? "dock-top" : "chevron-down"}
              size={18}
              color={!isNavbarVisible ? colors.primary : colors.text}
            />
            <Text style={[styles.toolLabel, { color: !isNavbarVisible ? colors.primary : colors.text }]}>
              {isNavbarVisible ? "Hide Navbar" : "Show Navbar"}
            </Text>
          </Pressable>

          {/* 2. Toggle Left Sidebar */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              toggleLeftSidebar();
            }}
            style={({ pressed }) => [
              styles.toolBtn,
              {
                backgroundColor: !isLeftSidebarVisible ? colors.primarySoft : pressed ? colors.surface2 : "transparent",
              },
            ]}
          >
            <MaterialCommunityIcons
              name={isLeftSidebarVisible ? "dock-left" : "menu"}
              size={18}
              color={!isLeftSidebarVisible ? colors.primary : colors.text}
            />
            <Text style={[styles.toolLabel, { color: !isLeftSidebarVisible ? colors.primary : colors.text }]}>
              {isLeftSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
            </Text>
          </Pressable>

          {/* 3. Focus / Zen Mode */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              toggleFocusMode();
            }}
            style={({ pressed }) => [
              styles.toolBtn,
              {
                backgroundColor: isFocusMode ? colors.primarySoft : pressed ? colors.surface2 : "transparent",
              },
            ]}
          >
            <MaterialCommunityIcons
              name={isFocusMode ? "fullscreen-exit" : "fullscreen"}
              size={18}
              color={isFocusMode ? colors.primary : colors.text}
            />
            <Text style={[styles.toolLabel, { color: isFocusMode ? colors.primary : colors.text }]}>
              {isFocusMode ? "Exit Zen Mode" : "Zen Mode"}
            </Text>
          </Pressable>

          {/* 4. Scroll to Top */}
          {showScrollTop ? (
            <Pressable
              onPress={handleScrollToTop}
              style={({ pressed }) => [
                styles.toolBtn,
                {
                  backgroundColor: pressed ? colors.surface2 : "transparent",
                },
              ]}
            >
              <MaterialCommunityIcons name="arrow-up" size={18} color={colors.text} />
              <Text style={[styles.toolLabel, { color: colors.text }]}>Top</Text>
            </Pressable>
          ) : null}
        </div>
      ) : null}

      {/* Floating Main Hub Toggle Button */}
      <Pressable
        onPress={() => {
          triggerHaptic();
          setIsExpanded((prev) => !prev);
        }}
        style={({ pressed }) => [
          styles.mainHubBtn,
          {
            backgroundColor: isExpanded ? colors.primary : isDark ? colors.surfaceElevated : "#FFFFFF",
            borderColor: colors.borderStrong,
            boxShadow: isDark ? "0 8px 20px rgba(0, 0, 0, 0.4)" : "0 4px 14px rgba(0, 0, 0, 0.12)",
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        accessibilityLabel="Display controls"
      >
        <MaterialCommunityIcons
          name={isExpanded ? "close" : "tune-vertical"}
          size={22}
          color={isExpanded ? "#FFFFFF" : colors.primary}
        />
      </Pressable>
    </div>
  );
}

const styles = StyleSheet.create({
  mainHubBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  } as any,
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    cursor: "pointer",
  } as any,
  toolLabel: {
    fontSize: 12,
    fontWeight: "600",
  } as any,
});
