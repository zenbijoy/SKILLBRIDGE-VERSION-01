import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type EventDetail = {
  id: string;
  club_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at?: string;
  location?: string;
  meeting_url?: string;
  capacity?: number;
  attendees_count?: number;
  my_rsvp?: boolean;
  club?: {
    id: string;
    name: string;
    university?: string;
    logo_url?: string;
  };
  attendees?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
  }[];
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const eventQuery = useQuery({
    queryKey: ["event", id],
    queryFn: () => api<EventDetail>(`/events/${id}`),
    enabled: Boolean(id),
  });

  const rsvpMutation = useMutation({
    mutationFn: () =>
      api<{ rsvp: boolean }>(`/events/${id}/rsvp`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
      Alert.alert(res.rsvp ? "RSVP Confirmed!" : "RSVP Cancelled");
    },
    onError: (err: any) => {
      Alert.alert("RSVP Failed", err.message || "Could not update RSVP status.");
    },
  });

  const d = eventQuery.data;

  if (eventQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={140} />
        <Skeleton height={100} />
        <Skeleton height={80} />
      </Screen>
    );
  }

  if (eventQuery.isError) {
    return (
      <Screen>
        <ErrorState
          detail={(eventQuery.error as Error).message}
          onRetry={() => eventQuery.refetch()}
        />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen>
        <Empty title="Event Not Found" detail="This event may have been cancelled or removed." />
      </Screen>
    );
  }

  const startDate = new Date(d.starts_at);
  const isUpcoming = startDate > new Date();

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <Row style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <H1 style={styles.title}>{d.title}</H1>
          </View>
        </Row>

        {/* Badges */}
        <Row style={styles.badgeRow}>
          <Pill tone={isUpcoming ? "primary" : "default"}>
            {isUpcoming ? "UPCOMING" : "PAST EVENT"}
          </Pill>
          {d.attendees_count !== undefined && (
            <Pill tone="accent">{d.attendees_count} attending</Pill>
          )}
        </Row>

        {/* Event Info Card */}
        <Card style={styles.infoCard}>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.primary} />
            <Text style={[styles.metaText, { color: colors.text }]}>
              {startDate.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>

          {d.location ? (
            <View style={styles.metaRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={20} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.text }]}>{d.location}</Text>
            </View>
          ) : null}

          {d.meeting_url ? (
            <Pressable
              onPress={() => Linking.openURL(d.meeting_url!)}
              style={styles.metaRow}
            >
              <MaterialCommunityIcons name="video-outline" size={20} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.primary, textDecorationLine: "underline" }]}>
                Join Virtual Event
              </Text>
            </Pressable>
          ) : null}
        </Card>

        {/* Hosting Club */}
        {d.club && (
          <Pressable onPress={() => router.push(`/club/${d.club!.id}` as any)}>
            <Card style={styles.clubCard}>
              <Row style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.clubAvatar, { backgroundColor: colors.primary + "20" }]}>
                  <MaterialCommunityIcons name="shield-account" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.clubLabel, { color: colors.muted }]}>Hosted by</Text>
                  <Text style={[styles.clubName, { color: colors.text }]}>{d.club.name}</Text>
                  {d.club.university && <Muted>{d.club.university}</Muted>}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
              </Row>
            </Card>
          </Pressable>
        )}

        {/* Description */}
        <Card style={styles.descCard}>
          <H2 style={styles.sectionTitle}>About this Event</H2>
          <Text style={[styles.descText, { color: colors.text }]}>
            {d.description || "No description provided."}
          </Text>
        </Card>

        {/* Attendees */}
        {d.attendees && d.attendees.length > 0 && (
          <Card style={styles.attendeesCard}>
            <H2 style={styles.sectionTitle}>Attendees ({d.attendees.length})</H2>
            <View style={{ gap: 8 }}>
              {d.attendees.map((attendee) => (
                <Pressable
                  key={attendee.id}
                  onPress={() => router.push(`/user/${attendee.id}` as any)}
                >
                  <Row style={{ alignItems: "center", gap: 10 }}>
                    <View style={[styles.attendeeAvatar, { backgroundColor: colors.surface2 }]}>
                      <MaterialCommunityIcons name="account" size={18} color={colors.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.attendeeName, { color: colors.text }]}>
                        {attendee.full_name || `@${attendee.username}`}
                      </Text>
                      <Muted>@{attendee.username}</Muted>
                    </View>
                  </Row>
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {/* RSVP CTA */}
        {isUpcoming && (
          <View style={styles.rsvpButtonContainer}>
            <Button
              title={
                rsvpMutation.isPending
                  ? "Updating RSVP..."
                  : d.my_rsvp
                  ? "Cancel RSVP"
                  : "RSVP to Event"
              }
              variant={d.my_rsvp ? "secondary" : "primary"}
              onPress={() => rsvpMutation.mutate()}
              disabled={rsvpMutation.isPending}
            />
          </View>
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
    marginBottom: 16,
  },
  infoCard: {
    padding: 16,
    borderRadius: radius.lg,
    gap: 12,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  clubCard: {
    padding: 14,
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  clubAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  clubLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  clubName: {
    fontSize: 15,
    fontWeight: "700",
  },
  descCard: {
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  descText: {
    fontSize: 14,
    lineHeight: 22,
  },
  attendeesCard: {
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  attendeeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  attendeeName: {
    fontSize: 14,
    fontWeight: "600",
  },
  rsvpButtonContainer: {
    marginTop: 8,
    marginBottom: 24,
  },
});
