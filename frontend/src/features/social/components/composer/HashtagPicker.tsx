import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { POPULAR_HASHTAGS } from "../../constants";

interface HashtagPickerProps {
  visible: boolean;
  onSelect: (tag: string) => void;
  onClose: () => void;
}

export function HashtagPicker({ visible, onSelect, onClose }: HashtagPickerProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={styles.header}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="pound" size={20} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]}>Popular Campus Topics</Text>
            </Row>
            <Pressable onPress={onClose} hitSlop={6}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          <ScrollView contentContainerStyle={styles.tagsContainer}>
            {POPULAR_HASHTAGS.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => {
                  triggerHaptic("selection");
                  onSelect(tag);
                  onClose();
                }}
                style={[styles.tagPill, { borderColor: colors.border, backgroundColor: colors.bg }]}
              >
                <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPill: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  tagText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
