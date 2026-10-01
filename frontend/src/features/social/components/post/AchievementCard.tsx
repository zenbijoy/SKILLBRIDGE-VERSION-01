import React from "react";
import { View, Text, StyleSheet, Image, Pressable, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, Pill } from "@/components/ui";
import { nextGenBadges } from "@/assets/nextgen";
import type { PostAchievementMetadata } from "../../types";

interface AchievementCardProps {
  achievement: PostAchievementMetadata;
}

export function AchievementCard({ achievement }: AchievementCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { borderColor: "#EAB308", backgroundColor: `${colors.surface}` }]}>
      {/* Top Banner Accent */}
      <View style={[styles.topBanner, { backgroundColor: "#EAB30815" }]}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="trophy" size={18} color="#EAB308" />
          <Text style={styles.bannerTitle}>SkillBridge Verified Achievement</Text>
        </Row>
        {achievement.skill_name && (
          <Pill tone="warning">{achievement.skill_name}</Pill>
        )}
      </View>

      <View style={styles.content}>
        <Row style={{ alignItems: "flex-start", gap: 12 }}>
          <Image source={nextGenBadges.trusted} style={styles.badgeImage} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>{achievement.title}</Text>
            {achievement.date && (
              <Text style={[styles.dateText, { color: colors.muted }]}>
                Earned: {new Date(achievement.date).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </Text>
            )}
          </View>
        </Row>

        {achievement.certificate_url && (
          <Pressable
            onPress={() => Linking.openURL(achievement.certificate_url!).catch(() => {})}
            style={[styles.certBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
          >
            <MaterialCommunityIcons name="certificate-outline" size={18} color="#EAB308" />
            <Text style={[styles.certBtnText, { color: colors.text }]}>View Credential Certificate</Text>
            <MaterialCommunityIcons name="open-in-new" size={14} color={colors.muted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginVertical: 8,
  },
  topBanner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bannerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EAB308",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  content: {
    padding: 14,
  },
  badgeImage: {
    width: 48,
    height: 48,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  dateText: {
    fontSize: 12,
    marginTop: 4,
  },
  certBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: 12,
  },
  certBtnText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});
