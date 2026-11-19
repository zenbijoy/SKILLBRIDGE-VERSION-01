import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppStore } from "@/state/useAppStore";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { PostComposerModal, type AudienceType } from "./PostComposerModal";

interface WebQuickComposerProps {
  onPostCreated?: () => void;
}

export function WebQuickComposer({ onPostCreated }: WebQuickComposerProps) {
  const { colors, isDark } = useTheme();
  const { cachedProfile } = useAppStore();

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerOpts, setComposerOpts] = useState<{
    initialTag?: string;
    initialAudience?: AudienceType;
    openMediaImmediately?: boolean;
  }>({});

  const initial = (cachedProfile?.full_name?.trim()?.[0] ?? "U").toUpperCase();
  const avatarUrl = cachedProfile?.avatar_url;
  const firstName = cachedProfile?.full_name?.split(" ")[0] || "Learner";

  const handleOpen = (opts?: {
    initialTag?: string;
    initialAudience?: AudienceType;
    openMediaImmediately?: boolean;
  }) => {
    triggerHaptic();
    setComposerOpts(opts || {});
    setComposerOpen(true);
  };

  return (
    <div
      style={{
        width: "100%",
        backgroundColor: colors.surface,
        borderRadius: 16,
        border: `1px solid ${colors.border}`,
        padding: "14px 16px",
        marginBottom: 16,
        boxSizing: "border-box",
        boxShadow: isDark
          ? "0 4px 14px rgba(0, 0, 0, 0.25)"
          : "0 2px 8px rgba(0, 0, 0, 0.04)",
      }}
    >
      {/* Top Input Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {/* User Avatar */}
        <div style={{ position: "relative" }}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
            </View>
          )}
        </div>

        {/* Input Trigger Pill */}
        <Pressable
          onPress={() => handleOpen()}
          style={({ pressed }) => [
            styles.inputPill,
            {
              backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.placeholderText, { color: colors.muted }]}>
            What skill or doubt are you studying today, {firstName}?
          </Text>
        </Pressable>
      </div>

      <div style={{ height: 1, backgroundColor: colors.border, marginBottom: 8 }} />

      {/* Bottom Media / Action Triggers */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        {[
          { label: "Photo / File", icon: "image-multiple-outline", color: "#10B981", opts: { openMediaImmediately: true } },
          { label: "Campus Poll", icon: "poll", color: "#F59E0B", opts: { initialTag: "Poll" } },
          { label: "Code Snippet", icon: "code-tags", color: "#8B5CF6", opts: { initialTag: "Code" } },
          { label: "Ask Doubt", icon: "help-circle-outline", color: "#EC4899", opts: { initialTag: "Question" } },
        ].map((item) => (
          <Pressable
            key={item.label}
            onPress={() => handleOpen(item.opts as any)}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: pressed ? colors.surface2 : "transparent",
                borderRadius: radius.md,
              },
            ]}
          >
            <MaterialCommunityIcons name={item.icon as any} size={18} color={item.color} />
            <Text style={[styles.actionBtnLabel, { color: colors.text }]}>{item.label}</Text>
          </Pressable>
        ))}
      </div>

      {/* Post Composer Modal */}
      <PostComposerModal
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialTag={composerOpts.initialTag}
        initialAudience={composerOpts.initialAudience}
        openMediaImmediately={composerOpts.openMediaImmediately}
        onPostCreated={() => {
          onPostCreated?.();
        }}
      />
    </div>
  );
}

const styles = StyleSheet.create({
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "800",
  },
  inputPill: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: "center",
    cursor: "pointer",
  } as any,
  placeholderText: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    cursor: "pointer",
  } as any,
  actionBtnLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});
