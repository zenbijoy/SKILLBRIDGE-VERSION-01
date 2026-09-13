import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View, TextInput, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { ClashDetectorModal } from "@/features/clubs/ClashDetectorModal";

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

  // Clash-aware event creation state
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(14, 0, 0, 0);
    return d.toISOString();
  });
  const [eventEndsAt, setEventEndsAt] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(16, 0, 0, 0);
    return d.toISOString();
  });
  const [showClashModal, setShowClashModal] = useState(false);

  const clubQuery = useQuery({
    queryKey: ["club", id],
    queryFn: () => api<ClubDetail>(`/clubs/${id}`),
    enabled: Boolean(id),
  });

  const createEventMutation = useMutation({
    mutationFn: (payload: {
      club_id: string;
      title: string;
      description: string;
      starts_at: string;
      ends_at?: string;
      location?: string;
    }) =>
      api("/events", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setShowClashModal(false);
      setShowCreateEvent(false);
      setEventTitle("");
      setEventDesc("");
      setEventLocation("");
      qc.invalidateQueries({ queryKey: ["club", id] });
      Alert.alert("Event Scheduled! 🎉", "Your event has been published to the club calendar.");
    },
    onError: (err: any) => {
      Alert.alert("Scheduling Failed", err.message || "Failed to create event.");
    },
  });

  const setEventPreset = (daysAhead: number, startHour: number, durationHours: number) => {
    triggerHaptic();
    const s = new Date(Date.now() + daysAhead * 86400000);
    s.setHours(startHour, 0, 0, 0);
    const e = new Date(s.getTime() + durationHours * 3600000);
    setEventStartsAt(s.toISOString());
    setEventEndsAt(e.toISOString());
  };

  const handleOpenClashReview = () => {
    if (eventTitle.trim().length < 4) {
      Alert.alert("Validation", "Event title must be at least 4 characters long.");
      return;
    }
    setShowClashModal(true);
  };

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
        <Card style={styles.card}>
          <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <H2 style={styles.sectionTitle}>Upcoming Events ({d.events?.length ?? 0})</H2>
            {(d.my_membership?.role === "owner" || d.my_membership?.role === "admin") && !showCreateEvent && (
              <Button
                title="+ Schedule Event"
                variant="secondary"
                onPress={() => setShowCreateEvent(true)}
              />
            )}
          </Row>

          {/* Schedule Event Form with Clash Detection */}
          {(d.my_membership?.role === "owner" || d.my_membership?.role === "admin") && showCreateEvent && (
            <Card tone="soft" style={{ marginBottom: 16, padding: 14 }}>
              <H2 style={{ fontSize: 15, fontWeight: "700", marginBottom: 4 }}>Schedule Club Event</H2>
              <Muted style={{ marginBottom: 10 }}>
                Includes 4-signal automatic cross-club clash detection before publishing.
              </Muted>

              <Text style={[styles.label, { color: colors.text }]}>Event Title</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="e.g., Annual Tech Hackathon Kickoff"
                placeholderTextColor={colors.muted}
                value={eventTitle}
                onChangeText={setEventTitle}
              />

              <Text style={[styles.label, { color: colors.text, marginTop: 8 }]}>Description</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, height: 64 }]}
                placeholder="Briefly describe the agenda and attendees"
                placeholderTextColor={colors.muted}
                multiline
                value={eventDesc}
                onChangeText={setEventDesc}
              />

              <Text style={[styles.label, { color: colors.text, marginTop: 8 }]}>Campus Location</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="e.g., Central Auditorium / Room 402"
                placeholderTextColor={colors.muted}
                value={eventLocation}
                onChangeText={setEventLocation}
              />

              <Text style={[styles.label, { color: colors.text, marginTop: 8 }]}>Quick Time Presets</Text>
              <Row style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                <Pressable
                  onPress={() => setEventPreset(1, 14, 2)}
                  style={[styles.presetChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Tomorrow 2 PM (2h)</Text>
                </Pressable>
                <Pressable
                  onPress={() => setEventPreset(1, 18, 2)}
                  style={[styles.presetChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Tomorrow 6 PM (2h)</Text>
                </Pressable>
                <Pressable
                  onPress={() => setEventPreset(3, 15, 3)}
                  style={[styles.presetChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>In 3 Days 3 PM (3h)</Text>
                </Pressable>
              </Row>

              <Muted style={{ marginTop: 8, fontSize: 12 }}>
                Starts: {new Date(eventStartsAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · Ends: {new Date(eventEndsAt).toLocaleString([], { timeStyle: "short" })}
              </Muted>

              <Row style={{ gap: 10, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Check Clashes & Schedule"
                    onPress={handleOpenClashReview}
                    disabled={createEventMutation.isPending}
                  />
                </View>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setShowCreateEvent(false)}
                />
              </Row>
            </Card>
          )}

          {d.events && d.events.length > 0 ? (
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
          ) : (
            <Muted>No upcoming events currently scheduled for this club.</Muted>
          )}
        </Card>

        {/* Clash Detection Modal */}
        <ClashDetectorModal
          visible={showClashModal}
          onClose={() => setShowClashModal(false)}
          clubId={id!}
          startsAt={eventStartsAt}
          endsAt={eventEndsAt}
          location={eventLocation.trim() || undefined}
          onProceedAnyway={() => {
            createEventMutation.mutate({
              club_id: id!,
              title: eventTitle.trim(),
              description: eventDesc.trim() || "Club community event",
              starts_at: eventStartsAt,
              ends_at: eventEndsAt,
              location: eventLocation.trim() || undefined,
            });
          }}
        />

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
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
