import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { REACTIONS, ReactionConfig } from "../../constants";
import type { ReactionType } from "../../types";

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (type: ReactionType) => void;
  onClose: () => void;
}

export function ReactionPicker({ visible, onSelect, onClose }: ReactionPickerProps) {
  if (!visible) return null;

  return (
    <View style={styles.floatingContainer}>
      <View style={styles.bubble}>
        {REACTIONS.map((r: ReactionConfig) => (
          <Pressable
            key={r.type}
            onPress={() => {
              triggerHaptic("impactLight");
              onSelect(r.type);
              onClose();
            }}
            style={({ pressed }) => [
              styles.reactionItem,
              pressed && { transform: [{ scale: 1.35 }] },
            ]}
          >
            <Text style={styles.emojiText}>{r.emoji}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: "absolute",
    bottom: 46,
    left: 10,
    zIndex: 999,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  reactionItem: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: {
    fontSize: 24,
  },
});
