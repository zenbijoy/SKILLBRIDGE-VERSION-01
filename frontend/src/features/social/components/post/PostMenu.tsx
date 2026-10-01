import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { copyToClipboard } from "@/utils/safeClipboard";
import type { SocialPost } from "../../types";

interface PostMenuProps {
  visible: boolean;
  post: SocialPost;
  currentUserId?: string;
  isAdmin?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSave?: () => void;
  onReport?: () => void;
}

export function PostMenu({
  visible,
  post,
  currentUserId,
  isAdmin = false,
  onClose,
  onEdit,
  onDelete,
  onSave,
  onReport,
}: PostMenuProps) {
  const { colors } = useTheme();

  const isAuthor = Boolean(currentUserId && post.author_id === currentUserId);
  const canDelete = isAuthor || isAdmin;

  const handleCopyLink = async () => {
    triggerHaptic("selection");
    const link = `https://skillbridge.app/feed/post/${post.id}`;
    await copyToClipboard(link, "Post Link");
    Alert.alert("Link Copied", "Post link copied to clipboard.");
    onClose();
  };

  const handleDeletePrompt = () => {
    onClose();
    Alert.alert(
      "Delete Post",
      "Are you sure you want to permanently delete this post? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete?.(),
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

          {/* Option: Save */}
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: `${colors.primary}10` }]}
            onPress={() => {
              onSave?.();
              onClose();
            }}
          >
            <MaterialCommunityIcons
              name={post.is_saved ? "bookmark-check" : "bookmark-outline"}
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.menuItemText, { color: colors.text }]}>
              {post.is_saved ? "Remove from Saved Items" : "Save Post"}
            </Text>
          </Pressable>

          {/* Option: Copy Link */}
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: `${colors.primary}10` }]}
            onPress={handleCopyLink}
          >
            <MaterialCommunityIcons name="link-variant" size={20} color={colors.text} />
            <Text style={[styles.menuItemText, { color: colors.text }]}>Copy Post Link</Text>
          </Pressable>

          {/* Option: Edit (Author only) */}
          {isAuthor && onEdit && (
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: `${colors.primary}10` }]}
              onPress={() => {
                onClose();
                onEdit();
              }}
            >
              <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.text} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Edit Post</Text>
            </Pressable>
          )}

          {/* Option: Report */}
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: `${colors.primary}10` }]}
            onPress={() => {
              onClose();
              onReport?.();
            }}
          >
            <MaterialCommunityIcons name="flag-outline" size={20} color="#F59E0B" />
            <Text style={[styles.menuItemText, { color: colors.text }]}>Report Post</Text>
          </Pressable>

          {/* Option: Delete (Author or Admin) */}
          {canDelete && (
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: "#EF444415" }]}
              onPress={handleDeletePrompt}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={20} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: "#EF4444", fontWeight: "700" }]}>
                Delete Post
              </Text>
            </Pressable>
          )}

          <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]}>
            <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        </View>
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
    paddingBottom: 32,
    gap: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: "600",
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
