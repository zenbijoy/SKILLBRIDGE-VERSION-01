import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { POST_TYPE_OPTIONS, PostTypeOption } from "../../constants";
import type { PostType } from "../../types";

interface PostTypeSelectorProps {
  selectedType: PostType;
  onSelectType: (type: PostType) => void;
}

export function PostTypeSelector({ selectedType, onSelectType }: PostTypeSelectorProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.chipWrap}>
        {POST_TYPE_OPTIONS.map((item: PostTypeOption) => {
          const isSelected = selectedType === item.type;
          return (
            <Pressable
              key={item.type}
              onPress={() => {
                triggerHaptic("selection");
                onSelectType(item.type);
              }}
              style={[
                styles.typePill,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={item.icon as any}
                size={16}
                color={isSelected ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "800" : "600" },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12.5,
  },
});
