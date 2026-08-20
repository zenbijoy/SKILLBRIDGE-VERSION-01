import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type SkillDetail = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  tutors_count?: number;
  tutors?: {
    id: string;
    username: string;
    full_name: string;
    reputation: number;
    proficiency: number;
    avatar_url?: string;
  }[];
  rooms?: {
    id: string;
    title: string;
    topic: string;
    member_count: number;
    capacity: number;
  }[];
};

export default function SkillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const skillQuery = useQuery({
    queryKey: ["skill", id],
    queryFn: () => api<SkillDetail>(`/skills/${id}`),
    enabled: Boolean(id),
  });

  const d = skillQuery.data;

  if (skillQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={120} />
        <Skeleton height={100} />
      </Screen>
    );
  }

  if (skillQuery.isError) {
    return (
      <Screen>
        <ErrorState
          detail={(skillQuery.error as Error).message}
          onRetry={() => skillQuery.refetch()}
        />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen>
        <Empty title="Skill Not Found" detail="This skill could not be loaded." />
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
            <H1 style={styles.title}>{d.name}</H1>
            {d.category && <Muted>{d.category}</Muted>}
          </View>
        </Row>

        {/* Verification Banner & Action */}
        <Card tone="glow" style={styles.quizCard}>
          <Row style={{ alignItems: "center", gap: 12 }}>
            <MaterialCommunityIcons name="certificate-outline" size={32} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.quizTitle, { color: colors.text }]}>Skill Verification</Text>
              <Muted>Take an adaptive assessment quiz to verify your proficiency and earn 15+ reputation.</Muted>
            </View>
          </Row>
          <View style={{ marginTop: 12 }}>
            <Button
              title="Take Verification Quiz ✍️"
              onPress={() => router.push(`/quiz?skill=${id}` as any)}
            />
          </View>
        </Card>

        {/* Description */}
        {d.description && (
          <Card style={styles.card}>
            <H2 style={styles.sectionTitle}>Overview</H2>
            <Text style={[styles.descText, { color: colors.text }]}>{d.description}</Text>
          </Card>
        )}

        {/* Tutors & Peers */}
        <Card style={styles.card}>
          <H2 style={styles.sectionTitle}>Peers Teaching this Skill ({d.tutors?.length ?? 0})</H2>
          {!d.tutors || d.tutors.length === 0 ? (
            <Muted>No registered tutors for this skill yet. Be the first to volunteer!</Muted>
          ) : (
            <View style={{ gap: 10 }}>
              {d.tutors.map((tutor) => (
                <Pressable
                  key={tutor.id}
                  onPress={() => router.push(`/user/${tutor.id}` as any)}
                >
                  <Card tone="soft" style={{ padding: 12 }}>
                    <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ gap: 2 }}>
                        <Text style={[styles.tutorName, { color: colors.text }]}>
                          {tutor.full_name || `@${tutor.username}`}
                        </Text>
                        <Muted>@{tutor.username} · {tutor.reputation || 0} rep</Muted>
                      </View>
                      <Pill tone="accent">Level {tutor.proficiency}/5</Pill>
                    </Row>
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        {/* Related Study Rooms */}
        {d.rooms && d.rooms.length > 0 && (
          <Card style={styles.card}>
            <H2 style={styles.sectionTitle}>Related Study Rooms ({d.rooms.length})</H2>
            <View style={{ gap: 10 }}>
              {d.rooms.map((room) => (
                <Pressable
                  key={room.id}
                  onPress={() => router.push(`/room/${room.id}` as any)}
                >
                  <Card tone="soft" style={{ padding: 12 }}>
                    <Text style={[styles.roomTitle, { color: colors.text }]}>{room.title}</Text>
                    <Muted>Topic: {room.topic} · {room.member_count}/{room.capacity} members</Muted>
                  </Card>
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
    marginBottom: 16,
  },
  backButton: {
    marginRight: 12,
    marginTop: 4,
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
  },
  quizCard: {
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  quizTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
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
  tutorName: {
    fontSize: 15,
    fontWeight: "700",
  },
  roomTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
});
