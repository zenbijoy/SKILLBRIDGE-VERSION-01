import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/theme";

export interface WelcomeUIMockupProps {
  slideId: "discover" | "connect" | "level_up" | "launch" | string;
}

export function WelcomeUIMockup({ slideId }: WelcomeUIMockupProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.phoneFrame, { backgroundColor: isDark ? "#0D111A" : "#FFFFFF", borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)" }]}>
      {/* Top Phone Speaker / Status Bar */}
      <View style={styles.statusBar}>
        <Text style={[styles.timeText, { color: isDark ? "#A0AEC0" : "#718096" }]}>9:41</Text>
        <View style={styles.notch} />
        <View style={styles.statusIcons}>
          <Ionicons name="cellular" size={11} color={isDark ? "#A0AEC0" : "#718096"} />
          <Ionicons name="wifi" size={11} color={isDark ? "#A0AEC0" : "#718096"} />
          <Ionicons name="battery-full" size={13} color={isDark ? "#A0AEC0" : "#718096"} />
        </View>
      </View>

      {/* Screen Content Depending on Slide */}
      {slideId === "discover" && <HomeScreenPreview isDark={isDark} colors={colors} />}
      {slideId === "connect" && <LiveClassScreenPreview isDark={isDark} colors={colors} />}
      {slideId === "level_up" && <MaterialsQAScreenPreview isDark={isDark} colors={colors} />}
      {slideId === "launch" && <LeaderboardScreenPreview isDark={isDark} colors={colors} />}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. HOME SCREEN / DASHBOARD PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreenPreview({ isDark, colors }: { isDark: boolean; colors: any }) {
  return (
    <View style={styles.screenContent}>
      {/* Top Bar */}
      <View style={styles.appHeader}>
        <View>
          <Text style={[styles.appHeaderTitle, { color: colors.text }]}>SkillBridge</Text>
          <Text style={[styles.appHeaderSub, { color: colors.muted }]}>RUET Campus • Learn</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.streakBadge, { backgroundColor: isDark ? "rgba(234, 88, 12, 0.2)" : "#FFEDD5" }]}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#EA580C" }}>🔥 5 Days</Text>
          </View>
        </View>
      </View>

      {/* Welcome Greeting Banner */}
      <LinearGradient
        colors={isDark ? ["#1E293B", "#0F172A"] : ["#EEF2FF", "#E0E7FF"]}
        style={styles.greetingBanner}
      >
        <Text style={[styles.greetingText, { color: colors.text }]}>Hi, Alex! 👋</Text>
        <Text style={[styles.greetingSub, { color: colors.muted }]}>3 live peer sessions happening right now.</Text>
      </LinearGradient>

      {/* Feature Action Pills */}
      <View style={styles.actionRow}>
        <View style={[styles.actionPill, { backgroundColor: colors.primary }]}>
          <Ionicons name="videocam" size={12} color="#FFF" />
          <Text style={styles.actionPillTextWhite}>Live Rooms</Text>
        </View>
        <View style={[styles.actionPill, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
          <Ionicons name="book-outline" size={12} color={colors.text} />
          <Text style={[styles.actionPillText, { color: colors.text }]}>Notes Vault</Text>
        </View>
        <View style={[styles.actionPill, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
          <Ionicons name="help-circle-outline" size={12} color={colors.text} />
          <Text style={[styles.actionPillText, { color: colors.text }]}>Ask Doubts</Text>
        </View>
      </View>

      {/* Active Live Class Card */}
      <View style={[styles.previewCard, { backgroundColor: isDark ? "#1A2234" : "#F8FAFC", borderColor: isDark ? "#2D3748" : "#E2E8F0" }]}>
        <View style={styles.cardTopRow}>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>LIVE NOW</Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.muted }}>CSE-3101</Text>
        </View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Operating Systems & Virtual Memory</Text>
        <View style={styles.cardFooter}>
          <Text style={{ fontSize: 11, color: colors.muted }}>👤 Prof. M. Rahman • 28 online</Text>
          <View style={[styles.cardJoinBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.cardJoinText}>Join</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LIVE PEER LEARNING / VIDEO ROOM PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
function LiveClassScreenPreview({ isDark, colors }: { isDark: boolean; colors: any }) {
  return (
    <View style={styles.screenContent}>
      {/* Room Header */}
      <View style={[styles.roomHeader, { backgroundColor: isDark ? "#171F2F" : "#F1F5F9" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[styles.liveDot, { width: 7, height: 7 }]} />
          <Text style={[styles.roomTitle, { color: colors.text }]}>DSP & Digital Filters</Text>
        </View>
        <Text style={{ fontSize: 10, color: "#10B981", fontWeight: "700" }}>18 Students</Text>
      </View>

      {/* 4-Grid Video Tile Layout */}
      <View style={styles.videoGrid}>
        <View style={[styles.videoTile, { backgroundColor: "#1E293B" }]}>
          <Ionicons name="person" size={28} color="#94A3B8" />
          <View style={styles.videoTag}>
            <Text style={styles.videoTagText}>Prof. Karim (Host)</Text>
            <Ionicons name="mic" size={10} color="#10B981" />
          </View>
        </View>
        <View style={[styles.videoTile, { backgroundColor: "#0F172A" }]}>
          <Ionicons name="person" size={28} color="#64748B" />
          <View style={styles.videoTag}>
            <Text style={styles.videoTagText}>Sadia (Speaker)</Text>
            <Ionicons name="mic" size={10} color="#10B981" />
          </View>
        </View>
        <View style={[styles.videoTile, { backgroundColor: "#0F172A" }]}>
          <Ionicons name="person" size={28} color="#64748B" />
          <View style={styles.videoTag}>
            <Text style={styles.videoTagText}>Tanvir</Text>
            <Ionicons name="mic-off" size={10} color="#EF4444" />
          </View>
        </View>
        <View style={[styles.videoTile, { backgroundColor: "#1E293B", borderColor: colors.primary, borderWidth: 1 }]}>
          <Ionicons name="person" size={28} color={colors.primary} />
          <View style={styles.videoTag}>
            <Text style={[styles.videoTagText, { color: "#60A5FA" }]}>Alex (You)</Text>
            <Ionicons name="mic" size={10} color="#10B981" />
          </View>
        </View>
      </View>

      {/* Floating Call Action Bar */}
      <View style={styles.callControls}>
        <View style={[styles.controlBtn, { backgroundColor: "#10B981" }]}>
          <Ionicons name="mic" size={14} color="#FFF" />
        </View>
        <View style={[styles.controlBtn, { backgroundColor: "#3B82F6" }]}>
          <Ionicons name="videocam" size={14} color="#FFF" />
        </View>
        <View style={[styles.controlBtn, { backgroundColor: "#F59E0B" }]}>
          <MaterialCommunityIcons name="hand-back-right" size={14} color="#FFF" />
        </View>
        <View style={[styles.controlBtn, { backgroundColor: "#EF4444" }]}>
          <Ionicons name="call" size={14} color="#FFF" />
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CAMPUS Q&A & MATERIALS VAULT PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
function MaterialsQAScreenPreview({ isDark, colors }: { isDark: boolean; colors: any }) {
  return (
    <View style={styles.screenContent}>
      {/* Search Header */}
      <View style={[styles.mockSearch, { backgroundColor: isDark ? "#1A2234" : "#F1F5F9" }]}>
        <Ionicons name="search" size={13} color={colors.muted} />
        <Text style={{ fontSize: 11, color: colors.muted }}>Search verified solutions, PDFs...</Text>
      </View>

      {/* Question Card */}
      <View style={[styles.previewCard, { backgroundColor: isDark ? "#171F2F" : "#F8FAFC", borderColor: isDark ? "#2D3748" : "#E2E8F0" }]}>
        <View style={styles.cardTopRow}>
          <View style={[styles.badgePill, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#10B981" }}>✓ VERIFIED SOLUTION</Text>
          </View>
          <Text style={{ fontSize: 10, color: colors.muted }}>14m ago</Text>
        </View>

        <Text style={[styles.cardTitle, { color: colors.text, marginTop: 4 }]}>
          How to implement AVL Tree self-balancing rotations in C++?
        </Text>

        {/* Attached Document File */}
        <View style={[styles.fileAttachment, { backgroundColor: isDark ? "#0F172A" : "#EEF2FF" }]}>
          <Ionicons name="document-text" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text }} numberOfLines={1}>
              AVL_Rotations_Explained.pdf
            </Text>
            <Text style={{ fontSize: 9, color: colors.muted }}>1.8 MB • Downloaded 142 times</Text>
          </View>
          <Ionicons name="download-outline" size={14} color={colors.primary} />
        </View>

        <View style={[styles.cardFooter, { marginTop: 10 }]}>
          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "700" }}>▲ 48 Upvotes</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>18 Answers</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLUBS & LEADERBOARD PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
function LeaderboardScreenPreview({ isDark, colors }: { isDark: boolean; colors: any }) {
  return (
    <View style={styles.screenContent}>
      {/* Segment Switcher */}
      <View style={[styles.segmentContainer, { backgroundColor: isDark ? "#171F2F" : "#F1F5F9" }]}>
        <View style={[styles.segmentActive, { backgroundColor: colors.primary }]}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFF" }}>Leaderboard</Text>
        </View>
        <View style={styles.segmentInactive}>
          <Text style={{ fontSize: 11, color: colors.muted }}>Club Hub</Text>
        </View>
        <View style={styles.segmentInactive}>
          <Text style={{ fontSize: 11, color: colors.muted }}>Events</Text>
        </View>
      </View>

      {/* Leaderboard Ranks */}
      <View style={styles.rankList}>
        {/* 1st Place */}
        <View style={[styles.rankItem, { backgroundColor: isDark ? "#1A2234" : "#FFF7ED", borderColor: "#F59E0B", borderWidth: 1 }]}>
          <Text style={{ fontSize: 14 }}>🥇</Text>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>Nafis Fuad</Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>RUET CSE • Level 12</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#F59E0B" }}>2,450 XP</Text>
        </View>

        {/* 2nd Place (You) */}
        <View style={[styles.rankItem, { backgroundColor: isDark ? "#1A2234" : "#EEF2FF", borderColor: colors.primary, borderWidth: 1 }]}>
          <Text style={{ fontSize: 14 }}>🥈</Text>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Alex (You)</Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>RUET CSE • Level 10</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>2,180 XP</Text>
        </View>

        {/* 3rd Place */}
        <View style={[styles.rankItem, { backgroundColor: isDark ? "#171F2F" : "#F8FAFC", borderColor: isDark ? "#2D3748" : "#E2E8F0" }]}>
          <Text style={{ fontSize: 14 }}>🥉</Text>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>Sumaiya K.</Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>RUET EEE • Level 9</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>1,950 XP</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  phoneFrame: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  timeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  notch: {
    width: 60,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(128,128,128,0.2)",
  },
  statusIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  screenContent: {
    flex: 1,
  },
  appHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  appHeaderTitle: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  appHeaderSub: {
    fontSize: 10,
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  streakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  greetingBanner: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  greetingText: {
    fontSize: 14,
    fontWeight: "800",
  },
  greetingSub: {
    fontSize: 11,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  actionPillTextWhite: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  liveTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#EF4444",
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  cardJoinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardJoinText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  roomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  roomTitle: {
    fontSize: 11,
    fontWeight: "800",
  },
  videoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "space-between",
    marginVertical: 4,
  },
  videoTile: {
    width: "48%",
    height: 64,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  videoTag: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoTagText: {
    fontSize: 8,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  callControls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 6,
    paddingVertical: 4,
  },
  controlBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  mockSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fileAttachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  segmentContainer: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    marginBottom: 10,
  },
  segmentActive: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 5,
    borderRadius: 8,
  },
  segmentInactive: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 5,
  },
  rankList: {
    gap: 6,
  },
  rankItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
});
