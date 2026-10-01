import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, Pill } from "@/components/ui";
import type { PostOpportunityMetadata } from "../../types";

interface OpportunityCardProps {
  opportunity: PostOpportunityMetadata;
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const { colors } = useTheme();

  const handleApply = () => {
    if (opportunity.link) {
      Linking.openURL(opportunity.link).catch(() => {});
    }
  };

  const formattedDeadline = React.useMemo(() => {
    if (!opportunity.deadline) return null;
    try {
      const d = new Date(opportunity.deadline);
      return `Deadline: ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    } catch {
      return `Deadline: ${opportunity.deadline}`;
    }
  }, [opportunity.deadline]);

  return (
    <View style={[styles.card, { borderColor: "#6366F1", backgroundColor: colors.surface }]}>
      <Row style={styles.topRow}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="briefcase-outline" size={18} color="#6366F1" />
          <Text style={styles.headerLabel}>Campus Opportunity</Text>
        </Row>
        <Pill tone="primary">
          {opportunity.type ? opportunity.type.toUpperCase() : "OPPORTUNITY"}
        </Pill>
      </Row>

      <Text style={[styles.title, { color: colors.text }]}>{opportunity.title}</Text>
      <Text style={[styles.orgName, { color: colors.primary }]}>{opportunity.organization}</Text>

      <Row style={styles.metaRow}>
        <Row style={{ alignItems: "center", gap: 4 }}>
          <MaterialCommunityIcons
            name={opportunity.is_remote ? "laptop" : "map-marker-outline"}
            size={14}
            color={colors.muted}
          />
          <Text style={[styles.metaText, { color: colors.muted }]}>
            {opportunity.is_remote ? "Remote" : opportunity.location}
          </Text>
        </Row>

        {formattedDeadline && (
          <Row style={{ alignItems: "center", gap: 4 }}>
            <MaterialCommunityIcons name="calendar-clock" size={14} color="#F59E0B" />
            <Text style={[styles.metaText, { color: "#F59E0B" }]}>{formattedDeadline}</Text>
          </Row>
        )}
      </Row>

      {opportunity.tags && opportunity.tags.length > 0 && (
        <Row style={styles.tagsRow}>
          {opportunity.tags.map((tag, idx) => (
            <View key={idx} style={[styles.tagPill, { backgroundColor: `${colors.primary}15` }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
            </View>
          ))}
        </Row>
      )}

      {opportunity.link && (
        <Pressable
          onPress={handleApply}
          style={[styles.applyBtn, { backgroundColor: "#6366F1" }]}
        >
          <Text style={styles.applyBtnText}>Apply Now</Text>
          <MaterialCommunityIcons name="open-in-new" size={16} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 14,
    marginVertical: 8,
  },
  topRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6366F1",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  orgName: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 8,
  },
  metaRow: {
    gap: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  tagsRow: {
    flexWrap: "wrap",
    gap: 6,
    marginVertical: 6,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: 8,
  },
  applyBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
