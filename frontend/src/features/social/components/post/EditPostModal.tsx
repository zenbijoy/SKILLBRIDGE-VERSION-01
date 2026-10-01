import React, { useState, useEffect } from "react";
import { Text, StyleSheet, Modal, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import type { SocialPost } from "../../types";

interface EditPostModalProps {
  visible: boolean;
  post: SocialPost | null;
  onSave: (postId: string, newBody: string) => Promise<void>;
  onClose: () => void;
}

export function EditPostModal({ visible, post, onSave, onClose }: EditPostModalProps) {
  const { colors } = useTheme();
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (post) {
      setEditText(post.body || "");
    }
  }, [post]);

  const handleSave = async () => {
    if (!post || !editText.trim() || isSaving) return;
    try {
      setIsSaving(true);
      triggerHaptic("selection");
      await onSave(post.id, editText.trim());
      onClose();
    } catch (err: any) {
      Alert.alert("Update Failed", err.message || "Failed to update post");
    } finally {
      setIsSaving(false);
    }
  };

  if (!post) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={styles.header}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="pencil" size={18} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]}>Edit Post</Text>
            </Row>
            <Pressable onPress={onClose} hitSlop={6}>
              <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          </Row>

          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
            value={editText}
            onChangeText={setEditText}
            multiline
            numberOfLines={6}
            placeholder="Edit your post content..."
            placeholderTextColor={colors.muted}
            autoFocus
          />

          <Row style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={isSaving || !editText.trim()}
              onPress={handleSave}
              style={[
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: isSaving || !editText.trim() ? 0.6 : 1,
                },
              ]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </Pressable>
          </Row>
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
    padding: 16,
    paddingBottom: 36,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  actions: {
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
