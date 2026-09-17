import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Profile, Room, Session } from "@/types";
import { Button, Card, H2, Muted, Row, SectionHeader, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { RoomQABoard } from "../RoomQABoard";

type RoomLearnViewProps = {
  room: Room;
  sessions: Session[];
  teachingRequests?: { id: string; volunteer: Profile; status: string }[];
  isOwner?: boolean;
  isMember?: boolean;
  canStartLive?: boolean;
  onAcceptVolunteer?: (id: string) => void;
  onRejectVolunteer?: (id: string) => void;
  onVolunteer?: () => void;
};

export function RoomLearnView({
  room,
  sessions,
  teachingRequests = [],
  isOwner,
  isMember,
  canStartLive,
  onAcceptVolunteer,
  onRejectVolunteer,
  onVolunteer,
}: RoomLearnViewProps) {
  const { colors } = useTheme();
  const [activeSubTab, setActiveSubTab] = useState<"sessions" | "qa">("sessions");

  const activeLiveSession = sessions.find((s) => s.status === "live");
  const nextSession = sessions.find((s) => s.status === "scheduled" || s.status === "draft");

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Sub-navigation tabs: Sessions vs Q&A */}
      <Row style={[s.subTabsRow, { backgroundColor: colors.surface2 }]}>
        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveSubTab("sessions");
          }}
          style={[
            s.subTabBtn,
            activeSubTab === "sessions" && [s.subTabBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <MaterialCommunityIcons
            name="calendar-clock"
            size={16}
            color={activeSubTab === "sessions" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              s.subTabBtnText,
              { color: activeSubTab === "sessions" ? colors.primary : colors.muted, fontWeight: activeSubTab === "sessions" ? "800" : "600" },
            ]}
          >
            Sessions & Classes
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveSubTab("qa");
          }}
          style={[
            s.subTabBtn,
            activeSubTab === "qa" && [s.subTabBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <MaterialCommunityIcons
            name="help-circle-outline"
            size={16}
            color={activeSubTab === "qa" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              s.subTabBtnText,
              { color: activeSubTab === "qa" ? colors.primary : colors.muted, fontWeight: activeSubTab === "qa" ? "800" : "600" },
            ]}
          >
            Q&A Board
          </Text>
        </Pressable>
      </Row>

      {activeSubTab === "sessions" ? (
        <View style={{ gap: 12 }}>
          {/* Live Session Active Banner */}
          {activeLiveSession ? (
            <View style={[s.liveCard, { backgroundColor: `${colors.danger}12`, borderColor: colors.danger }]}>
              <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                <Row style={{ alignItems: "center", gap: 8 }}>
                  <View style={[s.pulseDot, { backgroundColor: colors.danger }]} />
                  <Text style={[s.liveTitle, { color: colors.danger }]}>Live Classroom In Progress</Text>
                </Row>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    router.push(`/live/${room.id}` as any);
                  }}
                  style={[s.joinClassBtn, { backgroundColor: colors.danger }]}
                >
                  <Text style={s.joinClassBtnText}>Join Class →</Text>
                </Pressable>
              </Row>
            </View>
          ) : canStartLive ? (
            <Pressable
              onPress={() => {
                triggerHaptic();
                router.push(`/live/${room.id}` as any);
              }}
              style={[s.startClassCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Row style={{ alignItems: "center", gap: 12 }}>
                <View style={[s.startIcon, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="video-plus-outline" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.startTitle, { color: colors.text }]}>Host a Live Classroom</Text>
                  <Text style={[s.startSub, { color: colors.muted }]}>
                    Start an interactive video & screen-sharing lecture for this room.
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
              </Row>
            </Pressable>
          ) : null}

          {/* Next Upcoming Session */}
          {nextSession ? (
            <View style={[s.nextSessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.sectionTag, { color: colors.primary }]}>NEXT UPCOMING SESSION</Text>
                <View style={[s.modePill, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[s.modePillText, { color: colors.primary }]}>{nextSession.mode.toUpperCase()}</Text>
                </View>
              </Row>

              <Text style={[s.sessionTitle, { color: colors.text }]}>{room.title} Study Session</Text>
              <Text style={[s.sessionTime, { color: colors.muted }]}>
                {new Date(nextSession.starts_at).toLocaleDateString()} ·{" "}
                {new Date(nextSession.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>

              {nextSession.campus_location && (
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="map-marker-outline" size={15} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{nextSession.campus_location}</Text>
                </Row>
              )}
            </View>
          ) : (
            <View style={[s.emptySessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={32} color={colors.muted} />
              <Text style={[s.emptySessionTitle, { color: colors.text }]}>No upcoming live sessions</Text>
              <Text style={[s.emptySessionSub, { color: colors.muted }]}>
                Sessions scheduled by teachers or room leaders will appear here.
              </Text>
              {onVolunteer && (
                <Pressable
                  onPress={onVolunteer}
                  style={[s.volunteerBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                >
                  <Text style={[s.volunteerBtnText, { color: colors.primary }]}>Volunteer to Teach</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Pending Volunteer Requests (Owner View) */}
          {isOwner && teachingRequests.length > 0 ? (
            <View style={s.teachingRequestsSection}>
              <SectionHeader title={`Teaching Volunteers (${teachingRequests.length})`} />
              {teachingRequests.map((req) => (
                <View key={req.id} style={[s.requestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Row style={{ alignItems: "center", gap: 10 }}>
                    <View style={[s.reqAvatar, { backgroundColor: colors.primarySoft }]}>
                      <Text style={{ color: colors.primary, fontWeight: "900" }}>
                        {req.volunteer.full_name?.[0] || "U"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.reqName, { color: colors.text }]}>{req.volunteer.full_name}</Text>
                      <Text style={[s.reqSub, { color: colors.muted }]}>@{req.volunteer.username}</Text>
                    </View>
                    <Row style={{ gap: 6 }}>
                      {onAcceptVolunteer && (
                        <Pressable
                          onPress={() => onAcceptVolunteer(req.id)}
                          style={[s.actionPill, { backgroundColor: colors.primary }]}
                        >
                          <Text style={s.actionPillText}>Approve</Text>
                        </Pressable>
                      )}
                      {onRejectVolunteer && (
                        <Pressable
                          onPress={() => onRejectVolunteer(req.id)}
                          style={[s.actionPill, { backgroundColor: colors.surface2 }]}
                        >
                          <Text style={[s.actionPillText, { color: colors.muted }]}>Decline</Text>
                        </Pressable>
                      )}
                    </Row>
                  </Row>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        /* Q&A Board Tab */
        <RoomQABoard roomId={room.id} isMember={Boolean(isMember ?? isOwner)} />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 12,
  },
  subTabsRow: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.md,
    gap: 4,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  subTabBtnActive: {
    borderWidth: 1,
  },
  subTabBtnText: {
    fontSize: 12,
  },
  liveCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  liveTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  joinClassBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  joinClassBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  startClassCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  startIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  startTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  startSub: {
    fontSize: 12,
  },
  nextSessionCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  sectionTag: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  modePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  modePillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  sessionTime: {
    fontSize: 13,
  },
  emptySessionCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  emptySessionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptySessionSub: {
    fontSize: 12,
    textAlign: "center",
  },
  volunteerBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  volunteerBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  teachingRequestsSection: {
    marginTop: 8,
    gap: 8,
  },
  requestCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  reqAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  reqName: {
    fontSize: 13,
    fontWeight: "700",
  },
  reqSub: {
    fontSize: 11,
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  actionPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
