import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, ScrollView, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { api } from "@/lib/api";

interface AiAssistModalProps {
  visible: boolean;
  currentText: string;
  onApplyResult: (newText: string) => void;
  onClose: () => void;
}

const AI_ACTIONS = [
  { id: "improve", label: "Improve Writing", icon: "creation", desc: "Enhance flow and clarity for university peers" },
  { id: "concise", label: "Make Concise", icon: "format-horizontal-align-center", desc: "Shorten and punch up your message" },
  { id: "professional", label: "Academic / Formal", icon: "school-outline", desc: "Refine for official notices and announcements" },
  { id: "grammar", label: "Fix Grammar", icon: "spellcheck", desc: "Correct punctuation, typos, and phrasing" },
  { id: "hashtags", label: "Suggest Hashtags", icon: "pound", desc: "Find 4-5 relevant campus hashtags" },
  { id: "title", label: "Generate Title", icon: "format-title", desc: "Create an eye-catching heading" },
  { id: "summarize", label: "Summarize", icon: "text-box-outline", desc: "1-2 sentence key takeaway" },
];

export function AiAssistModal({ visible, currentText, onApplyResult, onClose }: AiAssistModalProps) {
  const { colors } = useTheme();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string>("improve");

  const handleRunAi = async (actionId: string) => {
    if (!currentText.trim() || currentText.trim().length < 5) {
      Alert.alert("Text Too Short", "Please write at least a few words before running AI writing assistance.");
      return;
    }

    try {
      setLoadingAction(actionId);
      setSelectedActionId(actionId);
      triggerHaptic("selection");

      const res = await api<{ result: string }>("/feed/ai-assist", {
        method: "POST",
        body: JSON.stringify({ action: actionId, text: currentText.trim() }),
      });

      if (res.result) {
        setSuggestion(res.result);
      }
    } catch (err: any) {
      Alert.alert("AI Assist", err.message || "Unable to generate suggestions at this moment.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApply = () => {
    if (!suggestion) return;
    triggerHaptic("notificationSuccess");
    if (selectedActionId === "hashtags") {
      onApplyResult(`${currentText.trim()}\n\n${suggestion}`);
    } else {
      onApplyResult(suggestion);
    }
    setSuggestion(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <Row style={styles.header}>
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="creation" size={22} color="#8B5CF6" />
              <Text style={[styles.title, { color: colors.text }]}>SkillBridge AI Assistant</Text>
            </Row>
            <Pressable onPress={onClose} hitSlop={6}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          <Text style={[styles.disclaimer, { color: colors.muted }]}>
            AI writing suggestions are private and advisory. You review and approve all content before publishing.
          </Text>

          {/* Action List */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsScroll}>
            <Row style={{ gap: 8 }}>
              {AI_ACTIONS.map((action) => {
                const isLoading = loadingAction === action.id;
                return (
                  <Pressable
                    key={action.id}
                    disabled={Boolean(loadingAction)}
                    onPress={() => handleRunAi(action.id)}
                    style={[
                      styles.actionCard,
                      { borderColor: colors.border, backgroundColor: colors.bg },
                      selectedActionId === action.id && suggestion && { borderColor: "#8B5CF6" },
                    ]}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#8B5CF6" />
                    ) : (
                      <MaterialCommunityIcons name={action.icon as any} size={18} color="#8B5CF6" />
                    )}
                    <Text style={[styles.actionLabel, { color: colors.text }]}>{action.label}</Text>
                  </Pressable>
                );
              })}
            </Row>
          </ScrollView>

          {/* Suggestion Box */}
          {suggestion && (
            <View style={[styles.suggestionBox, { borderColor: "#8B5CF6", backgroundColor: colors.bg }]}>
              <Row style={{ alignItems: "center", gap: 6, marginBottom: 6 }}>
                <MaterialCommunityIcons name="auto-fix" size={16} color="#8B5CF6" />
                <Text style={styles.suggestedHeading}>AI Suggestion</Text>
              </Row>
              <ScrollView style={{ maxHeight: 150 }}>
                <Text style={[styles.suggestionText, { color: colors.text }]}>{suggestion}</Text>
              </ScrollView>

              <Row style={styles.suggestActions}>
                <Pressable onPress={() => setSuggestion(null)} style={styles.discardBtn}>
                  <Text style={{ color: colors.muted }}>Discard</Text>
                </Pressable>
                <Pressable onPress={handleApply} style={[styles.applyBtn, { backgroundColor: "#8B5CF6" }]}>
                  <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  <Text style={styles.applyBtnText}>
                    {selectedActionId === "hashtags" ? "Append Hashtags" : "Apply Revision"}
                  </Text>
                </Pressable>
              </Row>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 18,
    paddingBottom: 36,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  disclaimer: {
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 12,
  },
  actionsScroll: {
    marginBottom: 14,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  actionLabel: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  suggestionBox: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: 12,
  },
  suggestedHeading: {
    color: "#8B5CF6",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  suggestionText: {
    fontSize: 14,
    lineHeight: 20,
    marginVertical: 4,
  },
  suggestActions: {
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  discardBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  applyBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
