import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
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
                  borderColor: isSelected ? item.color : colors.border,
                  backgroundColor: isSelected ? `${item.color}20` : colors.surface,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={item.icon as any}
                size={16}
                color={isSelected ? item.color : colors.text}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: isSelected ? item.color : colors.text, fontWeight: isSelected ? "800" : "600" },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
  },
  scrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  pillText: {
    fontSize: 12.5,
  },
});
