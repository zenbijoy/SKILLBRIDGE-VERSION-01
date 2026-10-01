import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import type { PostAchievementMetadata } from "../../types";

interface AchievementBuilderProps {
  data: PostAchievementMetadata;
  onChange: (data: PostAchievementMetadata) => void;
  onRemove: () => void;
}

export function AchievementBuilder({ data, onChange, onRemove }: AchievementBuilderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderColor: "#EAB308", backgroundColor: colors.surface }]}>
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="trophy-outline" size={18} color="#EAB308" />
          <Text style={styles.title}>Achievement Showcase</Text>
        </Row>
        <Pressable onPress={onRemove} hitSlop={6}>
          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      </Row>

      {/* Achievement Milestone Title */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="What did you achieve? (e.g. Solved 500 LeetCode Problems!)"
        placeholderTextColor={colors.muted}
        value={data.title}
        onChangeText={(text) => onChange({ ...data, title: text })}
      />

      {/* Skill or Track */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Skill Passport / Domain (e.g. Competitive Programming, Cloud)"
        placeholderTextColor={colors.muted}
        value={data.skill_name || ""}
        onChangeText={(text) => onChange({ ...data, skill_name: text })}
      />

      {/* Certificate / Verification Link */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Certificate or Credential Link (Optional)"
        placeholderTextColor={colors.muted}
        value={data.certificate_url || ""}
        onChangeText={(text) => onChange({ ...data, certificate_url: text })}
      />
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
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#EAB308",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
});
