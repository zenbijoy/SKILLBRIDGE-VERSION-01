import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { Card, Empty, Pill, Row, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { PostComposerModal } from "./PostComposerModal";
import { InstagramProfileCard } from "@/components/InstagramProfileCard";

export type Post = {
  id: string;
  author_id: string;
  author: Profile;
  body: string;
  is_anonymous: boolean;
  anonymous_handle?: string;
  media_urls: string[];
  youtube?: {
    videoId: string;
    title: string;
    thumbnailUrl: string;
    durationSeconds?: number | null;
  };
  likes_count: number;
  comments_count: number;
  pinned: boolean;
  my_reaction?: string | null;
  created_at: string;
};

export type Comment = {
  id: string;
  post_id: string;
  author: Profile;
  body: string;
  is_anonymous: boolean;
  created_at: string;
};

type FeedTab = "for_you" | "campus" | "my_groups" | "questions";

interface QuestionItem {
  id: string;
  title: string;
  body: string;
  topic?: string;
  status: string;
  answers_count?: number;
  author?: Profile;
  created_at: string;
}

interface PersonalizedHomeFeedProps {
  currentUser?: Profile | null;
  onOpenComposer?: (opts?: {
    initialTag?: string;
    initialAudience?: "public" | "campus" | "connections" | "room" | "club";
    openMediaImmediately?: boolean;
  }) => void;
}

export function PersonalizedHomeFeed({ currentUser, onOpenComposer }: PersonalizedHomeFeedProps) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<FeedTab>("for_you");
  const [composerVisible, setComposerVisible] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);
  const suggestedPeersQuery = useQuery({
    queryKey: ["recommendations", "people-feed"],
    queryFn: () => api<{ people: Profile[] }>("/recommendations/people"),
    staleTime: 60_000,
  });

  // Blinking cursor interval
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 450);
    return () => clearInterval(blinkInterval);
  }, []);

  const handleOpenPrompt = (opts?: {
    initialTag?: string;
    initialAudience?: "public" | "campus" | "connections" | "room" | "club";
    openMediaImmediately?: boolean;
  }) => {
    triggerHaptic();
    if (onOpenComposer) {
      onOpenComposer(opts);
    } else {
      setComposerVisible(true);
    }
  };

  // Prompts for typewriter cycling
  const typewriterPrompts = useMemo(() => {
    return language === "bn"
      ? [
          "কী ভাবছেন? কোনো প্রশ্ন বা স্টাডি নোট শেয়ার করুন...",
          "অ্যালগরিদম বা কোডিং সমস্যা? সহপাঠীদের জিজ্ঞেস করুন!",
          "ক্যাম্পাসের সাথে দারুণ কোনো রিসোর্স শেয়ার করবেন?",
          "গ্রুপ স্টাডি করতে চান? এখনই একটি পোস্ট করুন...",
        ]
      : [
          "What's on your mind? Share a doubt or study note...",
          "Stuck on coding or math? Ask your campus peers!",
          "Discovered an awesome resource? Share with campus!",
          "Looking for study partners? Create a quick post...",
        ];
  }, [language]);

  const [promptIndex, setPromptIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Smooth Typewriter Animation Loop
  useEffect(() => {
    const currentFullPrompt = typewriterPrompts[promptIndex] || "";
    let timer: NodeJS.Timeout;

    if (!isDeleting && typedText.length < currentFullPrompt.length) {
      timer = setTimeout(() => {
        setTypedText(currentFullPrompt.slice(0, typedText.length + 1));
      }, 55);
    } else if (!isDeleting && typedText.length === currentFullPrompt.length) {
      // Pause after completing prompt
      timer = setTimeout(() => {
        setIsDeleting(true);
      }, 2600);
    } else if (isDeleting && typedText.length > 0) {
      timer = setTimeout(() => {
        setTypedText(currentFullPrompt.slice(0, typedText.length - 1));
      }, 28);
    } else if (isDeleting && typedText.length === 0) {
      setIsDeleting(false);
      setPromptIndex((prev) => (prev + 1) % typewriterPrompts.length);
    }

    return () => clearTimeout(timer);
  }, [typedText, isDeleting, promptIndex, typewriterPrompts]);

  // 1. Fetch Campus Posts
  const feedQuery = useQuery<{ posts: Post[]; next_cursor: string | null }>({
    queryKey: ["campus-feed"],
    queryFn: () => api("/feed"),
    refetchInterval: 25_000,
  });

  // 2. Fetch Academic Questions (for Questions tab)
  const questionsQuery = useQuery<{ questions: QuestionItem[] }>({
    queryKey: ["help-questions", "feed-preview"],
    queryFn: () => api("/help/questions?limit=25"),
    enabled: activeTab === "questions",
  });

  // Reactions mutation
  const reactionMutation = useMutation({
    mutationFn: ({ postId, type }: { postId: string; type: string }) =>
      api(`/feed/${postId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ reaction_type: type }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
  });

  // Comments Query for expanded post
  const commentsQuery = useQuery<{ comments: Comment[] }>({
    queryKey: ["post-comments", expandedPostId],
    queryFn: () => api(`/feed/${expandedPostId}/comments`),
    enabled: Boolean(expandedPostId),
  });

  // Post Comment mutation
  const addCommentMutation = useMutation({
    mutationFn: ({ postId, body }: { postId: string; body: string }) =>
      api(`/feed/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, is_anonymous: false }),
      }),
    onSuccess: () => {
      triggerHaptic();
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
      qc.invalidateQueries({ queryKey: ["post-comments", expandedPostId] });
    },
  });

  // Multi-Factor Algorithmic Scoring Engine
  const rankedPosts = useMemo(() => {
    const rawPosts = feedQuery.data?.posts || [];
    const myUniversity = currentUser?.university?.toLowerCase().trim() || "";
    const myDept = currentUser?.department?.toLowerCase().trim() || "";
    const myBio = currentUser?.bio?.toLowerCase().trim() || "";

    return [...rawPosts]
      .map((post) => {
        let score = 50; // base score

        // 1. Campus Affinity (+30)
        const authorUni = post.author?.university?.toLowerCase().trim() || "";
        if (myUniversity && authorUni && myUniversity === authorUni) {
          score += 30;
        }

        // 2. Audience / Group Match (+40 for room/club, +25 for campus tag)
        if (post.body.includes("[🚪 Room:") || post.body.includes("[🛡️ Club:")) {
          score += 35;
        }
        if (post.body.includes("[🏛️") || post.body.includes("[👥 Connections]")) {
          score += 25;
        }

        // 3. Department & Academic Bio Affinity (+20)
        const lowerBody = post.body.toLowerCase();
        if (myDept && lowerBody.includes(myDept)) score += 20;
        if (myBio && myBio.split(/\s+/).some((w) => w.length > 3 && lowerBody.includes(w))) score += 15;

        // 4. Engagement Velocity
        score += Math.min((post.likes_count || 0) * 3 + (post.comments_count || 0) * 4, 30);

        // 5. Freshness / Recency Decay
        const ageHours = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
        if (ageHours < 2) score += 25;
        else if (ageHours < 12) score += 15;
        else if (ageHours < 24) score += 5;
        else score -= Math.min(ageHours * 0.5, 20);

        // 6. User's own reaction history boost
        if (post.my_reaction) score += 10;

        return { post, score };
      })
      .sort((a, b) => {
        if (activeTab === "for_you") return b.score - a.score;
        return new Date(b.post.created_at).getTime() - new Date(a.post.created_at).getTime();
      })
      .map((item) => item.post)
      .filter((post) => {
        if (activeTab === "campus") {
          return (
            (myUniversity && post.author?.university?.toLowerCase() === myUniversity) ||
            post.body.includes("[🏛️")
          );
        }
        if (activeTab === "my_groups") {
          return post.body.includes("[🚪") || post.body.includes("[🛡️");
        }
        return true;
      });
  }, [feedQuery.data?.posts, currentUser, activeTab]);

  const handleShare = async (p: Post) => {
    try {
      await Share.share({
        message: `${p.body.slice(0, 150)}...\n\nShared via SkillBridge`,
      });
    } catch {
      // Ignored
    }
  };

  const handleToggleReaction = (post: Post) => {
    triggerHaptic();
    const nextType = post.my_reaction === "like" ? "unlike" : "like";
    reactionMutation.mutate({ postId: post.id, type: nextType });
  };

  return (
    <View style={styles.feedWrapper}>
      {/* 1. UNIQUE TYPEWRITER ANIMATED PROMPT BANNER */}
      <View
        style={[
          styles.promptBanner,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderLeftColor: colors.primary,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("feed.createPost")}
          onPress={() => handleOpenPrompt()}
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <Row style={{ alignItems: "center", gap: 12 }}>
            {/* Clean Prompt Icon */}
            <View style={[styles.promptIconCircle, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="feather" size={20} color={colors.primary} />
            </View>

            {/* Dynamic Typewriter Prompt Text */}
            <View style={{ flex: 1 }}>
              <Row style={{ alignItems: "center", gap: 2 }}>
                <Text style={[styles.typewriterText, { color: typedText ? colors.text : colors.muted }]}>
                  {typedText || "কী ভাবছেন?..."}
                </Text>
                <View
                  style={[
                    styles.cursorBlink,
                    { backgroundColor: colors.primary, opacity: cursorVisible ? 1 : 0 },
                  ]}
                />
              </Row>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                {t("feed.createPost")} • {t("feed.audiencePublic")}
              </Text>
            </View>

            {/* Glowing Action Button */}
            <View style={[styles.promptActionBtn, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
            </View>
          </Row>
        </Pressable>

        {/* Subtle Divider */}
        <View style={[styles.promptDivider, { backgroundColor: colors.border }]} />

        {/* Quick Action Micro Chips */}
        <View style={styles.quickActionsRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => handleOpenPrompt({ openMediaImmediately: true })}
            style={({ pressed }) => [
              styles.quickActionChip,
              { backgroundColor: colors.primarySoft, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="image-outline" size={14} color={colors.primary} />
            <Text style={[styles.quickActionText, { color: colors.primary }]}>{t("feed.quickPhoto")}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => handleOpenPrompt({ initialTag: "#Question", initialAudience: "campus" })}
            style={({ pressed }) => [
              styles.quickActionChip,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="help-circle-outline" size={14} color="#E67E22" />
            <Text style={[styles.quickActionText, { color: colors.text }]}>{t("feed.quickQuestion")}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => handleOpenPrompt({ initialTag: "#Resource" })}
            style={({ pressed }) => [
              styles.quickActionChip,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="lightbulb-outline" size={14} color="#9B59B6" />
            <Text style={[styles.quickActionText, { color: colors.text }]}>{t("feed.quickResource")}</Text>
          </Pressable>
        </View>
      </View>

      {/* 2. SEGMENTED FEED TABS */}
      <View style={styles.tabScrollWrap}>
        {(
          [
            { key: "for_you", label: t("feed.tabForYou"), icon: "creation" },
            { key: "campus", label: t("feed.tabCampus"), icon: "domain" },
            { key: "my_groups", label: t("feed.tabMyGroups"), icon: "shield-account" },
            { key: "questions", label: t("feed.tabQuestions"), icon: "help-circle-outline" },
          ] as const
        ).map((tab) => {
          const isSelected = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                triggerHaptic();
                setActiveTab(tab.key);
              }}
              style={[
                styles.feedTabBtn,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={14}
                color={isSelected ? "#FFFFFF" : colors.muted}
              />
              <Text
                style={[
                  styles.feedTabText,
                  { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "800" : "600" },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 3. FEED POSTS LIST */}
      {feedQuery.isLoading && activeTab !== "questions" ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Skeleton height={140} radiusValue={radius.lg} />
          <Skeleton height={140} radiusValue={radius.lg} />
        </View>
      ) : activeTab === "questions" ? (
        /* Academic Questions tab content */
        <View style={{ gap: 10, marginTop: 4 }}>
          {questionsQuery.isLoading ? (
            <Skeleton height={120} />
          ) : (questionsQuery.data?.questions || []).length === 0 ? (
            <Empty
              icon="help-circle-outline"
              title={t("feed.noPosts")}
              detail={t("feed.noPostsDetail")}
              actionTitle={t("feed.createPost")}
              onAction={() => setComposerVisible(true)}
            />
          ) : (
            (questionsQuery.data?.questions || []).map((q) => (
              <Card key={q.id} style={styles.postCard}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      {q.topic ? <Pill tone="primary">#{q.topic}</Pill> : null}
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {new Date(q.created_at).toLocaleDateString()}
                      </Text>
                    </Row>
                    <Text style={[styles.questionTitle, { color: colors.text }]}>{q.title}</Text>
                    <Text style={[styles.postBody, { color: colors.text }]} numberOfLines={3}>
                      {q.body}
                    </Text>
                  </View>
                </Row>
                <Row style={{ marginTop: 10, justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    💬 {q.answers_count || 0} answers
                  </Text>
                  <Pressable
                    onPress={() => router.push(`/help/questions/${q.id}` as any)}
                    style={[styles.answerBtn, { backgroundColor: colors.primarySoft }]}
                  >
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                      Answer Question →
                    </Text>
                  </Pressable>
                </Row>
              </Card>
            ))
          )}
        </View>
      ) : rankedPosts.length === 0 ? (
        <Empty
          icon="newspaper-variant-outline"
          title={t("feed.noPosts")}
          detail={t("feed.noPostsDetail")}
          actionTitle={t("feed.createPost")}
          onAction={() => setComposerVisible(true)}
        />
      ) : (
        rankedPosts.map((post, idx) => {
          const isLiked = post.my_reaction === "like";
          const isExpanded = expandedPostId === post.id;

          return (
            <React.Fragment key={post.id}>
              <Animated.View
                entering={FadeInDown.delay(Math.min(idx * 50, 300)).springify()}
              layout={Layout.springify()}
            >
              <Card style={styles.postCard}>
                {/* Author Info */}
                <Row style={styles.postHeader}>
                  <Pressable
                    onPress={() => {
                      if (!post.is_anonymous && post.author_id) {
                        router.push(`/user/${post.author_id}` as any);
                      }
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
                  >
                    <View style={[styles.postAvatar, { backgroundColor: colors.primarySoft }]}>
                      {post.is_anonymous ? (
                        <MaterialCommunityIcons name="incognito" size={20} color={colors.primary} />
                      ) : (
                        <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 15 }}>
                          {post.author?.full_name?.[0] || "U"}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
                        {post.is_anonymous
                          ? post.anonymous_handle || "Anonymous Peer"
                          : post.author?.full_name || "SkillBridge Student"}
                      </Text>
                      <Text style={[styles.postMeta, { color: colors.muted }]} numberOfLines={1}>
                        {post.author?.university || "Campus Community"} •{" "}
                        {new Date(post.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </View>
                  </Pressable>
                </Row>

                {/* Post Body Content */}
                <Text style={[styles.postBody, { color: colors.text }]}>{post.body}</Text>

                {/* Attached Image Gallery */}
                {post.media_urls && post.media_urls.length > 0 && (
                  <View style={styles.mediaGallery}>
                    {post.media_urls.map((url: string, i: number) => (
                      <Pressable key={i} onPress={() => Linking.openURL(url)}>
                        <Image source={{ uri: url }} style={styles.postImage} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* YouTube Video Embed Preview */}
                {post.youtube && (
                  <Pressable
                    onPress={() => Linking.openURL(`https://youtube.com/watch?v=${post.youtube?.videoId}`)}
                    style={[styles.youtubeCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  >
                    <Row style={{ alignItems: "center", gap: 10 }}>
                      <Image source={{ uri: post.youtube.thumbnailUrl }} style={styles.ytThumb} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.ytTitle, { color: colors.text }]} numberOfLines={2}>
                          {post.youtube.title}
                        </Text>
                        <Row style={{ alignItems: "center", gap: 4 }}>
                          <MaterialCommunityIcons name="youtube" size={16} color="#EF4444" />
                          <Text style={{ color: "#EF4444", fontSize: 11, fontWeight: "700" }}>Watch Video</Text>
                        </Row>
                      </View>
                    </Row>
                  </Pressable>
                )}

                {/* Post Footer Metrics & Actions */}
                <View style={[styles.postFooter, { borderTopColor: colors.border }]}>
                  {/* Like Button */}
                  <Pressable
                    onPress={() => handleToggleReaction(post)}
                    style={styles.actionBtn}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons
                      name={isLiked ? "heart" : "heart-outline"}
                      size={20}
                      color={isLiked ? "#EF4444" : colors.muted}
                    />
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: isLiked ? "#EF4444" : colors.muted, fontWeight: isLiked ? "700" : "500" },
                      ]}
                    >
                      {post.likes_count || 0}
                    </Text>
                  </Pressable>

                  {/* Comment Button */}
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setExpandedPostId(isExpanded ? null : post.id);
                    }}
                    style={styles.actionBtn}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons
                      name="comment-outline"
                      size={18}
                      color={isExpanded ? colors.primary : colors.muted}
                    />
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: isExpanded ? colors.primary : colors.muted, fontWeight: isExpanded ? "700" : "500" },
                      ]}
                    >
                      {post.comments_count || 0}
                    </Text>
                  </Pressable>

                  {/* Share Button */}
                  <Pressable onPress={() => handleShare(post)} style={styles.actionBtn} hitSlop={6}>
                    <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.muted} />
                  </Pressable>
                </View>

                {/* Expanded Inline Comments Section */}
                {isExpanded && (
                  <Animated.View entering={FadeIn.duration(200)} style={styles.commentsWrap}>
                    {commentsQuery.isLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
                    ) : (
                      commentsQuery.data?.comments?.map((c) => (
                        <View key={c.id} style={[styles.commentBubble, { backgroundColor: colors.surface2 }]}>
                          <Text style={[styles.commentAuthor, { color: colors.text }]}>
                            {c.is_anonymous ? "Anonymous Peer" : c.author?.full_name || "Peer"}
                          </Text>
                          <Text style={[styles.commentBody, { color: colors.text }]}>{c.body}</Text>
                        </View>
                      ))
                    )}

                    {/* Inline Comment Input Box */}
                    <Row style={{ gap: 8, marginTop: 8 }}>
                      <TextInput
                        style={[styles.commentInput, { color: colors.text, borderColor: colors.border }]}
                        placeholder="Write a comment..."
                        placeholderTextColor={colors.muted}
                        value={commentText}
                        onChangeText={setCommentText}
                      />
                      <Pressable
                        disabled={!commentText.trim() || addCommentMutation.isPending}
                        onPress={() =>
                          addCommentMutation.mutate({ postId: post.id, body: commentText.trim() })
                        }
                        style={[
                          styles.commentSendBtn,
                          {
                            backgroundColor: commentText.trim() ? colors.primary : colors.surface2,
                            opacity: commentText.trim() ? 1 : 0.5,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="send"
                          size={16}
                          color={commentText.trim() ? "#FFFFFF" : colors.muted}
                        />
                      </Pressable>
                    </Row>
                  </Animated.View>
                )}
              </Card>
            </Animated.View>

            {/* Instagram-Style Suggested Peers In-Feed Carousel (After 3rd post or every 20 posts) */}
            {(idx === 2 || (idx > 0 && (idx + 1) % 20 === 0)) &&
              (suggestedPeersQuery.data?.people?.length ?? 0) > 0 && (
                <View
                  style={[
                    styles.inFeedPeersSection,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Row style={styles.inFeedPeersHeader}>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <MaterialCommunityIcons name="account-group" size={18} color={colors.primary} />
                      <Text style={[styles.inFeedPeersTitle, { color: colors.text }]}>
                        {t("feed.suggestedPeers", "People You May Know")}
                      </Text>
                    </Row>
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        router.push("/(tabs)/discover" as any);
                      }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                        {t("common.seeAll", "See all")} →
                      </Text>
                    </Pressable>
                  </Row>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 4 }}
                  >
                    {suggestedPeersQuery.data!.people.map((peer) => (
                      <InstagramProfileCard key={peer.id} profile={peer} />
                    ))}
                  </ScrollView>
                </View>
              )}
          </React.Fragment>
        );
        })
      )}

      {/* 4. FLOATING ACTION BUTTON (+) (Only when standalone) */}
      {!onOpenComposer ? (
        <Pressable
          onPress={() => {
            triggerHaptic();
            setComposerVisible(true);
          }}
          style={({ pressed }) => [
            styles.floatingFab,
            {
              backgroundColor: colors.primary,
              transform: [{ scale: pressed ? 0.92 : 1 }],
            },
          ]}
        >
          <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {/* 5. POST COMPOSER MODAL (Only when standalone) */}
      {!onOpenComposer ? (
        <PostComposerModal
          visible={composerVisible}
          onClose={() => setComposerVisible(false)}
          currentUser={currentUser}
          onPostCreated={() => {
            qc.invalidateQueries({ queryKey: ["campus-feed"] });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  feedWrapper: {
    marginTop: spacing.sm,
    gap: 12,
    position: "relative",
  },
  promptBanner: {
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  promptIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  inFeedPeersSection: {
    marginVertical: 10,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  inFeedPeersHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  inFeedPeersTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  promptDivider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  quickActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  quickActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  typewriterText: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  cursorBlink: {
    width: 2,
    height: 16,
    borderRadius: 1,
  },
  promptActionBtn: {
    padding: 8,
    borderRadius: 20,
  },
  tabScrollWrap: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  feedTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  feedTabText: {
    fontSize: 12,
  },
  postCard: {
    padding: 14,
    borderRadius: radius.lg,
    gap: 10,
  },
  postHeader: {
    justifyContent: "space-between",
    alignItems: "center",
  },
  postAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  authorName: {
    fontSize: 14,
    fontWeight: "700",
  },
  postMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  postBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  questionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  answerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  mediaGallery: {
    borderRadius: radius.md,
    overflow: "hidden",
    marginTop: 4,
  },
  postImage: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
  },
  youtubeCard: {
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 4,
  },
  ytThumb: {
    width: 72,
    height: 48,
    borderRadius: radius.sm,
  },
  ytTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  postFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  actionBtnText: {
    fontSize: 13,
  },
  commentsWrap: {
    gap: 6,
    marginTop: 6,
  },
  commentBubble: {
    padding: 8,
    borderRadius: radius.md,
    gap: 2,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: "700",
  },
  commentBody: {
    fontSize: 13,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  commentSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingFab: {
    position: "absolute",
    bottom: 20,
    right: 16,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 99,
  },
});
