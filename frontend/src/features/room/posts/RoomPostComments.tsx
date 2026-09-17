import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { RoomPost, RoomPostComment } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

type RoomPostCommentsProps = {
  post: RoomPost | null;
  roomId: string;
  currentUserId?: string;
  canModerate?: boolean;
  onClose: () => void;
};

export function RoomPostComments({
  post,
  roomId,
  currentUserId,
  canModerate,
  onClose,
}: RoomPostCommentsProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [commentText, setCommentText] = useState("");

  const commentsQuery = useQuery({
    queryKey: ["room-post-comments", roomId, post?.id],
    queryFn: () => api<{ comments: RoomPostComment[] }>(`/rooms/${roomId}/posts/${post!.id}/comments`),
    enabled: Boolean(post?.id),
  });

  const addComment = useMutation({
    mutationFn: () =>
      api<{ comment: RoomPostComment }>(`/rooms/${roomId}/posts/${post!.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentText.trim() }),
      }),
    onSuccess: () => {
      triggerHaptic();
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["room-post-comments", roomId, post?.id] });
      qc.invalidateQueries({ queryKey: ["room-posts", roomId] });
    },
    onError: (err: Error) => Alert.alert("Could not post comment", err.message),
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      api(`/rooms/${roomId}/posts/${post!.id}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-post-comments", roomId, post?.id] });
      qc.invalidateQueries({ queryKey: ["room-posts", roomId] });
    },
    onError: (err: Error) => Alert.alert("Could not delete comment", err.message),
  });

  if (!post) return null;

  const comments = commentsQuery.data?.comments ?? [];

  return (
    <Modal visible={Boolean(post)} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[s.modalCard, { backgroundColor: colors.surface }]}
        >
          {/* Header */}
          <Row style={[s.headerRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: colors.text }]}>Discussion & Comments</Text>
              <Text style={[s.headerSub, { color: colors.muted }]} numberOfLines={1}>
                {post.title || post.body.slice(0, 40)}
              </Text>
            </View>
            <Pressable hitSlop={12} onPress={onClose} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          {/* Comment List */}
          {commentsQuery.isLoading ? (
            <View style={s.centerBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : comments.length === 0 ? (
            <View style={s.centerBox}>
              <MaterialCommunityIcons name="comment-text-outline" size={36} color={colors.muted} />
              <Text style={[s.emptyText, { color: colors.muted }]}>
                No comments yet. Start the conversation!
              </Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.listContent}
              renderItem={({ item }) => {
                const isAuthor = currentUserId && item.author_id === currentUserId;
                return (
                  <View style={[s.commentItem, { borderBottomColor: colors.divider }]}>
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <View style={[s.commentAvatar, { backgroundColor: colors.primarySoft }]}>
                        <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>
                          {item.author?.full_name?.[0] || "U"}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.commentAuthor, { color: colors.text }]}>
                          {item.author?.full_name || "Member"}
                        </Text>
                        <Text style={[s.commentTime, { color: colors.muted }]}>
                          {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </View>
                      {(isAuthor || canModerate) && (
                        <Pressable
                          hitSlop={8}
                          onPress={() => {
                            Alert.alert("Delete Comment", "Are you sure?", [
                              { text: "Cancel", style: "cancel" },
                              { text: "Delete", style: "destructive", onPress: () => deleteComment.mutate(item.id) },
                            ]);
                          }}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.muted} />
                        </Pressable>
                      )}
                    </Row>
                    <Text style={[s.commentBody, { color: colors.text }]}>{item.body}</Text>
                  </View>
                );
              }}
            />
          )}

          {/* Comment Input */}
          <View style={[s.inputWrap, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Write a constructive comment..."
              placeholderTextColor={colors.muted}
              style={[s.input, { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border }]}
              multiline
              maxLength={1500}
            />
            <Pressable
              onPress={() => addComment.mutate()}
              disabled={!commentText.trim() || addComment.isPending}
              style={[
                s.sendBtn,
                { backgroundColor: colors.primary, opacity: commentText.trim() && !addComment.isPending ? 1 : 0.5 },
              ]}
            >
              {addComment.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "85%",
    minHeight: "50%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerRow: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 12,
  },
  closeBtn: {
    padding: 4,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  commentItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 6,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: "700",
  },
  commentTime: {
    fontSize: 10,
  },
  commentBody: {
    fontSize: 13,
    lineHeight: 18,
    paddingLeft: 38,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
