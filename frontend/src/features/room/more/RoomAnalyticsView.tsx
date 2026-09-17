import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { RoomAnalytics } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

type RoomAnalyticsViewProps = {
  visible: boolean;
  roomId: string;
  roomTitle: string;
  onClose: () => void;
};

export function RoomAnalyticsView({
  visible,
  roomId,
  roomTitle,
  onClose,
}: RoomAnalyticsViewProps) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<RoomAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<RoomAnalytics>(`/rooms/${roomId}/analytics`);
      setAnalytics(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchAnalytics();
    }
  }, [visible, roomId]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.divider }]}>
          <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
            <View style={[s.iconBox, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="chart-box-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={1}>
                Room Insights
              </Text>
              <Text style={[s.headerSub, { color: colors.muted }]} numberOfLines={1}>
                {roomTitle} · Engagement & Health
              </Text>
            </View>
          </Row>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onClose();
            }}
            hitSlop={8}
            style={[s.closeBtn, { backgroundColor: colors.surface2 }]}
          >
            <MaterialCommunityIcons name="close" size={18} color={colors.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[s.centerText, { color: colors.muted }]}>Gathering room metrics...</Text>
          </View>
        ) : error ? (
          <View style={s.centerBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={32} color={colors.danger} />
            <Text style={[s.centerText, { color: colors.danger }]}>{error}</Text>
            <Pressable
              onPress={fetchAnalytics}
              style={[s.retryBtn, { backgroundColor: colors.primarySoft }]}
            >
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>Retry</Text>
            </Pressable>
          </View>
        ) : analytics ? (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* Overview Grid */}
            <Text style={[s.sectionTitle, { color: colors.muted }]}>7-DAY ENGAGEMENT</Text>
            <View style={s.grid}>
              <View style={[s.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.primary} />
                  <Text style={[s.metricLabel, { color: colors.muted }]}>Active (7d)</Text>
                </Row>
                <Text style={[s.metricValue, { color: colors.text }]}>{analytics.active_members_7d}</Text>
                <Text style={[s.metricSub, { color: colors.muted }]}>
                  {analytics.active_members_30d} active this month
                </Text>
              </View>

              <View style={[s.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="post-outline" size={16} color={colors.info} />
                  <Text style={[s.metricLabel, { color: colors.muted }]}>Posts (7d)</Text>
                </Row>
                <Text style={[s.metricValue, { color: colors.text }]}>{analytics.posts_count_7d}</Text>
                <Text style={[s.metricSub, { color: colors.muted }]}>Discussions & updates</Text>
              </View>

              <View style={[s.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="chat-outline" size={16} color={colors.accent} />
                  <Text style={[s.metricLabel, { color: colors.muted }]}>Messages (7d)</Text>
                </Row>
                <Text style={[s.metricValue, { color: colors.text }]}>{analytics.messages_count_7d}</Text>
                <Text style={[s.metricSub, { color: colors.muted }]}>Across all channels</Text>
              </View>

              <View style={[s.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="help-circle-outline" size={16} color={colors.warning} />
                  <Text style={[s.metricLabel, { color: colors.muted }]}>Questions</Text>
                </Row>
                <Text style={[s.metricValue, { color: colors.text }]}>{analytics.questions_count_7d}</Text>
                <Text style={[s.metricSub, { color: colors.muted }]}>
                  {Math.round((analytics.solved_questions_rate || 0) * 100)}% resolution rate
                </Text>
              </View>
            </View>

            {/* Health indicators */}
            <Text style={[s.sectionTitle, { color: colors.muted, marginTop: 16 }]}>ROOM HEALTH</Text>
            <View style={[s.healthCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.healthRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.healthLabel, { color: colors.text }]}>30-Day Retention</Text>
                  <Text style={[s.healthSub, { color: colors.muted }]}>
                    Members returning after 30 days
                  </Text>
                </View>
                <Text style={[s.healthValue, { color: colors.primary }]}>
                  {Math.round((analytics.retention_rate_30d || 0) * 100)}%
                </Text>
              </View>

              <View style={[s.divider, { backgroundColor: colors.divider }]} />

              <View style={s.healthRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.healthLabel, { color: colors.text }]}>Q&A Resolution Efficiency</Text>
                  <Text style={[s.healthSub, { color: colors.muted }]}>
                    Academic doubts answered with verified solution
                  </Text>
                </View>
                <Text style={[s.healthValue, { color: colors.success }]}>
                  {Math.round((analytics.solved_questions_rate || 0) * 100)}%
                </Text>
              </View>
            </View>

            {/* Top Contributors */}
            <Text style={[s.sectionTitle, { color: colors.muted, marginTop: 16 }]}>
              TOP PEER CONTRIBUTORS
            </Text>
            <View style={[s.contributorsList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {analytics.top_contributors && analytics.top_contributors.length > 0 ? (
                analytics.top_contributors.map((c, idx) => (
                  <View
                    key={c.user_id}
                    style={[
                      s.contributorRow,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                    ]}
                  >
                    <View style={[s.rankBadge, { backgroundColor: idx === 0 ? "#F59E0B20" : colors.surface2 }]}>
                      <Text
                        style={[
                          s.rankText,
                          { color: idx === 0 ? "#F59E0B" : colors.muted },
                        ]}
                      >
                        #{idx + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[s.contributorName, { color: colors.text }]} numberOfLines={1}>
                        {c.full_name}
                      </Text>
                      <Text style={[s.contributorSub, { color: colors.muted }]}>
                        Activity & peer help score
                      </Text>
                    </View>
                    <View style={[s.scoreBadge, { backgroundColor: colors.primarySoft }]}>
                      <MaterialCommunityIcons name="star-outline" size={14} color={colors.primary} />
                      <Text style={[s.scoreText, { color: colors.primary }]}>{c.score}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={{ padding: 18, alignItems: "center" }}>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>No contributor data yet</Text>
                </View>
              )}
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 11,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  centerText: {
    fontSize: 13,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    width: "48%",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  metricSub: {
    fontSize: 10,
  },
  healthCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  healthLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  healthSub: {
    fontSize: 11,
    marginTop: 2,
  },
  healthValue: {
    fontSize: 18,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  contributorsList: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  contributorRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 11,
    fontWeight: "900",
  },
  contributorName: {
    fontSize: 13,
    fontWeight: "700",
  },
  contributorSub: {
    fontSize: 10,
  },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
