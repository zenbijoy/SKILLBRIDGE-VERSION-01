import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Switch, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { OPPORTUNITY_TYPES } from "../../constants";
import type { PostOpportunityMetadata } from "../../types";

interface OpportunityBuilderProps {
  data: PostOpportunityMetadata;
  onChange: (data: PostOpportunityMetadata) => void;
  onRemove: () => void;
}

export function OpportunityBuilder({ data, onChange, onRemove }: OpportunityBuilderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderColor: "#6366F1", backgroundColor: colors.surface }]}>
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="briefcase-outline" size={18} color="#6366F1" />
          <Text style={styles.title}>Post an Opportunity</Text>
        </Row>
        <Pressable onPress={onRemove} hitSlop={6}>
          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      </Row>

      {/* Opportunity Type Selector Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typesScroll}>
        <Row style={{ gap: 6 }}>
          {OPPORTUNITY_TYPES.map((t) => {
            const isSelected = data.type === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => {
                  triggerHaptic("selection");
                  onChange({ ...data, type: t.value as any });
                }}
                style={[
                  styles.typePill,
                  { borderColor: isSelected ? "#6366F1" : colors.border },
                  isSelected && { backgroundColor: "#6366F120" },
                ]}
              >
                <Text
                  style={[
                    styles.typePillText,
                    { color: isSelected ? "#6366F1" : colors.text, fontWeight: isSelected ? "700" : "500" },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </ScrollView>

      {/* Title */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Role / Title (e.g. Software Engineer Intern)"
        placeholderTextColor={colors.muted}
        value={data.title}
        onChangeText={(text) => onChange({ ...data, title: text })}
      />

      {/* Organization */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Company or Organization (e.g. Google, Brain Station 23)"
        placeholderTextColor={colors.muted}
        value={data.organization}
        onChangeText={(text) => onChange({ ...data, organization: text })}
      />

      {/* Location & Deadline */}
      <Row style={{ gap: 10 }}>
        <TextInput
          style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
          placeholder={data.is_remote ? "Remote" : "Location (e.g. Dhaka)"}
          placeholderTextColor={colors.muted}
          value={data.is_remote ? "Remote" : data.location}
          onChangeText={(text) => onChange({ ...data, location: text })}
          editable={!data.is_remote}
        />
        <TextInput
          style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
          placeholder="Deadline (YYYY-MM-DD)"
          placeholderTextColor={colors.muted}
          value={data.deadline || ""}
          onChangeText={(text) => onChange({ ...data, deadline: text })}
        />
      </Row>

      {/* Application Link */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Application URL or Career Portal Link"
        placeholderTextColor={colors.muted}
        value={data.link || ""}
        onChangeText={(text) => onChange({ ...data, link: text })}
      />

      {/* Remote Toggle */}
      <Row style={styles.toggleRow}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="laptop" size={18} color="#6366F1" />
          <Text style={[styles.toggleText, { color: colors.text }]}>Remote Opportunity</Text>
        </Row>
        <Switch
          value={data.is_remote}
          onValueChange={(val) =>
            onChange({ ...data, is_remote: val, location: val ? "Remote" : data.location || "" })
          }
          trackColor={{ false: colors.border, true: "#6366F1" }}
        />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 14,
    marginVertical: 10,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#6366F1",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  typesScroll: {
    marginBottom: 10,
  },
  typePill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  typePillText: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  toggleRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
