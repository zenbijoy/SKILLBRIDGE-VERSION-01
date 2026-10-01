import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Switch } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import type { PostEventMetadata } from "../../types";

interface EventBuilderProps {
  data: PostEventMetadata;
  onChange: (data: PostEventMetadata) => void;
  onRemove: () => void;
}

export function EventBuilder({ data, onChange, onRemove }: EventBuilderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderColor: "#EC4899", backgroundColor: colors.surface }]}>
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="calendar-star" size={18} color="#EC4899" />
          <Text style={styles.title}>Campus Event Builder</Text>
        </Row>
        <Pressable onPress={onRemove} hitSlop={6}>
          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      </Row>

      {/* Event Title */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Event Title (e.g. RUET Tech Fest 2026)"
        placeholderTextColor={colors.muted}
        value={data.title}
        onChangeText={(text) => onChange({ ...data, title: text })}
      />

      {/* Date & Start Time */}
      <Row style={{ gap: 10 }}>
        <TextInput
          style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
          placeholder="Date (YYYY-MM-DD)"
          placeholderTextColor={colors.muted}
          value={data.date}
          onChangeText={(text) => onChange({ ...data, date: text })}
        />
        <TextInput
          style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
          placeholder="Time (e.g. 5:00 PM)"
          placeholderTextColor={colors.muted}
          value={data.start_time}
          onChangeText={(text) => onChange({ ...data, start_time: text })}
        />
      </Row>

      {/* Location or Meeting URL */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder={data.is_online ? "Meeting Link (Google Meet / Zoom)" : "Physical Venue / Room / Auditorium"}
        placeholderTextColor={colors.muted}
        value={data.is_online ? data.meeting_url || "" : data.location}
        onChangeText={(text) =>
          data.is_online
            ? onChange({ ...data, meeting_url: text, location: "Online" })
            : onChange({ ...data, location: text })
        }
      />

      {/* Registration URL */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Registration / Ticket URL (Optional)"
        placeholderTextColor={colors.muted}
        value={data.registration_url || ""}
        onChangeText={(text) => onChange({ ...data, registration_url: text })}
      />

      {/* Online Toggle */}
      <Row style={styles.toggleRow}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons
            name={data.is_online ? "video-outline" : "map-marker-outline"}
            size={18}
            color="#EC4899"
          />
          <Text style={[styles.toggleText, { color: colors.text }]}>Online Event</Text>
        </Row>
        <Switch
          value={data.is_online}
          onValueChange={(val) => onChange({ ...data, is_online: val })}
          trackColor={{ false: colors.border, true: "#EC4899" }}
        />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 14,
    marginVertical: 10,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#EC4899",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  toggleRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
