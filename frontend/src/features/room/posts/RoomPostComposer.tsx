import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { RoomPostType } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

type RoomPostComposerProps = {
  roomId: string;
  roomTitle: string;
  userAvatarLetter?: string;
  canAnnounce?: boolean;
  onSubmit: (data: { title?: string; body: string; type: RoomPostType }) => Promise<void>;
};

const POST_TYPES: { type: RoomPostType; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { type: "discussion", label: "Discussion", icon: "forum-outline" },
  { type: "question", label: "Question", icon: "help-circle-outline" },
  { type: "announcement", label: "Announcement", icon: "bullhorn-outline" },
  { type: "resource", label: "Resource", icon: "file-document-outline" },
  { type: "poll", label: "Poll", icon: "chart-bar" },
];

export function RoomPostComposer({
  roomId,
  roomTitle,
  userAvatarLetter = "U",
  canAnnounce,
  onSubmit,
}: RoomPostComposerProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [postType, setPostType] = useState<RoomPostType>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenWithType = (type: RoomPostType) => {
    triggerHaptic();
    setPostType(type);
    setIsOpen(true);
  };

  const handlePublish = async () => {
    if (!body.trim()) {
      Alert.alert("Empty Post", "Please type your message before sharing.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        title: title.trim() || undefined,
        body: body.trim(),
        type: postType,
      });
      setTitle("");
      setBody("");
      setIsOpen(false);
    } catch (err: any) {
      Alert.alert("Post Failed", err?.message || "Could not publish post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={s.container}>
      {/* Compact Trigger Box */}
      <View style={[s.triggerBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ alignItems: "center", gap: 10 }}>
          <View style={[s.userAvatar, { backgroundColor: colors.primarySoft }]}>
            <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>
              {userAvatarLetter}
            </Text>
          </View>
          <Pressable
            onPress={() => handleOpenWithType("discussion")}
            style={[s.fakeInput, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            <Text style={[s.fakeInputText, { color: colors.muted }]}>
              Share with this room...
            </Text>
          </Pressable>
        </Row>

        {/* Quick Action Chips */}
        <Row style={[s.chipsRow, { borderTopColor: colors.divider }]}>
          <Pressable
            onPress={() => handleOpenWithType("discussion")}
            style={({ pressed }) => [s.chipBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="forum-outline" size={16} color={colors.primary} />
            <Text style={[s.chipText, { color: colors.text }]}>Discussion</Text>
          </Pressable>

          <Pressable
            onPress={() => handleOpenWithType("question")}
            style={({ pressed }) => [s.chipBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="help-circle-outline" size={16} color={colors.info} />
            <Text style={[s.chipText, { color: colors.text }]}>Question</Text>
          </Pressable>

          {canAnnounce ? (
            <Pressable
              onPress={() => handleOpenWithType("announcement")}
              style={({ pressed }) => [s.chipBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialCommunityIcons name="bullhorn-outline" size={16} color={colors.danger} />
              <Text style={[s.chipText, { color: colors.danger, fontWeight: "700" }]}>Announce</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => handleOpenWithType("resource")}
              style={({ pressed }) => [s.chipBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialCommunityIcons name="file-document-outline" size={16} color={colors.accent} />
              <Text style={[s.chipText, { color: colors.text }]}>Resource</Text>
            </Pressable>
          )}
        </Row>
      </View>

      {/* Modal Composer Sheet */}
      <Modal visible={isOpen} animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <View style={[s.modalScreen, { backgroundColor: colors.background }]}>
          {/* Modal Header */}
          <Row style={[s.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Pressable hitSlop={12} onPress={() => setIsOpen(false)} style={s.modalClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={[s.modalHeaderTitle, { color: colors.text }]}>Create in {roomTitle}</Text>
            </View>
            <Pressable
              onPress={handlePublish}
              disabled={isSubmitting || !body.trim()}
              style={[
                s.publishBtn,
                { backgroundColor: colors.primary, opacity: body.trim() && !isSubmitting ? 1 : 0.5 },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={s.publishBtnText}>Post</Text>
              )}
            </Pressable>
          </Row>

          <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
            {/* Post Type Selector */}
            <Text style={[s.sectionLabel, { color: colors.muted }]}>SELECT CONTENT TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {POST_TYPES.map((item) => {
                const isAnnouncement = item.type === "announcement";
                if (isAnnouncement && !canAnnounce) return null;
                const isSelected = postType === item.type;
                return (
                  <Pressable
                    key={item.type}
                    onPress={() => {
                      triggerHaptic();
                      setPostType(item.type);
                    }}
                    style={[
                      s.typeSelectorPill,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.surface,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={16}
                      color={isSelected ? "#FFFFFF" : colors.text}
                    />
                    <Text
                      style={[
                        s.typeSelectorText,
                        { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "800" : "600" },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Optional Title (recommended for announcements or questions) */}
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={postType === "question" ? "Question title..." : postType === "announcement" ? "Announcement subject..." : "Title (optional)..."}
              placeholderTextColor={colors.muted}
              style={[s.titleInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              maxLength={120}
            />

            {/* Body TextArea */}
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={
                postType === "question"
                  ? "Describe what you need help solving..."
                  : postType === "announcement"
                  ? "Write official room announcement..."
                  : "What would you like to share or ask with this room?"
              }
              placeholderTextColor={colors.muted}
              style={[s.bodyInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              multiline
              maxLength={8000}
              autoFocus
            />

            {/* Audience Notification Notice */}
            <Row style={[s.audienceNotice, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="account-group" size={18} color={colors.primary} />
              <Text style={[s.audienceNoticeText, { color: colors.muted }]}>
                {postType === "announcement"
                  ? "Announcements send high-priority alerts to all room members."
                  : "Visible to all members of this study room."}
              </Text>
            </Row>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  triggerBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  fakeInput: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  fakeInputText: {
    fontSize: 13,
  },
  chipsRow: {
    justifyContent: "space-around",
    paddingTop: 6,
    borderTopWidth: 1,
  },
  chipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalScreen: {
    flex: 1,
  },
  modalHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalClose: {
    padding: 4,
  },
  modalHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  publishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  publishBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  modalScroll: {
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  typeSelectorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  typeSelectorText: {
    fontSize: 12,
  },
  titleInput: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
  },
  bodyInput: {
    minHeight: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontSize: 14,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  audienceNotice: {
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  audienceNoticeText: {
    fontSize: 12,
    flex: 1,
  },
});
