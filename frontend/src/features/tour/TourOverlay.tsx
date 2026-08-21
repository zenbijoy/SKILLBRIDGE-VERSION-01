import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTour } from "./TourContext";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";
import { Button, Card, H2, Row } from "@/components/ui";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export function TourOverlay() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { isActive, currentStepIndex, currentChapter, chapters, isLastStep, nextStep, skipStep, skipTour } = useTour();

  if (!isActive) return null;

  return (
    <View pointerEvents="box-none" style={styles.backdrop}>
        <View pointerEvents="box-none" style={styles.centerContainer}>
          <Card tone="glow" style={[styles.tourCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            {/* Header with Step Tracker */}
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <View style={styles.badgeRow}>
                <MaterialCommunityIcons name="compass-outline" size={18} color={colors.primary} />
                <Text style={[styles.stepBadgeText, { color: colors.primary }]}>
                  {t("onboarding.step")} {currentStepIndex + 1} / {chapters.length}
                </Text>
              </View>

              <Pressable onPress={skipTour} hitSlop={12} style={styles.skipButton}>
                <Text style={[styles.skipButtonText, { color: colors.muted }]}>{t("tour.skipTour")}</Text>
              </Pressable>
            </Row>

            {/* Title & Body */}
            <H2 style={styles.titleText}>{currentChapter.title ?? t(currentChapter.titleKey ?? "tour.step1Title")}</H2>
            <Text style={[styles.bodyText, { color: colors.text }]}>{currentChapter.body ?? t(currentChapter.bodyKey ?? "tour.step1Body")}</Text>

            {/* Reward Callout on Last Step */}
            {isLastStep && (
              <Row style={[styles.rewardCallout, { backgroundColor: colors.primarySoft }]}>
                <MaterialCommunityIcons name="star-shooting" size={20} color="#F59E0B" />
                <Text style={[styles.rewardText, { color: colors.primary }]}>
                  {t("tour.rewardDetail")}
                </Text>
              </Row>
            )}

            {/* Bottom Actions */}
            <Row style={styles.actionsRow}>
              {!isLastStep && (
                <View style={{ flex: 1 }}>
                  <Button
                    title={t("tour.skipStep")}
                    variant="ghost"
                    compact
                    onPress={skipStep}
                  />
                </View>
              )}
              <View style={{ flex: 2 }}>
                <Button
                  title={isLastStep ? t("tour.finishTour") : t("tour.nextStep")}
                  compact
                  onPress={nextStep}
                />
              </View>
            </Row>
          </Card>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    justifyContent: "flex-end",
    paddingBottom: 40,
    paddingHorizontal: 16,
    zIndex: 1000,
    elevation: 1000,
  },
  centerContainer: {
    width: "100%",
  },
  tourCard: {
    padding: 20,
    borderRadius: radius.xl,
    borderWidth: 2,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  skipButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  titleText: {
    fontSize: 18,
    fontWeight: "800",
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 22,
  },
  rewardCallout: {
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    marginVertical: 4,
  },
  rewardText: {
    fontSize: 13,
    fontWeight: "700",
  },
  actionsRow: {
    gap: 10,
    marginTop: 8,
  },
});
