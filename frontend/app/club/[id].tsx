import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type ClubDetail = {
  id: string;
  name: string;
  description: string;
  university?: string;
  verified?: boolean;
  logo_url?: string;
  member_count?: number;
  my_membership?: { role: string; user_id: string } | null;
  events?: {
    id: string;
    title: string;
    starts_at: string;
    location?: string;
  }[];
  members?: {
    id: string;
    username: string;
    full_name: string;
    role: string;
    avatar_url?: string;
  }[];
};

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const clubQuery = useQuery({
    queryKey: ["club", id],
    queryFn: () => api<ClubDetail>(`/clubs/${id}`),
    enabled: Boolean(id),
  });

  const joinMutation = useMutation({
    mutationFn: () =>
      api<{ joined: boolean }>(`/clubs/${id}/join`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club", id] });
      qc.invalidateQueries({ queryKey: ["clubs"] });
      Alert.alert("Joined Club!", "You are now a member of this club.");
    },
    onError: (err: any) => {
      Alert.alert("Join Failed", err.message || "Could not join club.");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () =>
      api<{ left: boolean }>(`/clubs/${id}/leave`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club", id] });
      qc.invalidateQueries({ queryKey: ["clubs"] });
      Alert.alert("Left Club");
    },
    onError: (err: any) => {
      Alert.alert("Leave Failed", err.message || "Could not leave club.");
    },
  });

  const d = clubQuery.data;

  if (clubQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={140} />
        <Skeleton height={100} />
      </Screen>
    );
  }

  if (clubQuery.isError) {
    return (
      <Screen>
        <ErrorState
          detail={(clubQuery.error as Error).message}
          onRetry={() => clubQuery.refetch()}
        />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen>
        <Empty title="Club Not Found" detail="This club may have been disbanded or removed." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <Row style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <H1 style={styles.title}>{d.name}</H1>
              {d.verified && (
                <MaterialCommunityIcons name="check-decagram" size={20} color={colors.primary} />
              )}
            </Row>
            {d.university && <Muted>{d.university}</Muted>}
          </View>
        </Row>

        {/* Badges */}
        <Row style={styles.badgeRow}>
          <Pill tone="primary">{d.member_count ?? d.members?.length ?? 1} members</Pill>
          {d.my_membership && (
            <Pill tone="accent">Role: {d.my_membership.role.toUpperCase()}</Pill>
          )}
        </Row>

        {/* Membership CTA */}
        <View style={styles.ctaRow}>
          {!d.my_membership ? (
            <Button
              title={joinMutation.isPending ? "Joining Club..." : "Join Club"}
              onPress={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
            />
          ) : (
            <Button
              title={leaveMutation.isPending ? "Leaving..." : "Leave Club"}
              variant="secondary"
              onPress={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
            />
          )}
        </View>

        {/* Description */}
        <Card style={styles.card}>
          <H2 style={styles.sectionTitle}>About</H2>
          <Text style={[styles.descText, { color: colors.text }]}>
            {d.description || "No description provided."}
          </Text>
        </Card>

        {/* Upcoming Events */}
        {d.events && d.events.length > 0 && (
          <Card style={styles.card}>
            <H2 style={styles.sectionTitle}>Upcoming Events ({d.events.length})</H2>
            <View style={{ gap: 10 }}>
              {d.events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/event/${event.id}` as any)}
                >
                  <Card tone="soft" style={{ padding: 12 }}>
                    <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                    <Muted>{new Date(event.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Muted>
                  </Card>
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {/* Members */}
        {d.members && d.members.length > 0 && (
          <Card style={styles.card}>
            <H2 style={styles.sectionTitle}>Members ({d.members.length})</H2>
            <View style={{ gap: 8 }}>
              {d.members.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => router.push(`/user/${member.id}` as any)}
                >
                  <Row style={{ alignItems: "center", gap: 10 }}>
                    <View style={[styles.avatar, { backgroundColor: colors.surface2 }]}>
                      <MaterialCommunityIcons name="account" size={18} color={colors.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.text }]}>
                        {member.full_name || `@${member.username}`}
                      </Text>
                      <Muted>@{member.username}</Muted>
                    </View>
                    <Pill tone={member.role === "owner" || member.role === "admin" ? "primary" : "default"}>
                      {member.role.toUpperCase()}
                    </Pill>
                  </Row>
                </Pressable>
              ))}
            </View>
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    alignItems: "flex-start",
    marginBottom: 8,
  },
  backButton: {
    marginRight: 12,
    marginTop: 4,
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  badgeRow: {
    gap: 8,
    marginBottom: 14,
  },
  ctaRow: {
    marginBottom: 16,
  },
  card: {
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  descText: {
    fontSize: 14,
    lineHeight: 22,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
  },
});
