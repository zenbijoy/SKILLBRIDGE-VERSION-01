import React, { useState, useRef } from "react";
import {
  ActivityIndicator,
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
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { optimizeImageForUpload, OPTIMIZATION_PRESETS } from "@/lib/imageOptimizer";
import type { Profile, Room } from "@/types";
import { Button, Card, Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { PostContent } from "@/features/social/components/post/PostContent";
import { GalleryCard } from "@/features/social/components/post/GalleryCard";
import { PostHeader } from "@/features/social/components/post/PostHeader";
import { PostActions } from "@/features/social/components/post/PostActions";

interface ClubTarget {
  id: string;
  name: string;
  category?: string;
}

export type AudienceType = "public" | "campus" | "connections" | "room" | "club";

const QUICK_TAGS = [
  "#AI",
  "#WebDev",
  "#Python",
  "#Algorithm",
  "#Career",
  "#ExamPrep",
  "#Research",
  "#StudyTips",
];

interface AttachedMedia {
  url: string;
  mediaObjectId?: string | null;
  mimeType: string;
  fileName?: string;
  mediaType: "image" | "video" | "document";
}

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

  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [body, setBody] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [audience, setAudience] = useState<AudienceType>(initialAudience || "public");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Attachments
  const [attachedMedia, setAttachedMedia] = useState<AttachedMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState("");

  // External URLs
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);

  // Interactive Poll
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  const inputRef = useRef<TextInput | null>(null);

  React.useEffect(() => {
    if (visible) {
      if (initialAudience) setAudience(initialAudience);
      if (initialTag && !body.includes(initialTag)) {
        setBody((prev) => (prev ? `${prev} ${initialTag} ` : `${initialTag} `));
      }
      if (openMediaImmediately) {
        handlePickGalleryPhotos();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on visibility; re-running on every keystroke would re-fire media picker
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

  // Apply Selection-Aware Formatting Tool
  const applyFormatting = (prefix: string, suffix = "", defaultText = "") => {
    triggerHaptic();
    const { start, end } = selection;

    if (start !== end && start >= 0 && end <= body.length) {
      // Selected text exists: wrap it!
      const selectedText = body.slice(start, end);
      const newBody =
        body.slice(0, start) + prefix + selectedText + suffix + body.slice(end);
      setBody(newBody);
      const nextCursor = start + prefix.length + selectedText.length + suffix.length;
      setSelection({ start: nextCursor, end: nextCursor });
    } else {
      // Insert placeholder at current cursor position
      const insertPos = start >= 0 && start <= body.length ? start : body.length;
      const insertText = defaultText ? `${prefix}${defaultText}${suffix}` : `${prefix}${suffix}`;
      const newBody = body.slice(0, insertPos) + insertText + body.slice(insertPos);
      setBody(newBody);
      const nextCursor = insertPos + prefix.length + (defaultText ? defaultText.length : 0);
      setSelection({ start: nextCursor, end: nextCursor });
    }
  };

  // Upload helper for base64 or binary files
  const uploadFileDirect = async (
    fileBase64: string,
    mimeType: string,
    fileName: string,
  ): Promise<AttachedMedia> => {
    const res = await api<{
      url: string;
      mediaObjectId?: string;
      mimeType: string;
      mediaType: "image" | "video" | "document";
      fileName?: string;
    }>("/feed/upload", {
      method: "POST",
      body: JSON.stringify({
        fileBase64,
        contentType: mimeType,
        fileName,
      }),
    });

    return {
      url: res.url,
      mediaObjectId: res.mediaObjectId || null,
      mimeType: res.mimeType || mimeType,
      fileName: res.fileName || fileName,
      mediaType: res.mediaType || "image",
    };
  };

  // Pick Photos from Gallery
  const handlePickGalleryPhotos = async () => {
    if (attachedMedia.length >= 8) {
      Alert.alert("Limit Reached", "Max 8 attachments allowed per post.");
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow photo library access to upload pictures.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsUploading(true);
        setUploadProgressText("Smart compressing & optimizing photos...");

        const newItems: AttachedMedia[] = [];

        for (const asset of result.assets) {
          // Client-side smart resizing (1280px) & perceptual compression (0.78 quality)
          const optimized = await optimizeImageForUpload(
            asset.uri,
            OPTIMIZATION_PRESETS.POST_IMAGE,
            asset.fileName || undefined,
          );

          if (optimized.base64) {
            const uploaded = await uploadFileDirect(optimized.base64, optimized.mimeType, optimized.fileName);
            newItems.push(uploaded);
          } else {
            // Fallback: direct URI if base64 unavailable
            newItems.push({
              url: optimized.uri || asset.uri,
              mimeType: optimized.mimeType,
              fileName: optimized.fileName,
              mediaType: "image",
            });
          }
        }

        setAttachedMedia((prev) => [...prev, ...newItems]);
        triggerHaptic("notificationSuccess");
      }
    } catch (err: any) {
      Alert.alert("Upload Error", err.message || "Failed to upload photo");
    } finally {
      setIsUploading(false);
      setUploadProgressText("");
    }
  };

  // Take Photo with Camera
  const handleTakePhoto = async () => {
    if (attachedMedia.length >= 8) {
      Alert.alert("Limit Reached", "Max 8 attachments allowed per post.");
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow camera access to take a photo.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsUploading(true);
        setUploadProgressText("Smart compressing camera snapshot...");

        const asset = result.assets[0]!;
        const optimized = await optimizeImageForUpload(
          asset.uri,
          OPTIMIZATION_PRESETS.POST_IMAGE,
          `camera_${Date.now()}.jpg`,
        );

        if (optimized.base64) {
          const uploaded = await uploadFileDirect(optimized.base64, optimized.mimeType, optimized.fileName);
          setAttachedMedia((prev) => [...prev, uploaded]);
        } else {
          setAttachedMedia((prev) => [
            ...prev,
            { url: optimized.uri || asset.uri, mimeType: optimized.mimeType, fileName: optimized.fileName, mediaType: "image" },
          ]);
        }
        triggerHaptic("notificationSuccess");
      }
    } catch (err: any) {
      Alert.alert("Camera Error", err.message || "Could not capture photo");
    } finally {
      setIsUploading(false);
      setUploadProgressText("");
    }
  };

  // Pick Document / PDF (for LinkedIn-style slide carousel posts)
  const handlePickDocument = async () => {
    if (attachedMedia.length >= 8) {
      Alert.alert("Limit Reached", "Max 8 attachments allowed per post.");
      return;
    }

    try {
      let docPickerModule: any = null;
      try {
        docPickerModule = await import("expo-document-picker");
      } catch {
        docPickerModule = null;
      }

      if (!docPickerModule || !docPickerModule.getDocumentAsync) {
        Alert.alert("Unavailable", "Document picker is not available on this platform.");
        return;
      }

      const result = await docPickerModule.getDocumentAsync({
        type: ["application/pdf", "application/msword", "text/plain"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0]!;
        setIsUploading(true);
        setUploadProgressText("Attaching document...");

        // If file blob can be fetched for base64:
        try {
          const response = await fetch(doc.uri);
          const blob = await response.blob();
          const reader = new FileReader();

          const base64Data = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.replace(/^data:[^;]+;base64,/, ""));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const uploaded = await uploadFileDirect(
            base64Data,
            doc.mimeType || "application/pdf",
            doc.name || "document.pdf",
          );
          setAttachedMedia((prev) => [...prev, uploaded]);
        } catch {
          setAttachedMedia((prev) => [
            ...prev,
            {
              url: doc.uri,
              mimeType: doc.mimeType || "application/pdf",
              fileName: doc.name || "document.pdf",
              mediaType: "document",
            },
          ]);
        }
        triggerHaptic("notificationSuccess");
      }
    } catch (err: any) {
      Alert.alert("Document Error", err.message || "Failed to attach document");
    } finally {
      setIsUploading(false);
      setUploadProgressText("");
    }
  };

  // Attach manual web URL image
  const handleAddMediaUrl = () => {
    if (!mediaUrlInput.trim()) return;
    setAttachedMedia((prev) => [
      ...prev,
      {
        url: mediaUrlInput.trim(),
        mimeType: "image/jpeg",
        fileName: "image.jpg",
        mediaType: "image",
      },
    ]);
    setMediaUrlInput("");
    setShowUrlInput(false);
  };

  const removeMedia = (idx: number) => {
    triggerHaptic("selection");
    setAttachedMedia((prev) => prev.filter((_, i) => i !== idx));
  };

  const addTag = (tag: string) => {
    triggerHaptic();
    setBody((prev) => (prev.includes(tag) ? prev : `${prev.trim()} ${tag} `));
  };

  // Poll options helpers
  const handleAddPollOption = () => {
    if (pollOptions.length >= 5) return;
    setPollOptions((prev) => [...prev, ""]);
  };

  const handleUpdatePollOption = (text: string, index: number) => {
    setPollOptions((prev) => {
      const copy = [...prev];
      copy[index] = text;
      return copy;
    });
  };

  const handleRemovePollOption = (index: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions((prev) => prev.filter((_, i) => i !== index));
  };

  // Create Post Mutation
  const createPostMutation = useMutation({
    mutationFn: async () => {
      let finalBody = body.trim();

      // If specific audience, prepend tag or context badge
      if (audience === "campus" && currentUser?.university) {
        finalBody = `[🏛️ ${currentUser.university}]\n${finalBody}`;
      } else if (audience === "connections") {
        finalBody = `[👥 Connections]\n${finalBody}`;
      } else if (audience === "room" && selectedTargetId) {
        const roomName =
          roomsQuery.data?.rooms?.find((r) => r.id === selectedTargetId)?.title || "Room";
        finalBody = `[🚪 Room: ${roomName}]\n${finalBody}`;
      } else if (audience === "club" && selectedTargetId) {
        const clubName =
          clubsQuery.data?.clubs?.find((c) => c.id === selectedTargetId)?.name || "Club";
        finalBody = `[🛡️ Club: ${clubName}]\n${finalBody}`;
      }

      const mediaUrls = attachedMedia.map((m) => m.url);
      const mediaObjectIds = attachedMedia
        .map((m) => m.mediaObjectId)
        .filter((id): id is string => Boolean(id));

      const pollData =
        showPollBuilder && pollQuestion.trim()
          ? {
              question: pollQuestion.trim(),
              options: pollOptions.filter((opt) => opt.trim().length > 0),
              is_multiple: false,
              is_anonymous: false,
            }
          : undefined;

      return api("/feed", {
        method: "POST",
        body: JSON.stringify({
          body: finalBody || (pollData ? pollData.question : "Campus Update"),
          is_anonymous: isAnonymous,
          media_urls: mediaUrls,
          media_object_ids: mediaObjectIds,
          youtube_url: youtubeUrl.trim() || undefined,
          poll: pollData,
        }),
      });
    },
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
      qc.invalidateQueries({ queryKey: ["home-personalized-feed"] });
      setBody("");
      setAttachedMedia([]);
      setYoutubeUrl("");
      setShowUrlInput(false);
      setShowYoutubeInput(false);
      setShowPollBuilder(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setIsAnonymous(false);
      setActiveTab("write");
      onPostCreated?.();
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert(t("common.error"), err.message || "Could not publish post");
    },
  });

  const canPublish =
    (body.trim().length >= 2 || (showPollBuilder && pollQuestion.trim().length >= 3) || attachedMedia.length > 0) &&
    !createPostMutation.isPending &&
    !isUploading;

  // Mock Post object for live preview
  const previewPost: any = {
    id: "preview-id",
    body: body.trim() || "What's on your mind? Type your thoughts to preview formatting...",
    created_at: new Date().toISOString(),
    is_anonymous: isAnonymous,
    author: currentUser,
    post_type: "standard",
    media_urls: attachedMedia.map((m) => m.url),
    attachments: attachedMedia.map((m, i) => ({
      id: `att-${i}`,
      url: m.url,
      media_type: m.mediaType,
      name: m.fileName,
    })),
    likes_count: 0,
    comments_count: 0,
    shares_count: 0,
  };

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

            {/* Mode Switcher Tabs (Write vs Preview) */}
            <Row style={[s.tabPillContainer, { backgroundColor: colors.surface2 }]}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setActiveTab("write");
                }}
                style={[s.tabPill, activeTab === "write" && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={15}
                  color={activeTab === "write" ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    s.tabPillText,
                    { color: activeTab === "write" ? colors.primary : colors.muted, fontWeight: activeTab === "write" ? "700" : "500" },
                  ]}
                >
                  Write
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setActiveTab("preview");
                }}
                style={[s.tabPill, activeTab === "preview" && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
              >
                <MaterialCommunityIcons
                  name="eye-outline"
                  size={15}
                  color={activeTab === "preview" ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    s.tabPillText,
                    { color: activeTab === "preview" ? colors.primary : colors.muted, fontWeight: activeTab === "preview" ? "700" : "500" },
                  ]}
                >
                  Preview
                </Text>
              </Pressable>
            </Row>

            <Button
              title={createPostMutation.isPending ? t("feed.publishing") : t("feed.publishPost")}
              compact
              disabled={!canPublish}
              loading={createPostMutation.isPending}
              onPress={() => createPostMutation.mutate()}
            />
          </Row>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            {activeTab === "preview" ? (
              /* LIVE PREVIEW TAB */
              <View style={s.previewWrapper}>
                <View style={[s.previewHintBanner, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
                  <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
                  <Text style={[s.previewHintText, { color: colors.primary }]}>
                    LinkedIn-Style Feed Live Preview (How other members will see your post)
                  </Text>
                </View>

                <Card style={[s.previewCard, { borderColor: colors.border }]}>
                  <PostHeader post={previewPost} />
                  <PostContent post={previewPost} />
                  {attachedMedia.length > 0 && (
                    <GalleryCard
                      images={attachedMedia.map((m) => m.url)}
                      attachments={previewPost.attachments}
                    />
                  )}
                  <PostActions
                    post={previewPost}
                    onReact={() => {}}
                    onCommentPress={() => {}}
                    onSharePress={() => {}}
                    onSavePress={() => {}}
                  />
                </Card>
              </View>
            ) : (
              /* WRITE TAB */
              <>
                {/* Author Profile Row */}
                <Row style={s.authorRow}>
                  <View style={[s.avatarCircle, { backgroundColor: `${colors.primary}15`, borderColor: colors.border }]}>
                    {isAnonymous ? (
                      <MaterialCommunityIcons name="incognito" size={24} color={colors.primary} />
                    ) : currentUser?.avatar_url ? (
                      <Image source={{ uri: currentUser.avatar_url }} style={s.avatarImg} />
                    ) : (
                      <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 16 }}>
                        {currentUser?.full_name?.[0]?.toUpperCase() || "U"}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.authorName, { color: colors.text }]}>
                      {isAnonymous ? "Anonymous Peer (বেনামী)" : currentUser?.full_name || "You"}
                    </Text>
                    <Text style={[s.authorMeta, { color: colors.muted }]} numberOfLines={1}>
                      {currentUser?.bio || currentUser?.university || "Campus Community"}
                    </Text>
                  </View>
                </Row>

                {/* Audience Selector Chips */}
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
                            size={14}
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

                {/* Room target picker */}
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

                {/* Club target picker */}
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

                {/* Main Post Text Area */}
                <TextInput
                  ref={inputRef}
                  style={[s.postInput, { color: colors.text, borderColor: colors.border }]}
                  multiline
                  numberOfLines={7}
                  placeholder={t("feed.composerPrompt1") || "What do you want to talk about?"}
                  placeholderTextColor={colors.muted}
                  value={body}
                  onChangeText={setBody}
                  onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                  textAlignVertical="top"
                />

                {/* Advanced Rich Text Formatting Toolbar */}
                <View style={[s.formattingToolbar, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolScroll}>
                    {/* Bold */}
                    <Pressable
                      onPress={() => applyFormatting("**", "**", "bold text")}
                      style={s.toolBtn}
                      accessibilityLabel="Bold"
                    >
                      <MaterialCommunityIcons name="format-bold" size={20} color={colors.text} />
                    </Pressable>

                    {/* Italic */}
                    <Pressable
                      onPress={() => applyFormatting("*", "*", "italic text")}
                      style={s.toolBtn}
                      accessibilityLabel="Italic"
                    >
                      <MaterialCommunityIcons name="format-italic" size={20} color={colors.text} />
                    </Pressable>

                    {/* Heading 1 */}
                    <Pressable
                      onPress={() => applyFormatting("\n# ", "", "Heading")}
                      style={s.toolBtn}
                      accessibilityLabel="Heading 1"
                    >
                      <MaterialCommunityIcons name="format-header-1" size={20} color={colors.text} />
                    </Pressable>

                    {/* Heading 2 */}
                    <Pressable
                      onPress={() => applyFormatting("\n## ", "", "Subtitle")}
                      style={s.toolBtn}
                      accessibilityLabel="Heading 2"
                    >
                      <MaterialCommunityIcons name="format-header-2" size={20} color={colors.text} />
                    </Pressable>

                    {/* Bullet List */}
                    <Pressable
                      onPress={() => applyFormatting("\n• ", "", "list item")}
                      style={s.toolBtn}
                      accessibilityLabel="Bullet list"
                    >
                      <MaterialCommunityIcons name="format-list-bulleted" size={20} color={colors.text} />
                    </Pressable>

                    {/* Numbered List */}
                    <Pressable
                      onPress={() => applyFormatting("\n1. ", "", "first item")}
                      style={s.toolBtn}
                      accessibilityLabel="Numbered list"
                    >
                      <MaterialCommunityIcons name="format-list-numbered" size={20} color={colors.text} />
                    </Pressable>

                    {/* Blockquote */}
                    <Pressable
                      onPress={() => applyFormatting("\n> ", "", "quote")}
                      style={s.toolBtn}
                      accessibilityLabel="Quote"
                    >
                      <MaterialCommunityIcons name="format-quote-close" size={20} color={colors.text} />
                    </Pressable>

                    {/* Code Block */}
                    <Pressable
                      onPress={() => applyFormatting("\n```\n", "\n```\n", "code snippet")}
                      style={s.toolBtn}
                      accessibilityLabel="Code block"
                    >
                      <MaterialCommunityIcons name="code-tags" size={20} color={colors.text} />
                    </Pressable>

                    {/* Hyperlink */}
                    <Pressable
                      onPress={() => applyFormatting("[", "](https://)", "link title")}
                      style={s.toolBtn}
                      accessibilityLabel="Link"
                    >
                      <MaterialCommunityIcons name="link-variant" size={20} color={colors.text} />
                    </Pressable>
                  </ScrollView>
                </View>

                {/* Media Attachment Action Buttons Bar */}
                <View style={[s.mediaActionsBar, { borderColor: colors.border }]}>
                  <Text style={[s.mediaActionsTitle, { color: colors.muted }]}>Add to your post:</Text>
                  <Row style={{ gap: 8 }}>
                    {/* Pick Photo Gallery */}
                    <Pressable
                      onPress={handlePickGalleryPhotos}
                      disabled={isUploading}
                      style={[s.mediaActionBtn, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}
                    >
                      <MaterialCommunityIcons name="image-multiple" size={18} color={colors.primary} />
                      <Text style={[s.mediaActionBtnText, { color: colors.primary }]}>Photos</Text>
                    </Pressable>

                    {/* Camera */}
                    <Pressable
                      onPress={handleTakePhoto}
                      disabled={isUploading}
                      style={[s.mediaActionBtn, { backgroundColor: "#10B98115", borderColor: "#10B98130" }]}
                    >
                      <MaterialCommunityIcons name="camera" size={18} color="#10B981" />
                      <Text style={[s.mediaActionBtnText, { color: "#10B981" }]}>Camera</Text>
                    </Pressable>

                    {/* Document / Slides */}
                    <Pressable
                      onPress={handlePickDocument}
                      disabled={isUploading}
                      style={[s.mediaActionBtn, { backgroundColor: "#8B5CF615", borderColor: "#8B5CF630" }]}
                    >
                      <MaterialCommunityIcons name="file-document" size={18} color="#8B5CF6" />
                      <Text style={[s.mediaActionBtnText, { color: "#8B5CF6" }]}>Document</Text>
                    </Pressable>

                    {/* Interactive Poll */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        setShowPollBuilder((prev) => !prev);
                      }}
                      style={[
                        s.mediaActionBtn,
                        showPollBuilder
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: "#F59E0B15", borderColor: "#F59E0B30" },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="poll"
                        size={18}
                        color={showPollBuilder ? "#FFFFFF" : "#F59E0B"}
                      />
                      <Text
                        style={[
                          s.mediaActionBtnText,
                          { color: showPollBuilder ? "#FFFFFF" : "#F59E0B" },
                        ]}
                      >
                        Poll
                      </Text>
                    </Pressable>

                    {/* URL Link */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        setShowUrlInput((prev) => !prev);
                      }}
                      style={[s.mediaActionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons name="link-plus" size={18} color={colors.text} />
                    </Pressable>

                    {/* YouTube */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        setShowYoutubeInput((prev) => !prev);
                      }}
                      style={[s.mediaActionBtn, { backgroundColor: "#EF444415", borderColor: "#EF444430" }]}
                    >
                      <MaterialCommunityIcons name="youtube" size={18} color="#EF4444" />
                    </Pressable>
                  </Row>
                </View>

                {/* Upload in progress banner */}
                {isUploading && (
                  <View style={[s.uploadingBanner, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[s.uploadingBannerText, { color: colors.primary }]}>
                      {uploadProgressText || "Uploading attachment..."}
                    </Text>
                  </View>
                )}

                {/* Attached Media Thumbnails */}
                {attachedMedia.length > 0 && (
                  <View style={s.attachedGallerySection}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                        Attached Media ({attachedMedia.length}/8)
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>
                        Displays in LinkedIn carousel format
                      </Text>
                    </Row>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {attachedMedia.map((item, idx) => (
                        <View key={idx} style={[s.mediaThumbBox, { borderColor: colors.border }]}>
                          {item.mediaType === "document" ? (
                            <View style={[s.mediaDocThumb, { backgroundColor: colors.surface2 }]}>
                              <MaterialCommunityIcons name="file-document" size={32} color="#8B5CF6" />
                              <Text style={[s.mediaDocName, { color: colors.text }]} numberOfLines={1}>
                                {item.fileName || "Doc"}
                              </Text>
                            </View>
                          ) : (
                            <Image source={{ uri: item.url }} style={s.mediaThumbImg} />
                          )}
                          <Pressable onPress={() => removeMedia(idx)} style={s.mediaRemoveBtn}>
                            <MaterialCommunityIcons name="close" size={13} color="#FFFFFF" />
                          </Pressable>
                          <View style={s.mediaIndexBadge}>
                            <Text style={s.mediaIndexText}>{idx + 1}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Interactive Poll Builder Card */}
                {showPollBuilder && (
                  <Card style={[s.pollBuilderCard, { borderColor: colors.border }]}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Row style={{ alignItems: "center", gap: 6 }}>
                        <MaterialCommunityIcons name="poll" size={20} color="#F59E0B" />
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                          Create a Poll
                        </Text>
                      </Row>
                      <Pressable onPress={() => setShowPollBuilder(false)}>
                        <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
                      </Pressable>
                    </Row>

                    <TextInput
                      style={[s.pollInput, { color: colors.text, borderColor: colors.border, marginTop: 8 }]}
                      placeholder="Ask a question..."
                      placeholderTextColor={colors.muted}
                      value={pollQuestion}
                      onChangeText={setPollQuestion}
                    />

                    <View style={{ gap: 6, marginTop: 8 }}>
                      {pollOptions.map((opt, i) => (
                        <Row key={i} style={{ alignItems: "center", gap: 6 }}>
                          <TextInput
                            style={[s.pollOptionInput, { color: colors.text, borderColor: colors.border, flex: 1 }]}
                            placeholder={`Option ${i + 1}`}
                            placeholderTextColor={colors.muted}
                            value={opt}
                            onChangeText={(text) => handleUpdatePollOption(text, i)}
                          />
                          {pollOptions.length > 2 && (
                            <Pressable onPress={() => handleRemovePollOption(i)} hitSlop={6}>
                              <MaterialCommunityIcons name="minus-circle-outline" size={20} color={colors.muted} />
                            </Pressable>
                          )}
                        </Row>
                      ))}
                    </View>

                    {pollOptions.length < 5 && (
                      <Pressable onPress={handleAddPollOption} style={s.addPollOptionBtn}>
                        <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                          + Add Option ({pollOptions.length}/5)
                        </Text>
                      </Pressable>
                    )}
                  </Card>
                )}

                {/* URL Image Attachment Card */}
                {showUrlInput && (
                  <Card style={[s.subInputCard, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                      Attach Image via Link
                    </Text>
                    <Row style={{ gap: 8, marginTop: 6 }}>
                      <TextInput
                        style={[s.urlInput, { color: colors.text, borderColor: colors.border, flex: 1 }]}
                        placeholder="https://example.com/photo.png"
                        placeholderTextColor={colors.muted}
                        value={mediaUrlInput}
                        onChangeText={setMediaUrlInput}
                      />
                      <Button title="Attach" compact onPress={handleAddMediaUrl} />
                    </Row>
                  </Card>
                )}

                {/* YouTube Link Card */}
                {showYoutubeInput && (
                  <Card style={[s.subInputCard, { borderColor: colors.border }]}>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <MaterialCommunityIcons name="youtube" size={18} color="#EF4444" />
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                        Embed YouTube Video
                      </Text>
                    </Row>
                    <TextInput
                      style={[s.urlInput, { color: colors.text, borderColor: colors.border, marginTop: 6 }]}
                      placeholder="https://youtube.com/watch?v=..."
                      placeholderTextColor={colors.muted}
                      value={youtubeUrl}
                      onChangeText={setYoutubeUrl}
                    />
                  </Card>
                )}

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

                {/* Anonymous Toggle */}
                <Card style={[s.anonCard, { borderColor: colors.border }]}>
                  <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Row style={{ alignItems: "center", gap: 10 }}>
                      <MaterialCommunityIcons name="incognito" size={22} color={colors.primary} />
                      <View>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                          {t("feed.postAnonymous")}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 11 }}>
                          Hide your identity & student name
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
              </>
            )}
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
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    overflow: "hidden",
  },
  headerRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150,150,150,0.2)",
  },
  closeBtn: {
    padding: 4,
  },
  tabPillContainer: {
    flexDirection: "row",
    borderRadius: radius.pill,
    padding: 3,
    gap: 4,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  tabPillText: {
    fontSize: 12.5,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
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
    fontSize: 12,
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
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  audienceChipText: {
    fontSize: 12.5,
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
    borderRadius: radius.lg,
    padding: 14,
    fontSize: 15,
    minHeight: 130,
    lineHeight: 22,
  },
  formattingToolbar: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  toolScroll: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  toolBtn: {
    padding: 8,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaActionsBar: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 8,
  },
  mediaActionsTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  mediaActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  mediaActionBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  uploadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  uploadingBannerText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  attachedGallerySection: {
    marginTop: 4,
  },
  mediaThumbBox: {
    width: 90,
    height: 90,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  mediaThumbImg: {
    width: "100%",
    height: "100%",
  },
  mediaDocThumb: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  mediaDocName: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },
  mediaRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  mediaIndexBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  mediaIndexText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  pollBuilderCard: {
    padding: 12,
    borderRadius: radius.lg,
    gap: 6,
  },
  pollInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  pollOptionInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  addPollOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 4,
    paddingVertical: 4,
  },
  subInputCard: {
    padding: 12,
    borderRadius: radius.md,
  },
  urlInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
  },
  quickTagsWrap: {
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  anonCard: {
    padding: 12,
    borderRadius: radius.lg,
  },
  previewWrapper: {
    gap: 12,
  },
  previewHintBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  previewHintText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  previewCard: {
    padding: 14,
    borderRadius: radius.lg,
  },
});
