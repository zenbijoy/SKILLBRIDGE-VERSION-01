import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Dashboard, DashboardWidget } from "@/types";
import { radius, useTheme } from "@/theme";
import { Button, Card, ErrorState, H1, H2, Muted, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";

export default function CustomizeDashboardScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const qc = useQueryClient();
  const presets = ["balanced", "learner", "tutor", "researcher", "community"].map((id) => ({
    id,
    title: t(`dashboard.preset${id.charAt(0).toUpperCase()}${id.slice(1)}`),
    desc: t(`dashboard.preset${id.charAt(0).toUpperCase()}${id.slice(1)}Detail`),
  }));

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", "customizer"],
    queryFn: () => api<Dashboard>("/dashboard"),
  });

  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [selectedPreset, setSelectedPreset] = useState<string>("balanced");
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);

  useEffect(() => {
    if (dashboardQuery.data?.layout?.widgets) {
      // Server data intentionally hydrates this editable local draft.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWidgets(dashboardQuery.data.layout.widgets);
      if (dashboardQuery.data.layout.density) setDensity(dashboardQuery.data.layout.density);
      if (dashboardQuery.data.layout.preset) setSelectedPreset(dashboardQuery.data.layout.preset);
    }
  }, [dashboardQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: { preset: string; density: string; widgets: Pick<DashboardWidget, "widget_key" | "visible" | "order">[] }) =>
      api("/dashboard/layout", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert(t("dashboard.layoutSaved"), t("dashboard.layoutSavedDetail"));
      router.back();
    },
    onError: (error: Error) => Alert.alert(t("dashboard.saveError"), error.message),
  });

  const resetMutation = useMutation({
    mutationFn: () => api("/dashboard/layout/reset", { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert(t("dashboard.resetDone"), t("dashboard.resetDoneDetail"));
      router.back();
    },
    onError: (error: Error) => Alert.alert(t("dashboard.resetError"), error.message),
  });

  const toggleWidgetVisibility = (key: string) => {
    triggerHaptic();
    setWidgets((prev) =>
      prev.map((w) => (w.widget_key === key && !w.is_required ? { ...w, visible: !w.visible } : w)),
    );
  };

  const moveWidget = (index: number, direction: "up" | "down") => {
    triggerHaptic();
    if ((direction === "up" && index === 0) || (direction === "down" && index === widgets.length - 1)) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const itemA = widgets[index];
    const itemB = widgets[targetIndex];
    if (!itemA || !itemB) return;

    const nextWidgets = [...widgets];
    nextWidgets[index] = itemB;
    nextWidgets[targetIndex] = itemA;

    // Update order numbers
    const updated = nextWidgets.map((w, idx) => ({ ...w, order: idx + 1 }));
    setWidgets(updated);
  };

  const applyPreset = (presetId: string) => {
    triggerHaptic();
    setSelectedPreset(presetId);
    if (presetId === "learner") {
      setWidgets((prev) =>
        prev.map((w) => ({
          ...w,
          visible: w.is_required || !["research_opportunities"].includes(w.widget_key),
        })),
      );
    } else if (presetId === "tutor") {
      setWidgets((prev) =>
        prev.map((w) => ({
          ...w,
          visible: w.is_required || !["campus_events"].includes(w.widget_key),
        })),
      );
    } else if (presetId === "researcher") {
      setWidgets((prev) =>
        prev.map((w) => ({
          ...w,
          visible: w.is_required || ["greeting_hero", "research_opportunities", "recommended_peers", "profile_quest"].includes(w.widget_key),
        })),
      );
    } else {
      setWidgets((prev) => prev.map((w) => ({ ...w, visible: true })));
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Row style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <H1 style={styles.title}>{t("dashboard.title")}</H1>
          </View>
        </Row>
        <Muted style={{ marginBottom: 16 }}>
          {t("dashboard.detail")}
        </Muted>

        {dashboardQuery.isLoading ? <Card><Skeleton width="45%" /><Skeleton height={180} /></Card> : null}
        {dashboardQuery.isError ? (
          <ErrorState detail={(dashboardQuery.error as Error).message} onRetry={() => dashboardQuery.refetch()} />
        ) : null}

        {!dashboardQuery.isLoading && !dashboardQuery.isError ? <>
        {/* Role Presets */}
        <Card>
          <H2>{t("dashboard.rolePresets")}</H2>
          <View style={styles.presetsGrid}>
            {presets.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() => applyPreset(preset.id)}
                style={[
                  styles.presetCard,
                  { borderColor: selectedPreset === preset.id ? colors.primary : colors.border },
                  selectedPreset === preset.id && { backgroundColor: colors.primarySoft },
                ]}
              >
                <Text style={[styles.presetTitle, { color: colors.text }]}>{preset.title}</Text>
                <Muted style={{ fontSize: 12 }}>{preset.desc}</Muted>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Density Selector */}
        <Card style={{ marginTop: 12 }}>
          <H2>{t("dashboard.layoutDensity")}</H2>
          <Row style={{ gap: 8, marginTop: 8 }}>
            {(["compact", "comfortable", "spacious"] as const).map((d) => (
              <Pressable
                key={d}
                onPress={() => {
                  triggerHaptic();
                  setDensity(d);
                }}
                style={[
                  styles.densityButton,
                  { borderColor: density === d ? colors.primary : colors.border },
                  density === d && { backgroundColor: colors.primarySoft },
                ]}
              >
                <Text style={[styles.densityText, { color: colors.text, fontWeight: density === d ? "800" : "600" }]}>
                  {t(`dashboard.density${d.charAt(0).toUpperCase()}${d.slice(1)}`)}
                </Text>
              </Pressable>
            ))}
          </Row>
        </Card>

        {/* Widgets Reordering & Toggles */}
        <Card style={{ marginTop: 12 }}>
          <H2>{t("dashboard.widgets")}</H2>
          <Muted style={{ marginBottom: 12 }}>{t("dashboard.widgetsDetail")}</Muted>

          <View style={{ gap: 8 }}>
            {widgets.map((widget, index) => (
              <Row key={widget.widget_key} style={[styles.widgetRow, { borderColor: colors.border }]}>
                <Pressable
                  onPress={() => toggleWidgetVisibility(widget.widget_key)}
                  disabled={widget.is_required}
                  style={styles.widgetInfo}
                >
                  <MaterialCommunityIcons
                    name={widget.visible ? "eye" : "eye-off"}
                    size={20}
                    color={widget.visible ? colors.primary : colors.muted}
                  />
                  <Text style={[styles.widgetName, { color: widget.visible ? colors.text : colors.muted }]}>
                    {(language === "bn" ? widget.title_bn : widget.title_en) || widget.widget_key}
                  </Text>
                </Pressable>

                {widget.is_required ? <Muted style={{ fontSize: 11 }}>{t("dashboard.required")}</Muted> : null}

                <Row style={{ gap: 4 }}>
                  <Pressable
                    disabled={index === 0}
                    onPress={() => moveWidget(index, "up")}
                    style={[styles.arrowButton, index === 0 && { opacity: 0.3 }]}
                  >
                    <MaterialCommunityIcons name="arrow-up" size={20} color={colors.text} />
                  </Pressable>
                  <Pressable
                    disabled={index === widgets.length - 1}
                    onPress={() => moveWidget(index, "down")}
                    style={[styles.arrowButton, index === widgets.length - 1 && { opacity: 0.3 }]}
                  >
                    <MaterialCommunityIcons name="arrow-down" size={20} color={colors.text} />
                  </Pressable>
                </Row>
              </Row>
            ))}
          </View>
        </Card>

        {/* Action Buttons */}
        <Row style={{ gap: 12, marginTop: 24 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={t("dashboard.resetDefaults")}
              variant="secondary"
              onPress={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || saveMutation.isPending}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Button
              title={t("dashboard.saveCustom")}
              onPress={() =>
                saveMutation.mutate({
                  preset: selectedPreset,
                  density,
                  widgets: widgets.map(({ widget_key, visible, order }) => ({ widget_key, visible, order })),
                })
              }
              disabled={widgets.length === 0 || resetMutation.isPending}
              loading={saveMutation.isPending}
            />
          </View>
        </Row>
        </> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  headerRow: {
    alignItems: "center",
    marginBottom: 4,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  presetsGrid: {
    gap: 8,
    marginTop: 10,
  },
  presetCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    gap: 2,
  },
  presetTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  densityButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  densityText: {
    fontSize: 12,
  },
  widgetRow: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: "space-between",
    alignItems: "center",
  },
  widgetInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  widgetName: {
    fontSize: 14,
    fontWeight: "600",
  },
  arrowButton: {
    padding: 6,
    borderRadius: radius.sm,
  },
});
