import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, Modal } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, Pill } from "@/components/ui";
import { nextGenBadges } from "@/assets/nextgen";
import type { PostVisibility } from "../../types";
import { VISIBILITY_OPTIONS } from "../../constants";
import type { Profile } from "@/types";

interface ComposerHeaderProps {
  userProfile?: Profile | null;
  visibility: PostVisibility;
  isAnonymous: boolean;
  onVisibilityChange: (v: PostVisibility) => void;
  onAnonymousChange: (anon: boolean) => void;
  onClose: () => void;
}

export function ComposerHeader({
  userProfile,
  visibility,
  isAnonymous,
  onVisibilityChange,
  onAnonymousChange,
  onClose,
}: ComposerHeaderProps) {
  const { colors } = useTheme();
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);

  const selectedVisibility =
    VISIBILITY_OPTIONS.find((v) => v.value === visibility) || VISIBILITY_OPTIONS[0]!;

  const authorName = isAnonymous
    ? "Anonymous Student"
    : userProfile?.full_name || userProfile?.username || "You";

  return (
    <View style={styles.container}>
      {/* Title & Close */}
      <Row style={styles.topRow}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Post</Text>
        <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
          <MaterialCommunityIcons name="close" size={24} color={colors.text} />
        </Pressable>
      </Row>

      {/* User Section */}
      <Row style={styles.userSection}>
        {isAnonymous ? (
          <Image source={nextGenBadges.trusted} style={styles.avatarBadge} resizeMode="contain" />
        ) : userProfile?.avatar_url ? (
          <Image source={{ uri: userProfile.avatar_url }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surface }]}>
            <MaterialCommunityIcons name="account" size={22} color={colors.primary} />
          </View>
        )}

        <View style={styles.userDetails}>
          <Text style={[styles.authorName, { color: colors.text }]}>{authorName}</Text>

          {/* Privacy & Anon Selectors */}
          <Row style={styles.pillsRow}>
            {/* Visibility Selector Button */}
            <Pressable
              onPress={() => setShowVisibilityModal(true)}
              style={[styles.selectorPill, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <MaterialCommunityIcons
                name={selectedVisibility.icon as any}
                size={14}
                color={colors.primary}
              />
              <Text style={[styles.selectorPillText, { color: colors.text }]}>
                {selectedVisibility.label}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color={colors.muted} />
            </Pressable>

            {/* Anonymous Toggle Pill */}
            <Pressable
              onPress={() => onAnonymousChange(!isAnonymous)}
              style={[
                styles.selectorPill,
                {
                  borderColor: isAnonymous ? colors.primary : colors.border,
                  backgroundColor: isAnonymous ? `${colors.primary}20` : colors.surface,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="incognito"
                size={14}
                color={isAnonymous ? colors.primary : colors.muted}
              />
              <Text
                style={[
                  styles.selectorPillText,
                  { color: isAnonymous ? colors.primary : colors.muted },
                ]}
              >
                {isAnonymous ? "Anonymous On" : "Anonymous Off"}
              </Text>
            </Pressable>
          </Row>
        </View>
      </Row>

      {/* Visibility Modal Picker */}
      <Modal
        visible={showVisibilityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVisibilityModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowVisibilityModal(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Who can see your post?</Text>
            <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
              Control post audience across the campus ecosystem
            </Text>

            <View style={styles.visibilityList}>
              {VISIBILITY_OPTIONS.map((opt) => {
                const isSelected = opt.value === visibility;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      onVisibilityChange(opt.value);
                      setShowVisibilityModal(false);
                    }}
                    style={[
                      styles.visibilityItem,
                      isSelected && { backgroundColor: `${colors.primary}15` },
                    ]}
                  >
                    <View style={[styles.visIconWrapper, { backgroundColor: `${colors.primary}20` }]}>
                      <MaterialCommunityIcons name={opt.icon as any} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.visLabel, { color: colors.text }]}>{opt.label}</Text>
                      <Text style={[styles.visDesc, { color: colors.muted }]}>{opt.description}</Text>
                    </View>
                    {isSelected && (
                      <MaterialCommunityIcons name="check" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  topRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  userSection: {
    alignItems: "center",
    gap: 12,
  },
  avatarBadge: {
    width: 44,
    height: 44,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#334155",
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  userDetails: {
    flex: 1,
    gap: 4,
  },
  authorName: {
    fontSize: 15,
    fontWeight: "700",
  },
  pillsRow: {
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  selectorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  selectorPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 12.5,
    marginTop: 2,
    marginBottom: 16,
  },
  visibilityList: {
    gap: 6,
  },
  visibilityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.md,
  },
  visIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  visLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  visDesc: {
    fontSize: 11.5,
    marginTop: 1,
  },
});
