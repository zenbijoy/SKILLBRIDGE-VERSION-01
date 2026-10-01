import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { AcademicProfile } from "../types";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface AcademicProfileModalProps {
  visible: boolean;
  profile?: AcademicProfile | null;
  onClose: () => void;
  onUpdated: (newProfile: AcademicProfile) => void;
}

export function AcademicProfileModal({
  visible,
  profile,
  onClose,
  onUpdated,
}: AcademicProfileModalProps) {
  const { colors, isDark } = useTheme();

  const [university, setUniversity] = useState(profile?.university ?? "RUET");
  const [department, setDepartment] = useState(profile?.department ?? "CSE");
  const [semester, setSemester] = useState(profile?.semester ?? "2-1");
  const [section, setSection] = useState(profile?.section ?? "A");
  const [batch, setBatch] = useState(profile?.batch ?? "2024");
  const [isSaving, setIsSaving] = useState(false);

  const previewGroup = `${university.trim().toUpperCase()} / ${department
    .trim()
    .toUpperCase()} / ${semester.trim()} / ${section.trim().toUpperCase()}`;

  const handleSave = async () => {
    if (
      !university.trim() ||
      !department.trim() ||
      !semester.trim() ||
      !section.trim()
    ) {
      Alert.alert(
        "Required Fields",
        "Please provide University, Department, Semester, and Section."
      );
      return;
    }

    triggerHaptic();
    setIsSaving(true);
    try {
      const resp = await api<{
        success: boolean;
        profile: AcademicProfile;
      }>("/calendar/academic-profile", {
        method: "PUT",
        body: JSON.stringify({
          university: university.trim(),
          department: department.trim(),
          semester: semester.trim(),
          section: section.trim(),
          batch: batch.trim() || null,
        }),
      });

      setIsSaving(false);
      Alert.alert("Profile Updated", "Your academic context has been updated.");
      onUpdated(resp.profile);
      onClose();
    } catch (e: any) {
      setIsSaving(false);
      Alert.alert("Update Failed", e.message || "Could not save profile.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                Academic Profile
              </Text>
              <Text style={[styles.headerSub, { color: colors.muted }]}>
                Matches your section's routines and academic calendar
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Academic Group Preview Tag */}
            <View
              style={[
                styles.groupPreviewCard,
                {
                  backgroundColor: isDark ? colors.surface2 : "#EFF6FF",
                  borderColor: colors.primary,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="school-outline"
                size={22}
                color={colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupPreviewLabel, { color: colors.muted }]}>
                  Normalized Academic Group:
                </Text>
                <Text
                  style={[styles.groupPreviewVal, { color: colors.primary }]}
                >
                  {previewGroup}
                </Text>
              </View>
            </View>

            {/* University */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                University *
              </Text>
              <TextInput
                value={university}
                onChangeText={setUniversity}
                placeholder="e.g. RUET, BUET, DU"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />
            </View>

            {/* Department */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                Department *
              </Text>
              <TextInput
                value={department}
                onChangeText={setDepartment}
                placeholder="e.g. CSE, EEE, ME, Civil"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />
            </View>

            {/* Semester and Section */}
            <View style={styles.rowInputs}>
              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Semester *
                </Text>
                <TextInput
                  value={semester}
                  onChangeText={setSemester}
                  placeholder="e.g. 2-1"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>

              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Section *
                </Text>
                <TextInput
                  value={section}
                  onChangeText={setSection}
                  placeholder="e.g. A, B"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>
            </View>

            {/* Batch */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                Batch / Series (Optional)
              </Text>
              <TextInput
                value={batch}
                onChangeText={setBatch}
                placeholder="e.g. 2024, 2023"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer Save */}
          <View
            style={[
              styles.footer,
              { borderTopColor: isDark ? colors.border : "#E2E8F0" },
            ]}
          >
            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || isSaving ? 0.8 : 1,
                },
              ]}
            >
              <Text style={styles.saveBtnText}>
                {isSaving ? "Saving..." : "Save Academic Profile"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    maxHeight: "82%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.15)",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 16,
  },
  groupPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 16,
  },
  groupPreviewLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  groupPreviewVal: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 1,
  },
  inputGroup: {
    gap: 5,
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  rowInputs: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  inputHalf: {
    flex: 1,
    gap: 5,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  saveBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
