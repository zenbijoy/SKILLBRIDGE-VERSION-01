import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Dashboard, Profile, Room } from "@/types";
import { useTheme, radius } from "@/theme";
import { useI18n } from "@/i18n";
import { triggerHaptic } from "@/components/ui";
import {
  CampusStats,
  MomentumWidget,
  StreakActivityWidget,
} from "./CampusWidgets";
import { UpcomingWidget, type UpcomingSummary } from "@/features/calendar";
import { PersonalizedHomeFeed } from "./PersonalizedHomeFeed";
import type { AudienceType } from "./PostComposerModal";

interface WebHomeBentoGridProps {
  dashboard?: Dashboard | null;
  me?: Profile | null;
  cachedProfile?: { id?: string; full_name?: string; avatar_url?: string | null; bio?: string | null } | null;
  upcomingSummary?: UpcomingSummary | null;
  upcomingLoading?: boolean;
  mode: "learn" | "teach";
  onOpenComposer: (opts?: {
    initialTag?: string;
    initialAudience?: AudienceType;
    openMediaImmediately?: boolean;
  }) => void;
  activeAnnouncements?: any[];
  dismissAnnouncement?: (id: string) => Promise<void>;
  showHomeFeed?: boolean;
}

export function WebHomeBentoGrid({
  dashboard,
  me,
  cachedProfile,
  upcomingSummary,
  upcomingLoading,
  mode,
  onOpenComposer,
  activeAnnouncements = [],
  dismissAnnouncement,
  showHomeFeed = true,
}: WebHomeBentoGridProps) {
  const { colors, isDark } = useTheme();
  const { t, language } = useI18n();

  const firstName =
    me?.full_name?.split(/\s+/)[0] ??
    cachedProfile?.full_name?.split(/\s+/)[0] ??
    "Learner";

  const stats = (dashboard?.stats as CampusStats) || {
    streakDays: 5,
    reputation: 1250,
    connections: 14,
    sessionsTaught: 6,
    sessionsAttended: 18,
  };

  const streakDays = stats.streakDays ?? 5;
  const urgentRoom = dashboard?.urgentRooms?.[0];
  const profileQuest = dashboard?.profileQuest;

  // Time-aware greeting
  const hour = new Date().getHours();
  const isBn = language === "bn";
  const greetingText = isBn
    ? hour < 12
      ? `শুভ সকাল, ${firstName}! 🌅`
      : hour < 17
      ? `শুভ অপরাহ্ন, ${firstName}! ☀️`
      : `শুভ সন্ধ্যা, ${firstName}! 🌆`
    : hour < 12
    ? `Good morning, ${firstName}! 🌅`
    : hour < 17
    ? `Good afternoon, ${firstName}! ☀️`
    : `Good evening, ${firstName}! 🌆`;

  // Fetch top 3 campus leaders for podium
  const leaderboardQuery = useQuery({
    queryKey: ["web-dashboard-podium"],
    queryFn: () =>
      api<{ leaders: (Profile & { reputation?: number })[] }>(
        "/gamification/leaderboard?category=reputation&window=weekly"
      ),
    staleTime: 60_000,
  });
  const topLeaders = (leaderboardQuery.data?.leaders || []).slice(0, 3);

  // Fetch open campus doubts
  const doubtsQuery = useQuery({
    queryKey: ["help-questions", "open", false],
    queryFn: () =>
      api<{ questions: any[] }>("/help/questions?status=open&mine=false&limit=2"),
    staleTime: 45_000,
  });
  const openDoubts = doubtsQuery.data?.questions || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      {/* ─────────────────────────────────────────────────────────────────────────
          1. TOP 3D HERO COMMAND CENTER (CYBER YELLOW / WARM AMBER + 3D CARDS)
      ───────────────────────────────────────────────────────────────────────── */}
      <section
        className="web-card-3d"
        style={{
          width: "100%",
          borderRadius: 22,
          padding: "26px 30px",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
          background: isDark
            ? "linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(30, 27, 75, 0.5) 100%)"
            : "linear-gradient(135deg, #FFFDF0 0%, #FEF9C3 40%, #FEF08A 85%, #FDE047 100%)",
          border: isDark
            ? "1px solid rgba(250, 204, 21, 0.3)"
            : "1px solid rgba(234, 179, 8, 0.45)",
          boxShadow: isDark
            ? "0 20px 40px -15px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(250, 204, 21, 0.2)"
            : "0 20px 45px -15px rgba(234, 179, 8, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
        }}
      >
        {/* Subtle Background Glow Spheres */}
        <div
          style={{
            position: "absolute",
            top: -60,
            right: 80,
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: isDark
              ? "radial-gradient(circle, rgba(234, 179, 8, 0.22) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(254, 240, 138, 0.8) 0%, transparent 70%)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        {/* Top Meta Header: Badge + Mode Switcher */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className="badge-3d-yellow"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 14px",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              <span>🚀</span>
              <span>Campus Academic & Skill Exchange</span>
            </span>

            <span
              className="badge-3d-emerald"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "#10B981",
                  boxShadow: "0 0 8px #10B981",
                }}
              />
              <span>18 Peers Online Now</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: isDark ? "#FACC15" : "#B45309",
                backgroundColor: isDark ? "rgba(250, 204, 21, 0.15)" : "rgba(255, 255, 255, 0.8)",
                padding: "4px 12px",
                borderRadius: 8,
                border: isDark ? "1px solid rgba(250, 204, 21, 0.3)" : "1px solid rgba(234, 179, 8, 0.3)",
              }}
            >
              {mode === "teach" ? "👨‍🏫 Mentor Mode" : "🎓 Learner Mode"}
            </span>
          </div>
        </div>

        {/* Hero Main Content Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 24,
          }}
        >
          {/* Left Text Block */}
          <div style={{ flex: "1 1 500px", minWidth: 280 }}>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: -0.8,
                margin: "0 0 8px 0",
                color: isDark ? "#F8FAFC" : "#1E293B",
                lineHeight: 1.25,
              }}
            >
              {greetingText}
            </h1>
            <p
              style={{
                fontSize: 15,
                color: isDark ? "#94A3B8" : "#475569",
                margin: "0 0 20px 0",
                lineHeight: 1.5,
                maxWidth: 620,
              }}
            >
              {isBn
                ? "আপনার ক্যাম্পাসের অল-ইন-ওয়ান কমান্ড সেন্টার। লাইভ ক্লাসরুমে যোগ দিন, জরুরি ডাউট সলভ করুন এবং সহপাঠীদের সাথে স্কিল এক্সচেঞ্জ করুন।"
                : "Your comprehensive campus command center. Join live peer study rooms, solve urgent doubts, and trade academic skills seamlessly."}
            </p>

            {/* Micro-Stats Pill Cluster */}
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 12,
                  backgroundColor: isDark ? "rgba(249, 115, 22, 0.2)" : "#FFFFFF",
                  border: isDark ? "1px solid rgba(249, 115, 22, 0.4)" : "1px solid #FDBA74",
                  boxShadow: "0 2px 8px rgba(249, 115, 22, 0.12)",
                }}
              >
                <span style={{ fontSize: 16 }}>🔥</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: isDark ? "#FB923C" : "#EA580C" }}>
                  {streakDays} Days Streak
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    backgroundColor: "#EA580C",
                    color: "#FFFFFF",
                    padding: "1px 6px",
                    borderRadius: 6,
                  }}
                >
                  +50 XP
                </span>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 12,
                  backgroundColor: isDark ? "rgba(234, 179, 8, 0.2)" : "#FFFFFF",
                  border: isDark ? "1px solid rgba(234, 179, 8, 0.4)" : "1px solid #FDE047",
                  boxShadow: "0 2px 8px rgba(234, 179, 8, 0.12)",
                }}
              >
                <span style={{ fontSize: 16 }}>⚡</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: isDark ? "#FACC15" : "#CA8A04" }}>
                  {(stats.reputation ?? 1250).toLocaleString()} XP
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#CBD5E1" : "#64748B" }}>
                  · Top 5% CSE
                </span>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 12,
                  backgroundColor: isDark ? "rgba(99, 102, 241, 0.2)" : "#FFFFFF",
                  border: isDark ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid #C7D2FE",
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.12)",
                }}
              >
                <span style={{ fontSize: 16 }}>👥</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: isDark ? "#818CF8" : "#4F46E5" }}>
                  {stats.connections ?? 14} Peers
                </span>
              </div>
            </div>
          </div>

          {/* Right SVG Illustration & Interactive 3D Quick-Action Launchers */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "flex-end",
              flex: "0 0 auto",
            }}
          >
            {/* Real SVG Academic & Skill Star Illustration */}
            <div
              className="animate-float-1"
              style={{
                width: 130,
                height: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="120" height="95" viewBox="0 0 120 95" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* 3D Polyhedron / Diamond Peak */}
                <defs>
                  <linearGradient id="yellowGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FEF08A" />
                    <stop offset="50%" stopColor="#FACC15" />
                    <stop offset="100%" stopColor="#EAB308" />
                  </linearGradient>
                  <linearGradient id="emeraldGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6EE7B7" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                  <linearGradient id="indigoGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#A5B4FC" />
                    <stop offset="100%" stopColor="#6366F1" />
                  </linearGradient>
                </defs>
                {/* Glowing Base Shadow */}
                <ellipse cx="60" cy="85" rx="45" ry="8" fill="rgba(234, 179, 8, 0.25)" filter="blur(4px)" />
                {/* Academic Summit Pyramid */}
                <polygon points="60,10 25,65 60,78" fill="url(#yellowGrad)" opacity="0.95" />
                <polygon points="60,10 95,65 60,78" fill="url(#emeraldGrad)" opacity="0.88" />
                <polygon points="60,78 25,65 60,60" fill="#CA8A04" opacity="0.6" />
                <polygon points="60,78 95,65 60,60" fill="#059669" opacity="0.7" />
                {/* Sparkling Stars */}
                <circle cx="20" cy="25" r="4" fill="#FACC15" />
                <circle cx="102" cy="30" r="3" fill="#6366F1" />
                <path d="M60 4L62 8L66 10L62 12L60 16L58 12L54 10L58 8Z" fill="#FFFFFF" />
                {/* Graduation / Diploma Crest */}
                <rect x="42" y="38" width="36" height="22" rx="4" fill="url(#indigoGrad)" transform="rotate(-6 60 49)" />
                <line x1="48" y1="46" x2="72" y2="46" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                <line x1="48" y1="52" x2="66" y2="52" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>

            {/* 4 Quick Action 3D Button Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 10,
                width: 320,
              }}
            >
              <button
                className="web-btn-emerald-3d"
                onClick={() => {
                  triggerHaptic();
                  router.push("/room/create" as any);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  border: "none",
                }}
              >
                <MaterialCommunityIcons name="door-open" size={17} color="#FFFFFF" />
                <span>Host Room</span>
              </button>

              <button
                className="web-btn-yellow-3d"
                onClick={() => {
                  triggerHaptic();
                  router.push("/help/questions" as any);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  border: "none",
                }}
              >
                <MaterialCommunityIcons name="help-circle-outline" size={17} color="#0F1015" />
                <span>Ask Doubt</span>
              </button>

              <button
                className="web-btn-indigo-3d"
                onClick={() => {
                  triggerHaptic();
                  router.push("/vault" as any);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  border: "none",
                }}
              >
                <MaterialCommunityIcons name="archive-outline" size={17} color="#FFFFFF" />
                <span>Notes Vault</span>
              </button>

              <button
                className="web-btn-rose-3d"
                onClick={() => {
                  triggerHaptic();
                  router.push("/quiz" as any);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  border: "none",
                }}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={17} color="#FFFFFF" />
                <span>Daily Quiz</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────────────
          2. ACTIVE ANNOUNCEMENTS (IF ANY)
      ───────────────────────────────────────────────────────────────────────── */}
      {activeAnnouncements.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          {activeAnnouncements.map((ann) => (
            <div
              key={ann.id}
              className="web-card-3d"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderRadius: 16,
                backgroundColor: isDark ? "#1E293B" : "#FEF3C7",
                border: isDark ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid #FDE68A",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                <span style={{ fontSize: 20 }}>📢</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: isDark ? "#F8FAFC" : "#78350F" }}>
                    {isBn ? ann.title_bn : ann.title_en}
                  </h4>
                  <p style={{ margin: "2px 0 0 0", fontSize: 13, color: isDark ? "#CBD5E1" : "#92400E" }}>
                    {isBn ? ann.body_bn : ann.body_en}
                  </p>
                </div>
              </div>

              {ann.is_dismissible && dismissAnnouncement ? (
                <button
                  onClick={() => dismissAnnouncement(ann.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 6,
                    color: isDark ? "#CBD5E1" : "#78350F",
                  }}
                >
                  <MaterialCommunityIcons name="close" size={18} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ─────────────────────────────────────────────────────────────────────────
          3. MAIN BENTO GRID: 2 COLUMNS (LEFT 64% / RIGHT 36%)
      ───────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 24,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* ─────────────────────────────────────────────────────────────
            LEFT COLUMN (PRIMARY STAGE - 64%)
        ───────────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: "1 1 60%",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* A. LIVE BROADCAST / URGENT CLASSROOM SPOTLIGHT CARD */}
          {urgentRoom ? (
            <div
              className="web-card-3d"
              style={{
                width: "100%",
                borderRadius: 20,
                padding: "20px 24px",
                boxSizing: "border-box",
                background: isDark
                  ? "linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 23, 42, 0.98) 100%)"
                  : "linear-gradient(135deg, #FFF1F2 0%, #FFFFFF 100%)",
                border: isDark ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid #FECDD3",
                boxShadow: isDark
                  ? "0 10px 30px rgba(239, 68, 68, 0.15)"
                  : "0 10px 30px rgba(244, 63, 94, 0.08)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Header: Pulsing Live Indicator + Equalizer Wave SVG */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: "#EF4444",
                      padding: "4px 10px",
                      borderRadius: 999,
                      color: "#FFFFFF",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: 0.8,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        backgroundColor: "#FFFFFF",
                        animation: "pulseLiveRing 1.5s infinite",
                      }}
                    />
                    <span>LIVE CLASS NOW</span>
                  </div>

                  {/* Live Equalizer Soundwave Bars */}
                  <div style={{ display: "flex", alignItems: "center", gap: 3, height: 18 }}>
                    <div className="eq-bar-1" style={{ width: 3, backgroundColor: "#EF4444", borderRadius: 2 }} />
                    <div className="eq-bar-2" style={{ width: 3, backgroundColor: "#EF4444", borderRadius: 2 }} />
                    <div className="eq-bar-3" style={{ width: 3, backgroundColor: "#EF4444", borderRadius: 2 }} />
                    <div className="eq-bar-4" style={{ width: 3, backgroundColor: "#EF4444", borderRadius: 2 }} />
                  </div>
                </div>

                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 6,
                    backgroundColor: isDark ? "rgba(59, 130, 246, 0.2)" : "#EFF6FF",
                    color: "#3B82F6",
                  }}
                >
                  #{urgentRoom.topic || "ACADEMICS"}
                </span>
              </div>

              {/* Title & Description */}
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: isDark ? "#F8FAFC" : "#0F172A",
                  margin: "0 0 8px 0",
                  lineHeight: 1.35,
                }}
              >
                {urgentRoom.title}
              </h3>
              {urgentRoom.description ? (
                <p
                  style={{
                    fontSize: 13,
                    color: isDark ? "#94A3B8" : "#64748B",
                    margin: "0 0 16px 0",
                    lineHeight: 1.45,
                  }}
                >
                  {urgentRoom.description}
                </p>
              ) : null}

              {/* Footer Row: Participant Count & 3D Join CTA */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 12,
                  borderTop: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #FFE4E6",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: colors.muted, fontSize: 13 }}>
                  <MaterialCommunityIcons name="account-group" size={17} color={colors.muted} />
                  <span>
                    {(urgentRoom as any).participants_count ?? urgentRoom.member_count ?? 12} students attending
                  </span>
                </div>

                <button
                  className="web-btn-yellow-3d"
                  onClick={() => {
                    triggerHaptic();
                    router.push(`/room/${urgentRoom.id}` as any);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 18px",
                    fontSize: 13,
                    border: "none",
                  }}
                >
                  <MaterialCommunityIcons name="video" size={16} />
                  <span>Join Live Broadcast</span>
                </button>
              </div>
            </div>
          ) : null}

          {/* B. URGENT CAMPUS DOUBTS & PEER ASSISTANCE 2-CARD ROW */}
          {openDoubts.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: colors.text }}>
                    Urgent Campus Doubts
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      backgroundColor: isDark ? "rgba(245, 158, 11, 0.2)" : "#FEF3C7",
                      color: "#D97706",
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}
                  >
                    Bounties Active
                  </span>
                </div>

                <button
                  onClick={() => {
                    triggerHaptic();
                    router.push("/help/questions" as any);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: colors.primary,
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  View All Doubts →
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 12,
                }}
              >
                {openDoubts.map((doubt) => (
                  <div
                    key={doubt.id}
                    className="web-card-3d"
                    onClick={() => {
                      triggerHaptic();
                      router.push(`/help/questions/${doubt.id}` as any);
                    }}
                    style={{
                      padding: 16,
                      borderRadius: 16,
                      backgroundColor: colors.surface,
                      border: `1px solid ${colors.border}`,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            backgroundColor: isDark ? "rgba(99, 102, 241, 0.2)" : "#EEF2FF",
                            color: "#6366F1",
                            padding: "2px 7px",
                            borderRadius: 6,
                          }}
                        >
                          {doubt.topic || "ACADEMICS"}
                        </span>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            backgroundColor: isDark ? "rgba(16, 185, 129, 0.2)" : "#ECFDF5",
                            color: "#10B981",
                            padding: "2px 7px",
                            borderRadius: 6,
                          }}
                        >
                          +30 XP Bounty
                        </span>
                      </div>
                      <h4
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          margin: 0,
                          color: colors.text,
                          lineHeight: 1.4,
                        }}
                      >
                        {doubt.title}
                      </h4>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: 8,
                        borderTop: `1px solid ${colors.border}`,
                        fontSize: 11.5,
                        color: colors.muted,
                      }}
                    >
                      <span>By {doubt.author?.full_name?.split(" ")[0] || "Student"}</span>
                      <span style={{ color: colors.primary, fontWeight: 700 }}>Answer Now →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* C. PERSONALIZED CAMPUS FEED & POSTS */}
          <div style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>📰</span>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: colors.text }}>
                  Campus Community Feed
                </h3>
              </div>

              <button
                onClick={() => onOpenComposer()}
                className="web-btn-yellow-3d"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  border: "none",
                }}
              >
                <MaterialCommunityIcons name="plus" size={15} />
                <span>Create Post</span>
              </button>
            </div>

            {showHomeFeed ? (
              <PersonalizedHomeFeed
                currentUser={me}
                onOpenComposer={onOpenComposer}
              />
            ) : (
              <div
                className="web-card-3d"
                style={{
                  padding: 30,
                  textAlign: "center",
                  borderRadius: 18,
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <MaterialCommunityIcons name="newspaper-variant-outline" size={32} color={colors.muted} />
                <p style={{ color: colors.muted, fontSize: 14, margin: "12px 0" }}>
                  Feed is currently hidden in your preferences.
                </p>
                <button
                  onClick={() => router.push("/dashboard/customize" as any)}
                  className="web-btn-yellow-3d"
                  style={{
                    padding: "8px 18px",
                    fontSize: 13,
                    border: "none",
                  }}
                >
                  Customize Dashboard
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            RIGHT COLUMN (SIDEBAR BENTO STAGE - 36%)
        ───────────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: "1 1 36%",
            minWidth: 320,
            maxWidth: 420,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* 1. CAMPUS MOMENTUM 2x2 BENTO TILES */}
          <div
            className="web-card-3d"
            style={{
              padding: 20,
              borderRadius: 20,
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 17 }}>🏆</span>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: colors.text }}>
                  Campus Momentum
                </h3>
              </div>
              <button
                onClick={() => {
                  triggerHaptic();
                  router.push("/leaderboard" as any);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: colors.primary,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Full Stats →
              </button>
            </div>

            <MomentumWidget stats={stats} />
          </div>

          {/* 2. 7-DAY STREAK & TIME MATRIX */}
          <div className="web-card-3d" style={{ borderRadius: 20 }}>
            <StreakActivityWidget streakDays={streakDays} />
          </div>

          {/* 3. TODAY'S CLASS & MENTORSHIP TIMETABLE */}
          <div className="web-card-3d" style={{ borderRadius: 20 }}>
            <UpcomingWidget
              summary={upcomingSummary}
              isLoading={upcomingLoading}
            />
          </div>

          {/* 4. CAMPUS LEADERBOARD TOP 3 PODIUM */}
          <div
            className="web-card-3d"
            style={{
              padding: 20,
              borderRadius: 20,
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 17 }}>🥇</span>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: colors.text }}>
                  Weekly Top Scholars
                </h3>
              </div>
              <button
                onClick={() => {
                  triggerHaptic();
                  router.push("/leaderboard" as any);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: colors.primary,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Leaderboard →
              </button>
            </div>

            {/* Top 3 Scholars List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(topLeaders.length > 0
                ? topLeaders
                : [
                    { id: "1", full_name: "Fahim Ahmed", reputation: 4850, avatar_url: null },
                    { id: "2", full_name: "Nabila Tabassum", reputation: 4210, avatar_url: null },
                    { id: "3", full_name: "Tanvir Hasan", reputation: 3980, avatar_url: null },
                  ]
              ).map((leader, idx) => {
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
                const medalBg =
                  idx === 0
                    ? isDark ? "rgba(234, 179, 8, 0.2)" : "#FEF9C3"
                    : idx === 1
                    ? isDark ? "rgba(148, 163, 184, 0.2)" : "#F1F5F9"
                    : isDark ? "rgba(217, 119, 6, 0.2)" : "#FFEDD5";

                return (
                  <div
                    key={leader.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 12,
                      backgroundColor: medalBg,
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{medal}</span>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: colors.primarySoft,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 12,
                          color: colors.primary,
                        }}
                      >
                        {(leader.full_name?.[0] || "U").toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>
                          {leader.full_name}
                        </div>
                        <div style={{ fontSize: 11, color: colors.muted }}>CSE Department</div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: colors.primary }}>
                        {(leader.reputation ?? 3500).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: colors.muted }}>XP</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. PROFILE QUEST (IF INCOMPLETE) */}
          {profileQuest && profileQuest.completionPercent < 100 ? (
            <div
              className="web-card-3d"
              style={{
                padding: 18,
                borderRadius: 20,
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: colors.text }}>
                  Complete Profile Quest
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    backgroundColor: colors.primarySoft,
                    color: colors.primary,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  {profileQuest.completionPercent}%
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
                Add your verified university skills and bio to earn +100 bonus reputation XP.
              </p>
              <div
                style={{
                  height: 6,
                  backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${profileQuest.completionPercent}%`,
                    backgroundColor: colors.primary,
                    borderRadius: 3,
                  }}
                />
              </div>
              <button
                onClick={() => router.push("/(auth)/onboarding" as any)}
                className="web-btn-yellow-3d"
                style={{
                  marginTop: 4,
                  padding: "8px 14px",
                  fontSize: 12,
                  border: "none",
                }}
              >
                Finish Setup (+100 XP)
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
