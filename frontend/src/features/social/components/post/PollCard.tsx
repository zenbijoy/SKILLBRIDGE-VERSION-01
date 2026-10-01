import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import type { PostPoll } from "../../types";

interface PollCardProps {
  postId: string;
  poll: PostPoll;
  onVote: (optionId: string) => Promise<void>;
}

export function PollCard({ postId, poll, onVote }: PollCardProps) {
  const { colors } = useTheme();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasVoted = Boolean(poll.has_voted);
  const userVotedIds = poll.user_voted_options || [];
  const totalVotes = poll.total_votes || 0;

  const isExpired = poll.expires_at ? new Date(poll.expires_at) < new Date() : false;

  const handleCastVote = async () => {
    if (!selectedOptionId || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onVote(selectedOptionId);
      setSelectedOptionId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="poll" size={18} color={colors.primary} />
          <Text style={[styles.pollTag, { color: colors.primary }]}>Campus Poll</Text>
        </Row>
        {poll.is_anonymous && (
          <Row style={{ alignItems: "center", gap: 4 }}>
            <MaterialCommunityIcons name="incognito" size={14} color={colors.muted} />
            <Text style={[styles.anonText, { color: colors.muted }]}>Anonymous Voting</Text>
          </Row>
        )}
      </Row>

      <Text style={[styles.question, { color: colors.text }]}>{poll.question}</Text>

      {/* Options List */}
      <View style={styles.optionsList}>
        {poll.options.map((opt) => {
          const isVoted = userVotedIds.includes(opt.id);
          const isSelected = selectedOptionId === opt.id;
          const percentage = totalVotes > 0 ? Math.round((opt.votes_count / totalVotes) * 100) : 0;

          if (hasVoted || isExpired) {
            // Results Mode
            return (
              <View
                key={opt.id}
                style={[
                  styles.resultOption,
                  { borderColor: isVoted ? colors.primary : colors.border },
                  isVoted && { backgroundColor: `${colors.primary}10` },
                ]}
              >
                {/* Progress Fill Bar */}
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${Math.max(percentage, 3)}%`,
                      backgroundColor: isVoted ? `${colors.primary}30` : `${colors.border}60`,
                    },
                  ]}
                />

                <Row style={styles.resultRow}>
                  <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
                    {isVoted && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={16}
                        color={colors.primary}
                      />
                    )}
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: colors.text, fontWeight: isVoted ? "700" : "500" },
                      ]}
                      numberOfLines={2}
                    >
                      {opt.option_text}
                    </Text>
                  </Row>
                  <Text style={[styles.percentageText, { color: isVoted ? colors.primary : colors.muted }]}>
                    {percentage}%
                  </Text>
                </Row>
              </View>
            );
          }

          // Active Voting Mode
          return (
            <Pressable
              key={opt.id}
              onPress={() => setSelectedOptionId(opt.id)}
              style={[
                styles.selectableOption,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? `${colors.primary}10` : colors.bg,
                },
              ]}
            >
              <Row style={{ alignItems: "center", gap: 10 }}>
                <MaterialCommunityIcons
                  name={isSelected ? "radiobox-marked" : "radiobox-blank"}
                  size={18}
                  color={isSelected ? colors.primary : colors.muted}
                />
                <Text style={[styles.optionLabel, { color: colors.text }]}>{opt.option_text}</Text>
              </Row>
            </Pressable>
          );
        })}
      </View>

      {/* Footer / Vote Submit Button */}
      <Row style={styles.footer}>
        <Text style={[styles.metaInfo, { color: colors.muted }]}>
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
          {isExpired ? " · Final Results" : poll.expires_at ? ` · Closes ${new Date(poll.expires_at).toLocaleDateString()}` : " · Active"}
        </Text>

        {!hasVoted && !isExpired && (
          <Pressable
            disabled={!selectedOptionId || isSubmitting}
            onPress={handleCastVote}
            style={[
              styles.voteBtn,
              {
                backgroundColor: colors.primary,
                opacity: selectedOptionId && !isSubmitting ? 1 : 0.5,
              },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.voteBtnText}>Vote</Text>
            )}
          </Pressable>
        )}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    marginVertical: 8,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pollTag: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  anonText: {
    fontSize: 11,
  },
  question: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    marginBottom: 12,
  },
  optionsList: {
    gap: 8,
  },
  selectableOption: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultOption: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    minHeight: 44,
  },
  progressBar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
  },
  resultRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 1,
  },
  optionLabel: {
    fontSize: 14,
    flex: 1,
  },
  percentageText: {
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 8,
  },
  footer: {
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  metaInfo: {
    fontSize: 12,
  },
  voteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  voteBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
