import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  Layout,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import {
  Card,
  Empty,
  ErrorState,
  Pill,
  Row,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { PostComposerModal } from "./PostComposerModal";
import { InstagramProfileCard } from "@/components/InstagramProfileCard";
import { UniversalShareSheet } from "@/components/UniversalShareSheet";
import {
  PostCard,
  EditPostModal,
  type SocialPost,
  type ReactionType,
} from "@/features/social";

export type { SocialPost as Post };

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
  const [sharingPost, setSharingPost] = useState<SocialPost | null>(null);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [cursorVisible, setCursorVisible] = useState(true);

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

  // 1. Fetch Campus Posts with cursor pagination
  const feedQuery = useInfiniteQuery<{
    posts: SocialPost[];
    next_cursor: string | null;
    has_more?: boolean;
  }>({
    queryKey: ["campus-feed"],
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/feed?cursor=${encodeURIComponent(pageParam as string)}&limit=20`
        : "/feed?limit=20";
      return api<{ posts: SocialPost[]; next_cursor: string | null; has_more?: boolean }>(url);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage?.next_cursor ?? undefined,
    refetchInterval: 30_000,
  });

  const allPosts = useMemo(
    () => feedQuery.data?.pages.flatMap((page) => page.posts || []) || [],
    [feedQuery.data?.pages],
  );

  // 2. Fetch Academic Questions (for Questions tab)
  const questionsQuery = useQuery<{ questions: QuestionItem[] }>({
    queryKey: ["help-questions", "feed-preview"],
    queryFn: () => api("/help/questions?limit=25"),
    enabled: activeTab === "questions",
  });

  // 3. Suggested Peers In-Feed
  const suggestedPeersQuery = useQuery({
    queryKey: ["recommendations", "people-feed"],
    queryFn: () => api<{ people: Profile[] }>("/recommendations/people"),
    staleTime: 60_000,
  });

  // 4. Reactions mutation with Optimistic Update
  const reactionMutation = useMutation({
    mutationFn: ({ postId, type }: { postId: string; type: ReactionType }) =>
      api(`/feed/${postId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ reaction_type: type }),
      }),
    onMutate: async ({ postId, type }) => {
      triggerHaptic();
      await qc.cancelQueries({ queryKey: ["campus-feed"] });
      const previous = qc.getQueryData<
        InfiniteData<{ posts: SocialPost[]; next_cursor: string | null; has_more?: boolean }>
      >(["campus-feed"]);

      if (previous) {
        qc.setQueryData<
          InfiniteData<{ posts: SocialPost[]; next_cursor: string | null; has_more?: boolean }>
        >(["campus-feed"], {
          ...previous,
          pages: previous.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) => {
              if (p.id !== postId) return p;
              const wasSameReaction = p.my_reaction === type;
              const deltaLikes = wasSameReaction ? -1 : p.my_reaction ? 0 : 1;
              return {
                ...p,
                my_reaction: wasSameReaction ? null : type,
                likes_count: Math.max(0, (p.likes_count || 0) + deltaLikes),
              };
            }),
          })),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["campus-feed"], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
  });

  // 5. Poll vote mutation
  const pollVoteMutation = useMutation({
    mutationFn: ({ postId, optionId }: { postId: string; optionId: string }) =>
      api(`/feed/${postId}/poll/vote`, {
        method: "POST",
        body: JSON.stringify({ option_id: optionId }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
    onError: (err: Error) => Alert.alert("Voting Failed", err.message),
  });

  // 6. Save/Bookmark mutation
  const toggleSaveMutation = useMutation({
    mutationFn: (postId: string) =>
      api(`/feed/${postId}/save`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
  });

  // 7. Delete post mutation
  const deletePostMutation = useMutation({
    mutationFn: (postId: string) =>
      api(`/feed/${postId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
    onError: (err: Error) => Alert.alert("Delete Failed", err.message),
  });

  // 8. Edit post mutation
  const editPostMutation = useMutation({
    mutationFn: ({ postId, newBody }: { postId: string; newBody: string }) =>
      api(`/feed/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({ body: newBody }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
    onError: (err: Error) => Alert.alert("Edit Failed", err.message),
  });

  // 9. Report post mutation
  const reportPostMutation = useMutation({
    mutationFn: ({ postId, reason }: { postId: string; reason: string }) =>
      api(`/feed/${postId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => Alert.alert("Report Received", "Thank you. Our moderation team has been notified."),
    onError: (err: Error) => Alert.alert("Report Failed", err.message),
  });

  const handleReport = (postId: string) => {
    Alert.alert("Report Post", "Select reason for reporting this content:", [
      { text: "Cancel", style: "cancel" },
      { text: "Spam / Promotion", onPress: () => reportPostMutation.mutate({ postId, reason: "Spam" }) },
      { text: "Harassment / Hate", onPress: () => reportPostMutation.mutate({ postId, reason: "Harassment" }) },
      { text: "Misleading Information", onPress: () => reportPostMutation.mutate({ postId, reason: "Misleading" }) },
      { text: "Inappropriate Content", style: "destructive", onPress: () => reportPostMutation.mutate({ postId, reason: "Inappropriate" }) },
    ]);
  };

  // Multi-Factor Algorithmic Scoring Engine
  const rankedPosts = useMemo(() => {
    const rawPosts = allPosts;
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

        // 2. Audience / Group Match (+35 for room/club, +25 for campus tag)
        const bodyText = post.body || "";
        if (bodyText.includes("[🚪 Room:") || bodyText.includes("[🛡️ Club:")) {
          score += 35;
        }
        if (bodyText.includes("[🏛️") || bodyText.includes("[👥 Connections]")) {
          score += 25;
        }

        // 3. Department & Academic Bio Affinity (+20)
        const lowerBody = bodyText.toLowerCase();
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
        const bodyText = post.body || "";
        if (activeTab === "campus") {
          return (
            (myUniversity && post.author?.university?.toLowerCase() === myUniversity) ||
            bodyText.includes("[🏛️")
          );
        }
        if (activeTab === "my_groups") {
          return bodyText.includes("[🚪") || bodyText.includes("[🛡️");
        }
        return true;
      });
  }, [allPosts, currentUser, activeTab]);

  const isAdmin = (currentUser?.roles || []).includes("admin") || (currentUser?.roles || []).includes("moderator");

  return (
    <View style={styles.feedWrapper}>
      {/* 1. TYPEWRITER ANIMATED PROMPT BANNER */}
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
            <View style={[styles.promptIconCircle, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="feather" size={20} color={colors.primary} />
            </View>

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

            <View style={[styles.promptActionBtn, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
            </View>
          </Row>
        </Pressable>

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

      {/* 3. FEED CONTENT / LOADER / ERROR STATES */}
      {activeTab === "questions" ? (
        /* Academic Questions tab content */
        <View style={{ gap: 10, marginTop: 4 }}>
          {questionsQuery.isError ? (
            <ErrorState
              detail={questionsQuery.error instanceof Error ? questionsQuery.error.message : "Failed to load questions"}
              onRetry={() => questionsQuery.refetch()}
            />
          ) : questionsQuery.isLoading ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={120} radiusValue={radius.lg} />
              <Skeleton height={120} radiusValue={radius.lg} />
            </View>
          ) : (questionsQuery.data?.questions || []).length === 0 ? (
            <Empty
              icon="help-circle-outline"
              title={t("feed.noPosts")}
              detail={t("feed.noPostsDetail")}
              actionTitle={t("feed.createPost")}
              onAction={() => handleOpenPrompt({ initialTag: "#Question" })}
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
      ) : feedQuery.isError && allPosts.length === 0 ? (
        <ErrorState
          detail={feedQuery.error instanceof Error ? feedQuery.error.message : "Failed to load campus feed."}
          onRetry={() => feedQuery.refetch()}
        />
      ) : feedQuery.isLoading && allPosts.length === 0 ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Skeleton height={140} radiusValue={radius.lg} />
          <Skeleton height={140} radiusValue={radius.lg} />
          <Skeleton height={140} radiusValue={radius.lg} />
        </View>
      ) : rankedPosts.length === 0 ? (
        <Empty
          icon="newspaper-variant-outline"
          title={t("feed.noPosts")}
          detail={t("feed.noPostsDetail")}
          actionTitle={t("feed.createPost")}
          onAction={() => handleOpenPrompt()}
        />
      ) : (
        <View style={{ gap: 12 }}>
          {rankedPosts.map((post, idx) => (
            <React.Fragment key={post.id}>
              <Animated.View
                entering={FadeInDown.delay(Math.min(idx * 40, 250)).springify()}
                layout={Layout.springify()}
              >
                <PostCard
                  post={post}
                  currentUserId={currentUser?.id}
                  isAdmin={isAdmin}
                  onReact={(postId, type) => reactionMutation.mutate({ postId, type })}
                  onVotePoll={async (postId, optionId) => {
                    await pollVoteMutation.mutateAsync({ postId, optionId });
                  }}
                  onSave={(postId) => toggleSaveMutation.mutate(postId)}
                  onShare={(p) => setSharingPost(p)}
                  onDelete={(postId) => {
                    Alert.alert(
                      "Delete Post",
                      "Are you sure you want to delete this post? This action cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => deletePostMutation.mutate(postId),
                        },
                      ],
                    );
                  }}
                  onEdit={(p) => setEditingPost(p)}
                  onReport={(postId) => handleReport(postId)}
                  onHashtagPress={(tag) => {
                    triggerHaptic();
                    router.push(`/search?q=${encodeURIComponent(tag)}` as any);
                  }}
                  onMentionPress={(username) => {
                    triggerHaptic();
                    router.push(`/search?q=${encodeURIComponent(username)}` as any);
                  }}
                />
              </Animated.View>

              {/* Instagram-Style Suggested Peers Carousel (after 3rd post or every 20 posts) */}
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
          ))}

          {/* Load More Button for Infinite Feed Pagination */}
          {feedQuery.hasNextPage && (
            <Pressable
              disabled={feedQuery.isFetchingNextPage}
              onPress={() => {
                triggerHaptic();
                feedQuery.fetchNextPage();
              }}
              style={({ pressed }) => [
                styles.loadMoreBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {feedQuery.isFetchingNextPage ? (
                <Row style={{ alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.loadMoreText, { color: colors.muted }]}>
                    {t("common.loading", "Loading older posts...")}
                  </Text>
                </Row>
              ) : (
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={colors.primary} />
                  <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                    {t("feed.loadMore", "Load Older Campus Posts")}
                  </Text>
                </Row>
              )}
            </Pressable>
          )}
        </View>
      )}

      {/* 4. MODALS (Edit & Share) */}
      <EditPostModal
        visible={Boolean(editingPost)}
        post={editingPost}
        onClose={() => setEditingPost(null)}
        onSave={async (postId, newBody) => {
          await editPostMutation.mutateAsync({ postId, newBody });
        }}
      />

      <UniversalShareSheet
        visible={Boolean(sharingPost)}
        sourceType="post"
        sourceId={sharingPost?.id || ""}
        sourceTitle={sharingPost?.body?.slice(0, 60) || "Campus Post"}
        sourceVisibility={sharingPost?.visibility === "only_me" ? "private" : "public"}
        onClose={() => setSharingPost(null)}
      />

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
  questionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  postBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  answerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  loadMoreBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
