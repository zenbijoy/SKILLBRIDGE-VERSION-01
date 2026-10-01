import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import type {
  PostType,
  PostVisibility,
  PostAppearance,
  PostEventMetadata,
  PostOpportunityMetadata,
  PostAchievementMetadata,
  PostStudyNoteMetadata,
  PostCodeMetadata,
  PostQuoteMetadata,
  PostMention,
  SocialPost,
} from "../../types";

import { ComposerHeader } from "./ComposerHeader";
import { PostTypeSelector } from "./PostTypeSelector";
import { FormattingToolbar } from "./FormattingToolbar";
import { AppearancePicker } from "./AppearancePicker";
import { MediaUploader, UploadedMediaItem } from "./MediaUploader";
import { PollBuilder, PollBuilderData } from "./PollBuilder";
import { EventBuilder } from "./EventBuilder";
import { AchievementBuilder } from "./AchievementBuilder";
import { OpportunityBuilder } from "./OpportunityBuilder";
import { StudyNoteBuilder } from "./StudyNoteBuilder";
import { CodeEditor } from "./CodeEditor";
import { QuoteBuilder } from "./QuoteBuilder";
import { MentionPicker } from "./MentionPicker";
import { HashtagPicker } from "./HashtagPicker";
import { AiAssistModal } from "./AiAssistModal";
import { ComposerPreview } from "./ComposerPreview";

const DRAFT_STORAGE_KEY = "@skillbridge_social_post_draft_v2";

type ComposerState = "idle" | "editing" | "uploading" | "publishing" | "failed";

interface PostComposerProps {
  userProfile?: Profile | null;
  onPostPublished?: (newPost: SocialPost) => void;
  clubId?: string | null;
}

