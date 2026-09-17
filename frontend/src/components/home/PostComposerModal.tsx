import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Profile, Room } from "@/types";
import { Button, Card, Pill, Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

interface ClubTarget {
  id: string;
  name: string;
  category?: string;
}

export type AudienceType = "public" | "campus" | "connections" | "room" | "club";

const QUICK_TAGS = [
  "#Algorithm",
  "#Python",
  "#ExamPrep",
  "#Calculus",
  "#WebDev",
  "#AI",
  "#StudyTips",
  "#Career",
];

interface PostComposerModalProps {
  visible: boolean;
  onClose: () => void;
  currentUser?: Profile | null;
  onPostCreated?: () => void;
  initialAudience?: AudienceType;
  initialTag?: string;
  openMediaImmediately?: boolean;
}

export function PostComposerModal({
  visible,
  onClose,
  currentUser,
  onPostCreated,
  initialAudience,
  initialTag,
  openMediaImmediately,
}: PostComposerModalProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AudienceType>(initialAudience || "public");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [showMediaInput, setShowMediaInput] = useState(Boolean(openMediaImmediately));
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);

  React.useEffect(() => {
    if (visible) {
      if (initialAudience) setAudience(initialAudience);
      if (initialTag && !body.includes(initialTag)) {
        setBody((prev) => (prev ? `${prev} ${initialTag} ` : `${initialTag} `));
      }
      if (openMediaImmediately) {
        setShowMediaInput(true);
      }
    }
  }, [visible, initialAudience, initialTag, openMediaImmediately]);

  // Fetch user rooms & clubs for target audience selection
  const roomsQuery = useQuery({
    queryKey: ["rooms", "composer-targets"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms?limit=30"),
    enabled: visible && audience === "room",
  });

  const clubsQuery = useQuery({
    queryKey: ["clubs", "composer-targets"],
    queryFn: () => api<{ clubs: ClubTarget[] }>("/clubs"),
    enabled: visible && audience === "club",
  });

  const createPostMutation = useMutation({
    mutationFn: async () => {
      let finalBody = body.trim();

      // If specific audience, prepend tag or context badge
      if (audience === "campus" && currentUser?.university) {
        finalBody = `[🏛️ ${currentUser.university}]\n${finalBody}`;
      } else if (audience === "connections") {
        finalBody = `[👥 Connections]\n${finalBody}`;
      } else if (audience === "room" && selectedTargetId) {
        const roomName = roomsQuery.data?.rooms?.find((r) => r.id === selectedTargetId)?.title || "Room";
        finalBody = `[🚪 Room: ${roomName}]\n${finalBody}`;
      } else if (audience === "club" && selectedTargetId) {
        const clubName = clubsQuery.data?.clubs?.find((c) => c.id === selectedTargetId)?.name || "Club";
        finalBody = `[🛡️ Club: ${clubName}]\n${finalBody}`;
      }

      return api("/feed", {
        method: "POST",
        body: JSON.stringify({
          body: finalBody,
          is_anonymous: isAnonymous,
          media_urls: mediaUrls,
          youtube_url: youtubeUrl.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
      qc.invalidateQueries({ queryKey: ["home-personalized-feed"] });
      setBody("");
      setMediaUrls([]);
      setYoutubeUrl("");
      setShowMediaInput(false);
      setShowYoutubeInput(false);
      setIsAnonymous(false);
      onPostCreated?.();
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert(t("common.error"), err.message || "Could not publish post");
    },
  });

  const insertFormatting = (prefix: string, suffix: string = "") => {
    triggerHaptic();
    setBody((prev) => `${prev} ${prefix}${suffix} `);
  };

  const addTag = (tag: string) => {
    triggerHaptic();
    setBody((prev) => (prev.includes(tag) ? prev : `${prev.trim()} ${tag} `));
  };

  const handleAddMedia = () => {
    if (!mediaUrl.trim()) return;
    if (mediaUrls.length >= 4) {
      Alert.alert("Limit Reached", "Max 4 attachments allowed.");
      return;
    }
    setMediaUrls((prev) => [...prev, mediaUrl.trim()]);
    setMediaUrl("");
    setShowMediaInput(false);
  };

  const removeMedia = (idx: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const canPublish = body.trim().length >= 3 && !createPostMutation.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeInDown.springify().damping(18)}
          exiting={FadeOutDown}
          style={[s.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {/* Header */}
          <Row style={s.headerRow}>
            <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={[s.sheetTitle, { color: colors.text }]}>{t("feed.createPost")}</Text>
            <Button
              title={createPostMutation.isPending ? t("feed.publishing") : t("feed.publishPost")}
              compact
              disabled={!canPublish}
              loading={createPostMutation.isPending}
              onPress={() => createPostMutation.mutate()}
            />
          </Row>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            {/* Author Profile Row */}
            <Row style={s.authorRow}>
              <View style={[s.avatarCircle, { backgroundColor: colors.primarySoft }]}>
                {isAnonymous ? (
                  <MaterialCommunityIcons name="incognito" size={24} color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 16 }}>
                    {currentUser?.full_name?.[0] || "U"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.authorName, { color: colors.text }]}>
                  {isAnonymous ? "Anonymous Peer (বেনামী)" : currentUser?.full_name || "You"}
                </Text>
                <Text style={[s.authorMeta, { color: colors.muted }]}>
                  {currentUser?.university || "Campus Community"}
                </Text>
              </View>
            </Row>

            {/* Audience Selector Tabs */}
            <View style={s.audienceSection}>
              <Text style={[s.sectionSubtitle, { color: colors.muted }]}>{t("feed.audience")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.audienceScroll}>
                {(
                  [
                    { key: "public", label: t("feed.audiencePublic"), icon: "earth" },
                    { key: "campus", label: t("feed.audienceCampus"), icon: "domain" },
                    { key: "connections", label: t("feed.audienceConnections"), icon: "account-multiple" },
                    { key: "room", label: t("feed.audienceRoom"), icon: "door-open" },
                    { key: "club", label: t("feed.audienceClub"), icon: "shield-account" },
                  ] as const
                ).map((aud) => {
                  const isSelected = audience === aud.key;
                  return (
                    <Pressable
                      key={aud.key}
                      onPress={() => {
                        triggerHaptic();
                        setAudience(aud.key);
                      }}
                      style={[
                        s.audienceChip,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.surface2,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={aud.icon as any}
                        size={15}
                        color={isSelected ? "#FFFFFF" : colors.muted}
                      />
                      <Text
                        style={[
                          s.audienceChipText,
                          { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "700" : "500" },
                        ]}
                      >
                        {aud.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Room target picker if audience is room */}
            {audience === "room" && (
              <View style={s.targetPickerWrap}>
                <Text style={[s.sectionSubtitle, { color: colors.muted }]}>Select Room:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {roomsQuery.data?.rooms?.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => setSelectedTargetId(r.id)}
                      style={[
                        s.targetItem,
                        {
                          backgroundColor: selectedTargetId === r.id ? `${colors.primary}20` : colors.surface2,
                          borderColor: selectedTargetId === r.id ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: selectedTargetId === r.id ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>
                        {r.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Club target picker if audience is club */}
            {audience === "club" && (
              <View style={s.targetPickerWrap}>
                <Text style={[s.sectionSubtitle, { color: colors.muted }]}>Select Club:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {clubsQuery.data?.clubs?.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setSelectedTargetId(c.id)}
                      style={[
                        s.targetItem,
                        {
                          backgroundColor: selectedTargetId === c.id ? `${colors.primary}20` : colors.surface2,
                          borderColor: selectedTargetId === c.id ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: selectedTargetId === c.id ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Post Main Input */}
            <TextInput
              style={[s.postInput, { color: colors.text, borderColor: colors.border }]}
              multiline
              numberOfLines={6}
              placeholder={t("feed.composerPrompt1")}
              placeholderTextColor={colors.muted}
              value={body}
              onChangeText={setBody}
              textAlignVertical="top"
              autoFocus
            />

            {/* Rich Formatting Toolbar */}
            <View style={[s.formattingToolbar, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
              <Pressable onPress={() => insertFormatting("**", "**")} style={s.toolBtn}>
                <MaterialCommunityIcons name="format-bold" size={20} color={colors.text} />
              </Pressable>
              <Pressable onPress={() => insertFormatting("*", "*")} style={s.toolBtn}>
                <MaterialCommunityIcons name="format-italic" size={20} color={colors.text} />
              </Pressable>
              <Pressable onPress={() => insertFormatting("```\n", "\n```")} style={s.toolBtn}>
                <MaterialCommunityIcons name="code-tags" size={20} color={colors.text} />
              </Pressable>
              <Pressable onPress={() => insertFormatting("\n• ")} style={s.toolBtn}>
                <MaterialCommunityIcons name="format-list-bulleted" size={20} color={colors.text} />
              </Pressable>
              <Pressable onPress={() => insertFormatting("\n> ")} style={s.toolBtn}>
                <MaterialCommunityIcons name="format-quote-close" size={20} color={colors.text} />
              </Pressable>
              <View style={s.toolDivider} />
              <Pressable onPress={() => setShowMediaInput((prev) => !prev)} style={s.toolBtn}>
                <MaterialCommunityIcons name="image-plus" size={20} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => setShowYoutubeInput((prev) => !prev)} style={s.toolBtn}>
                <MaterialCommunityIcons name="youtube" size={20} color="#EF4444" />
              </Pressable>
            </View>

            {/* Quick Hashtags */}
            <View style={s.quickTagsWrap}>
              <Text style={[s.sectionSubtitle, { color: colors.muted }]}>{t("feed.tags")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {QUICK_TAGS.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => addTag(tag)}
                    style={[s.tagChip, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  >
                    <Text style={[s.tagText, { color: colors.primary }]}>{tag}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Media Attachment URL Form */}
            {showMediaInput && (
              <Card style={s.subInputCard}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{t("feed.addMedia")}</Text>
                <Row style={{ gap: 8, marginTop: 6 }}>
                  <TextInput
                    style={[s.urlInput, { color: colors.text, borderColor: colors.border, flex: 1 }]}
                    placeholder="https://example.com/image.png"
                    placeholderTextColor={colors.muted}
                    value={mediaUrl}
                    onChangeText={setMediaUrl}
                  />
                  <Button title="Attach" compact onPress={handleAddMedia} />
                </Row>
              </Card>
            )}

            {/* Attached Media Previews */}
            {mediaUrls.length > 0 && (
              <Row style={{ gap: 8, flexWrap: "wrap", marginVertical: 8 }}>
                {mediaUrls.map((url, i) => (
                  <View key={i} style={s.mediaPreviewBox}>
                    <Image source={{ uri: url }} style={s.mediaPreviewImg} />
                    <Pressable onPress={() => removeMedia(i)} style={s.mediaDeleteBtn}>
                      <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
              </Row>
            )}

            {/* YouTube Embed URL Form */}
            {showYoutubeInput && (
              <Card style={s.subInputCard}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{t("feed.addYoutube")}</Text>
                <TextInput
                  style={[s.urlInput, { color: colors.text, borderColor: colors.border, marginTop: 6 }]}
                  placeholder="https://youtube.com/watch?v=..."
                  placeholderTextColor={colors.muted}
                  value={youtubeUrl}
                  onChangeText={setYoutubeUrl}
                />
              </Card>
            )}

            {/* Anonymous Toggle */}
            <Card style={s.anonCard}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Row style={{ alignItems: "center", gap: 10 }}>
                  <MaterialCommunityIcons name="incognito" size={22} color={colors.primary} />
                  <View>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                      {t("feed.postAnonymous")}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      Hide your identity & student username
                    </Text>
                  </View>
                </Row>
                <Switch
                  value={isAnonymous}
                  onValueChange={(val) => {
                    triggerHaptic();
                    setIsAnonymous(val);
                  }}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </Row>
            </Card>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    maxHeight: "88%",
    paddingBottom: 24,
  },
  headerRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150,150,150,0.2)",
  },
  closeBtn: {
    padding: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  authorRow: {
    alignItems: "center",
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  authorName: {
    fontSize: 15,
    fontWeight: "700",
  },
  authorMeta: {
    fontSize: 12,
  },
  audienceSection: {
    gap: 6,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  audienceScroll: {
    gap: 6,
  },
  audienceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  audienceChipText: {
    fontSize: 12,
  },
  targetPickerWrap: {
    gap: 6,
  },
  targetItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  postInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    minHeight: 120,
  },
  formattingToolbar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  toolBtn: {
    padding: 8,
    borderRadius: radius.sm,
  },
  toolDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(150,150,150,0.3)",
    marginHorizontal: 4,
  },
  quickTagsWrap: {
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  subInputCard: {
    padding: 10,
    borderRadius: radius.md,
  },
  urlInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  mediaPreviewBox: {
    position: "relative",
    width: 70,
    height: 70,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  mediaPreviewImg: {
    width: "100%",
    height: "100%",
  },
  mediaDeleteBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  anonCard: {
    padding: 12,
    borderRadius: radius.md,
  },
});
