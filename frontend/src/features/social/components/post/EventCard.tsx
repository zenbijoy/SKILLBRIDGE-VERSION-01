import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import type { PostEventMetadata } from "../../types";

interface EventCardProps {
  event: PostEventMetadata;
}

export function EventCard({ event }: EventCardProps) {
  const { colors } = useTheme();
  const [isInterested, setIsInterested] = useState(false);

  const parsedDate = React.useMemo(() => {
    try {
      const d = new Date(event.date);
      const month = d.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
      const day = d.getDate();
      return { month, day };
    } catch {
      return { month: "EVENT", day: "--" };
    }
  }, [event.date]);

  const handleRegister = () => {
    if (event.registration_url) {
      Linking.openURL(event.registration_url).catch(() => {});
    } else if (event.meeting_url) {
      Linking.openURL(event.meeting_url).catch(() => {});
    }
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Row style={styles.contentRow}>
        {/* Date Calendar Tile */}
        <View style={[styles.dateTile, { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}>
          <Text style={[styles.dateMonth, { color: colors.primary }]}>{parsedDate.month}</Text>
          <Text style={[styles.dateDay, { color: colors.text }]}>{parsedDate.day}</Text>
        </View>

        {/* Details */}
        <View style={styles.infoCol}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {event.title}
          </Text>

          <Row style={styles.detailRow}>
            <MaterialCommunityIcons name="clock-time-four-outline" size={14} color={colors.muted} />
            <Text style={[styles.detailText, { color: colors.muted }]}>
              {event.start_time} {event.end_time ? `– ${event.end_time}` : ""}
            </Text>
          </Row>

          <Row style={styles.detailRow}>
            <MaterialCommunityIcons
              name={event.is_online ? "video-outline" : "map-marker-outline"}
              size={14}
              color={colors.muted}
            />
            <Text style={[styles.detailText, { color: colors.muted }]} numberOfLines={1}>
              {event.is_online ? "Online Session" : event.location}
            </Text>
          </Row>
        </View>
      </Row>

      {/* Action Buttons */}
      <Row style={styles.actionRow}>
        <Pressable
          onPress={() => setIsInterested(!isInterested)}
          style={[
            styles.actionBtn,
            { borderColor: colors.border },
            isInterested && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary },
          ]}
        >
          <MaterialCommunityIcons
            name={isInterested ? "star" : "star-outline"}
            size={16}
            color={isInterested ? colors.primary : colors.text}
          />
          <Text
            style={[
              styles.actionBtnText,
              { color: isInterested ? colors.primary : colors.text },
            ]}
          >
            {isInterested ? "Interested" : "Interested"}
          </Text>
        </Pressable>

        {(event.registration_url || event.meeting_url) && (
          <Pressable
            onPress={handleRegister}
            style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="ticket-outline" size={16} color="#FFFFFF" />
            <Text style={styles.primaryActionBtnText}>
              {event.registration_url ? "Register" : "Join Meeting"}
            </Text>
          </Pressable>
        )}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    marginVertical: 8,
  },
  contentRow: {
    gap: 12,
    alignItems: "flex-start",
  },
  dateTile: {
    width: 54,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  dateDay: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: -2,
  },
  infoCol: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 4,
  },
  detailRow: {
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  detailText: {
    fontSize: 12,
  },
  actionRow: {
    marginTop: 12,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  primaryActionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