export function PostComposer({ userProfile, onPostPublished, clubId }: PostComposerProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [composerState, setComposerState] = useState<ComposerState>("idle");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  // Post form state
  const [postType, setPostType] = useState<PostType>("standard");
  const [bodyText, setBodyText] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [appearance, setAppearance] = useState<PostAppearance>({ theme: "default", alignment: "left" });
  const [attachedMedia, setAttachedMedia] = useState<UploadedMediaItem[]>([]);
  const [mentions, setMentions] = useState<PostMention[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);

  // Sub-builders state
  const [pollData, setPollData] = useState<PollBuilderData | null>(null);
  const [eventData, setEventData] = useState<PostEventMetadata | null>(null);
  const [achievementData, setAchievementData] = useState<PostAchievementMetadata | null>(null);
  const [opportunityData, setOpportunityData] = useState<PostOpportunityMetadata | null>(null);
  const [studyNoteData, setStudyNoteData] = useState<PostStudyNoteMetadata | null>(null);
  const [codeData, setCodeData] = useState<PostCodeMetadata | null>(null);
  const [quoteData, setQuoteData] = useState<PostQuoteMetadata | null>(null);

  // Modals & Panels
  const [showAppearancePicker, setShowAppearancePicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [showHashtagPicker, setShowHashtagPicker] = useState(false);
  const [showAiAssist, setShowAiAssist] = useState(false);

  const textInputRef = useRef<TextInput | null>(null);
  const saveDraftTimer = useRef<NodeJS.Timeout | null>(null);

  // On open: check for existing draft
  const handleOpenComposer = async (initialType?: PostType) => {
    triggerHaptic("selection");
    if (initialType) {
      handleSwitchType(initialType);
    }
    setIsOpen(true);
    setComposerState("editing");

    // Check AsyncStorage draft
    try {
      const saved = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.body || draft.poll || draft.attachments?.length > 0) {
          Alert.alert("Resume Draft?", "You have an unfinished post saved.", [
            {
              text: "Discard",
              style: "destructive",
              onPress: () => AsyncStorage.removeItem(DRAFT_STORAGE_KEY),
            },
            {
              text: "Resume",
              onPress: () => {
                setPostType(draft.post_type || "standard");
                setBodyText(draft.body || "");
                setVisibility(draft.visibility || "public");
                setIsAnonymous(Boolean(draft.is_anonymous));
                if (draft.appearance) setAppearance(draft.appearance);
                if (draft.poll) setPollData(draft.poll);
                if (draft.event) setEventData(draft.event);
                if (draft.achievement) setAchievementData(draft.achievement);
                if (draft.opportunity) setOpportunityData(draft.opportunity);
                if (draft.study_note) setStudyNoteData(draft.study_note);
                if (draft.code) setCodeData(draft.code);
                if (draft.quote) setQuoteData(draft.quote);
                if (draft.attachedMedia) setAttachedMedia(draft.attachedMedia);
              },
            },
          ]);
        }
      }
    } catch {}
  };

  // Debounced draft autosave
  useEffect(() => {
    if (!isOpen || composerState !== "editing") return;

    if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);

    saveDraftTimer.current = setTimeout(async () => {
      if (!bodyText.trim() && !pollData && attachedMedia.length === 0) return;
      try {
        const draftObj = {
          post_type: postType,
          body: bodyText,
          visibility,
          is_anonymous: isAnonymous,
          appearance,
          attachedMedia,
          poll: pollData,
          event: eventData,
          achievement: achievementData,
          opportunity: opportunityData,
          study_note: studyNoteData,
          code: codeData,
          quote: quoteData,
        };
        await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftObj));
      } catch {}
    }, 800);

    return () => {
      if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
    };
  }, [
    bodyText,
    postType,
    visibility,
    isAnonymous,
    appearance,
    attachedMedia,
    pollData,
    eventData,
    achievementData,
    opportunityData,
    studyNoteData,
    codeData,
    quoteData,
    isOpen,
    composerState,
  ]);

  // Switch post type & initialize respective builder if needed
  const handleSwitchType = (type: PostType) => {
    setPostType(type);
    if (type === "text_art" && appearance.theme === "default") {
      setAppearance({ theme: "midnight", alignment: "center", backgroundType: "gradient" });
    }
    if (type === "poll" && !pollData) {
      setPollData({ question: "", options: ["", ""], is_multiple: false, is_anonymous: false });
    }
    if (type === "event" && !eventData) {
      setEventData({ title: "", date: "", start_time: "", location: "Main Campus", is_online: false });
    }
    if (type === "achievement" && !achievementData) {
      setAchievementData({ title: "", skill_name: "General" });
    }
    if (type === "opportunity" && !opportunityData) {
      setOpportunityData({ title: "", organization: "", type: "internship", location: "On-site", is_remote: false });
    }
    if (type === "study_note" && !studyNoteData) {
      setStudyNoteData({ subject: "", key_ideas: [""] });
    }
    if (type === "code" && !codeData) {
      setCodeData({ language: "python", code: "" });
    }
    if (type === "quote" && !quoteData) {
      setQuoteData({ quote: "", author: "" });
    }
  };

  // Close confirmation
  const handleClose = () => {
    if (bodyText.trim() || pollData || attachedMedia.length > 0) {
      Alert.alert("Save Draft?", "Do you want to save this post as a draft?", [
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
            resetComposer();
            setIsOpen(false);
          },
        },
        {
          text: "Save Draft",
          onPress: () => setIsOpen(false),
        },
      ]);
    } else {
      resetComposer();
      setIsOpen(false);
    }
  };

  const resetComposer = () => {
    setBodyText("");
    setPostType("standard");
    setAppearance({ theme: "default", alignment: "left" });
    setAttachedMedia([]);
    setMentions([]);
    setHashtags([]);
    setPollData(null);
    setEventData(null);
    setAchievementData(null);
    setOpportunityData(null);
    setStudyNoteData(null);
    setCodeData(null);
    setQuoteData(null);
    setActiveTab("edit");
    setComposerState("idle");
  };

  // Insert markdown tag helper
  const handleInsertMarkdown = (prefix: string, suffix = "", defaultText = "") => {
    setBodyText((prev) => `${prev} ${prefix}${defaultText}${suffix} `);
  };

  // Mutation to create post
  const publishMutation = useMutation({
    mutationFn: async () => {
      // Validate
      const trimmedBody = bodyText.trim();
      if (!trimmedBody && !pollData && attachedMedia.length === 0 && !codeData && !quoteData) {
        throw new Error("Please write something or attach content to publish.");
      }

      const mediaUrls = attachedMedia.map((m) => m.url);
      const mediaObjectIds = attachedMedia.map((m) => m.mediaObjectId).filter(Boolean);

      // Extract hashtags from body
      const extractedTags = Array.from(new Set(trimmedBody.match(/#[A-Za-z0-9_]+/g) || []));
      const mergedTags = Array.from(new Set([...hashtags, ...extractedTags]));

      const payload = {
        body: trimmedBody || (pollData ? pollData.question : "Campus Update"),
        post_type: postType,
        appearance,
        visibility,
        club_id: clubId || null,
        is_anonymous: isAnonymous,
        media_urls: mediaUrls,
        media_object_ids: mediaObjectIds,
        mentions,
        hashtags: mergedTags,
        type_metadata: {
          event: eventData || undefined,
          opportunity: opportunityData || undefined,
          achievement: achievementData || undefined,
          study_note: studyNoteData || undefined,
          code: codeData || undefined,
          quote: quoteData || undefined,
        },
        poll: pollData
          ? {
              question: pollData.question || trimmedBody,
              options: pollData.options.filter((o) => o.trim().length > 0),
              is_multiple: pollData.is_multiple,
              is_anonymous: pollData.is_anonymous,
            }
          : undefined,
      };

      return api<{ post: SocialPost }>("/feed", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data) => {
      triggerHaptic("notificationSuccess");
      AsyncStorage.removeItem(DRAFT_STORAGE_KEY).catch(() => {});
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
      if (data?.post && onPostPublished) {
        onPostPublished(data.post);
      }
      resetComposer();
      setIsOpen(false);
    },
    onError: (err: Error) => {
      setComposerState("failed");
      Alert.alert(
        "Could Not Publish",
        `${err.message}\n\nYour post draft has been safely preserved.`,
        [{ text: "OK" }],
      );
    },
  });

  const handlePublish = async () => {
    setComposerState("publishing");
    publishMutation.mutate();
  };

  // Preview object matching canonical SocialPost structure
  const previewPost: SocialPost = {
    id: "preview-id",
    author_id: userProfile?.id || "my-id",
    author: userProfile || {
      id: "preview-user",
      full_name: "You",
      username: "you",
      avatar_url: null,
      headline: "Campus Student",
    } as any,
    body: bodyText || "What's on your mind?",
    post_type: postType,
    appearance,
    visibility,
    is_anonymous: isAnonymous,
    anonymous_handle: isAnonymous ? "Anonymous Student" : undefined,
    media_urls: attachedMedia.map((m) => m.url),
    attachments: attachedMedia.map((m, idx) => ({
      id: m.mediaObjectId || `att-${idx}`,
      url: m.url,
      media_type: m.mediaType,
      sort_order: idx,
    })),
    poll: pollData
      ? {
          id: "preview-poll",
          question: pollData.question || "Poll Question",
          is_multiple: pollData.is_multiple,
          is_anonymous: pollData.is_anonymous,
          total_votes: 0,
          options: pollData.options.map((opt, i) => ({
            id: `opt-${i}`,
            option_text: opt || `Option ${i + 1}`,
            votes_count: 0,
          })),
        }
      : null,
    type_metadata: {
      event: eventData || undefined,
      achievement: achievementData || undefined,
      opportunity: opportunityData || undefined,
      study_note: studyNoteData || undefined,
      code: codeData || undefined,
      quote: quoteData || undefined,
    },
    likes_count: 0,
    comments_count: 0,
    shares_count: 0,
    saves_count: 0,
    pinned: false,
    created_at: new Date().toISOString(),
  };

  const isPublishDisabled =
    publishMutation.isPending ||
    composerState === "publishing" ||
    (!bodyText.trim() && !pollData && attachedMedia.length === 0 && !codeData && !quoteData);

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          1. FEED COMPOSER TRIGGER BAR
      ───────────────────────────────────────────────────────────── */}
      <View style={[styles.triggerCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Row style={styles.triggerTopRow}>
          {userProfile?.avatar_url ? (
            <Pressable onPress={() => handleOpenComposer()}>
              <TextInput
                editable={false}
                style={{ display: "none" }}
              />
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => handleOpenComposer()}
            style={[styles.triggerInputBtn, { backgroundColor: colors.bg, borderColor: colors.border }]}
          >
            <Text style={[styles.triggerPlaceholder, { color: colors.muted }]}>
              What's on your mind, {userProfile?.full_name?.split(" ")[0] || "Student"}?
            </Text>
          </Pressable>
        </Row>

        {/* Quick Media / Type Action Badges */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickPillsScroll}>
          <Row style={{ gap: 8 }}>
            <Pressable
              onPress={() => handleOpenComposer("standard")}
              style={[styles.quickPill, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="image-plus" size={16} color="#10B981" />
              <Text style={[styles.quickPillText, { color: colors.text }]}>Photo</Text>
            </Pressable>

            <Pressable
              onPress={() => handleOpenComposer("poll")}
              style={[styles.quickPill, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="poll" size={16} color="#3B82F6" />
              <Text style={[styles.quickPillText, { color: colors.text }]}>Poll</Text>
            </Pressable>

            <Pressable
              onPress={() => handleOpenComposer("text_art")}
              style={[styles.quickPill, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="palette-outline" size={16} color="#8B5CF6" />
              <Text style={[styles.quickPillText, { color: colors.text }]}>Style Card</Text>
            </Pressable>

            <Pressable
              onPress={() => handleOpenComposer("event")}
              style={[styles.quickPill, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="calendar-star" size={16} color="#EC4899" />
              <Text style={[styles.quickPillText, { color: colors.text }]}>Event</Text>
            </Pressable>

            <Pressable
              onPress={() => handleOpenComposer("achievement")}
              style={[styles.quickPill, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="trophy-outline" size={16} color="#EAB308" />
              <Text style={[styles.quickPillText, { color: colors.text }]}>Achievement</Text>
            </Pressable>

            <Pressable
              onPress={() => handleOpenComposer("question")}
              style={[styles.quickPill, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="help-circle-outline" size={16} color="#F59E0B" />
              <Text style={[styles.quickPillText, { color: colors.text }]}>Question</Text>
            </Pressable>

            <Pressable
              onPress={() => handleOpenComposer("code")}
              style={[styles.quickPill, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="code-tags" size={16} color="#14B8A6" />
              <Text style={[styles.quickPillText, { color: colors.text }]}>Code</Text>
            </Pressable>
          </Row>
        </ScrollView>
      </View>

      {/* ─────────────────────────────────────────────────────────────
          2. FULL-SCREEN / RESPONSIVE POST COMPOSER MODAL
      ───────────────────────────────────────────────────────────── */}
      <Modal visible={isOpen} animationType="slide" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.modalContainer, { backgroundColor: colors.bg }]}
        >
          {/* Header */}
          <ComposerHeader
            userProfile={userProfile}
            visibility={visibility}
            isAnonymous={isAnonymous}
            onVisibilityChange={setVisibility}
            onAnonymousChange={setIsAnonymous}
            onClose={handleClose}
          />

          {/* Mode Switcher Tabs (Edit / Live Preview) */}
          <Row style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => setActiveTab("edit")}
              style={[styles.tabBtn, activeTab === "edit" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === "edit" ? colors.primary : colors.muted, fontWeight: activeTab === "edit" ? "800" : "600" },
                ]}
              >
                Compose
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab("preview")}
              style={[styles.tabBtn, activeTab === "preview" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Row style={{ alignItems: "center", gap: 5 }}>
                <MaterialCommunityIcons
                  name="eye-outline"
                  size={16}
                  color={activeTab === "preview" ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    styles.tabBtnText,
                    { color: activeTab === "preview" ? colors.primary : colors.muted, fontWeight: activeTab === "preview" ? "800" : "600" },
                  ]}
                >
                  Live Preview
                </Text>
              </Row>
            </Pressable>
          </Row>

          {/* Editor Body */}
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === "preview" ? (
              <ComposerPreview post={previewPost} />
            ) : (
              <>
                {/* Post Type Selector Pills */}
                <PostTypeSelector selectedType={postType} onSelectType={handleSwitchType} />

                {/* Main Text Input */}
                <TextInput
                  ref={textInputRef}
                  style={[
                    styles.mainTextInput,
                    { color: colors.text },
                    postType === "text_art" && styles.textArtInputMode,
                  ]}
                  placeholder={
                    postType === "question"
                      ? "What is your question for campus seniors and peers?"
                      : postType === "achievement"
                        ? "Describe what you achieved and key learnings..."
                        : postType === "announcement"
                          ? "Write official notice or announcement details..."
                          : "What would you like to share with the campus community?"
                  }
                  placeholderTextColor={colors.muted}
                  value={bodyText}
                  onChangeText={setBodyText}
                  multiline
                  autoFocus
                />

                {/* Sub-builders */}
                {pollData && (
                  <PollBuilder
                    data={pollData}
                    onChange={setPollData}
                    onRemove={() => setPollData(null)}
                  />
                )}

                {eventData && (
                  <EventBuilder
                    data={eventData}
                    onChange={setEventData}
                    onRemove={() => setEventData(null)}
                  />
                )}

                {achievementData && (
                  <AchievementBuilder
                    data={achievementData}
                    onChange={setAchievementData}
                    onRemove={() => setAchievementData(null)}
                  />
                )}

                {opportunityData && (
                  <OpportunityBuilder
                    data={opportunityData}
                    onChange={setOpportunityData}
                    onRemove={() => setOpportunityData(null)}
                  />
                )}

                {studyNoteData && (
                  <StudyNoteBuilder
                    data={studyNoteData}
                    onChange={setStudyNoteData}
                    onRemove={() => setStudyNoteData(null)}
                  />
                )}

                {codeData && (
                  <CodeEditor
                    data={codeData}
                    onChange={setCodeData}
                    onRemove={() => setCodeData(null)}
                  />
                )}

                {quoteData && (
                  <QuoteBuilder
                    data={quoteData}
                    onChange={setQuoteData}
                    onRemove={() => setQuoteData(null)}
                  />
                )}

                {/* Media Uploader Tray */}
                <MediaUploader
                  attachedMedia={attachedMedia}
                  onChange={setAttachedMedia}
                  onUploadingChange={(isUp) => setComposerState(isUp ? "uploading" : "editing")}
                />
              </>
            )}
          </ScrollView>

          {/* Collapsible Appearance Drawer */}
          {showAppearancePicker && activeTab === "edit" && (
            <AppearancePicker
              appearance={appearance}
              onChangeAppearance={setAppearance}
              onClose={() => setShowAppearancePicker(false)}
            />
          )}

          {/* Formatting & Quick Action Toolbar */}
          {activeTab === "edit" && (
            <FormattingToolbar
              onInsertMarkdown={handleInsertMarkdown}
              onOpenMentions={() => setShowMentionPicker(true)}
              onOpenHashtags={() => setShowHashtagPicker(true)}
              onOpenEmoji={() => handleInsertMarkdown("😊")}
              onOpenAiAssist={() => setShowAiAssist(true)}
              onToggleAppearance={() => setShowAppearancePicker(!showAppearancePicker)}
              isAppearanceActive={showAppearancePicker}
            />
          )}

          {/* Bottom Bar with Publish Button */}
          <Row style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              {isAnonymous && (
                <Row style={{ alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="incognito" size={16} color={colors.primary} />
                  <Text style={[styles.bottomMeta, { color: colors.muted }]}>Shielded</Text>
                </Row>
              )}
            </Row>

            <Pressable
              disabled={isPublishDisabled}
              onPress={handlePublish}
              style={[
                styles.publishBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: isPublishDisabled ? 0.5 : 1,
                },
              ]}
            >
              {publishMutation.isPending ? (
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.publishBtnText}>Publishing...</Text>
                </Row>
              ) : (
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
                  <Text style={styles.publishBtnText}>Publish Post</Text>
                </Row>
              )}
            </Pressable>
          </Row>

          {/* Auxiliary Modals */}
          <MentionPicker
            visible={showMentionPicker}
            onSelect={(m) => {
              setMentions((prev) => [...prev, m]);
              handleInsertMarkdown(`@${m.username}`);
            }}
            onClose={() => setShowMentionPicker(false)}
          />

          <HashtagPicker
            visible={showHashtagPicker}
            onSelect={(tag) => {
              setHashtags((prev) => [...prev, tag]);
              handleInsertMarkdown(`${tag}`);
            }}
            onClose={() => setShowHashtagPicker(false)}
          />

          <AiAssistModal
            visible={showAiAssist}
            currentText={bodyText}
            onApplyResult={(newText) => setBodyText(newText)}
            onClose={() => setShowAiAssist(false)}
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 14,
  },
  triggerTopRow: {
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  triggerInputBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
  },
  triggerPlaceholder: {
    fontSize: 13.5,
  },
  quickPillsScroll: {
    flexDirection: "row",
  },
  quickPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  quickPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
  },
  tabBar: {
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  tabBtnText: {
    fontSize: 13,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mainTextInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: "top",
    marginVertical: 8,
  },
  textArtInputMode: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
  },
  bottomBar: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  bottomMeta: {
    fontSize: 12,
  },
  publishBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  publishBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
});
