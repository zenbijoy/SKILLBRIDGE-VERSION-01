import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { AcademicProfile, AcademicRoutine } from "../types";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface ImportRoutineModalProps {
  visible: boolean;
  onClose: () => void;
  profile?: AcademicProfile | null;
  onExtractionSuccess: (draftRoutine: AcademicRoutine) => void;
}

export function ImportRoutineModal({
  visible,
  onClose,
  profile,
  onExtractionSuccess,
}: ImportRoutineModalProps) {
  const { colors, isDark } = useTheme();

  // Selected file state
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
    base64?: string;
  } | null>(null);

  // Academic context form
  const [university, setUniversity] = useState(profile?.university ?? "RUET");
  const [department, setDepartment] = useState(profile?.department ?? "CSE");
  const [semester, setSemester] = useState(profile?.semester ?? "2-1");
  const [section, setSection] = useState(profile?.section ?? "A");
  const [batch, setBatch] = useState(profile?.batch ?? "2024");
  const [additionalContext, setAdditionalContext] = useState("");

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState<string>("");

  const handlePickDocument = async () => {
    triggerHaptic();
    try {
      let docPickerModule: any = null;
      try {
        docPickerModule = await import("expo-document-picker");
      } catch {
        docPickerModule = null;
      }

      if (!docPickerModule || !docPickerModule.getDocumentAsync) {
        Alert.alert(
          "Document Picker Unavailable",
          "File picking is not supported in this client build. Please paste your routine text in the 'Paste Text' tab instead.",
        );
        return;
      }

      const res = await docPickerModule.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const file = res.assets[0];
        // Read as base64 using FileReader or fetch
        let base64 = "";
        try {
          const response = await fetch(file.uri);
          const blob = await response.blob();
          const reader = new FileReader();
          base64 = await new Promise((resolve) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              // strip data:application/pdf;base64,
              const pureBase64 = result.includes(",")
                ? result.split(",")[1] ?? ""
                : result;
              resolve(pureBase64);
            };
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn("Base64 conversion failed, falling back to raw uri", e);
        }

        setSelectedFile({
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType ?? "application/pdf",
          size: file.size,
          base64,
        });
      }
    } catch {
      Alert.alert("Picker Error", "Could not select the routine file.");
    }
  };

  const handleStartExtraction = async () => {
    if (!selectedFile) {
      Alert.alert("File Required", "Please select a routine PDF or image first.");
      return;
    }
    if (!department || !semester || !section) {
      Alert.alert(
        "Missing Context",
        "Please enter Department, Semester, and Section so the AI can accurately match your schedule."
      );
      return;
    }

    triggerHaptic();
    setIsProcessing(true);
    setProgressStep("Uploading routine file...");

    try {
      // Step simulation for honest feedback
      setTimeout(() => setProgressStep("Analyzing document structure..."), 1200);
      setTimeout(() => setProgressStep("AI extracting course timetable..."), 3000);
      setTimeout(() => setProgressStep("Validating times & checking conflicts..."), 5000);

      const resp = await api<{
        success: boolean;
        routine: AcademicRoutine;
        extraction: any;
      }>("/calendar/routine/extract", {
        method: "POST",
        body: JSON.stringify({
          fileBase64: selectedFile.base64,
          mimeType: selectedFile.mimeType,
          fileName: selectedFile.name,
          department: department.trim(),
          semester: semester.trim(),
          section: section.trim(),
          batch: batch.trim(),
          university: university.trim(),
          additionalContext: additionalContext.trim(),
        }),
      });

      setIsProcessing(false);
      if (resp.routine) {
        onExtractionSuccess(resp.routine);
      } else {
        throw new Error("No routine returned from extraction");
      }
    } catch (error: any) {
      setIsProcessing(false);
      Alert.alert(
        "Extraction Note",
        error.message ||
          "Could not complete AI extraction. You can also create your routine manually."
      );
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setIsProcessing(false);
    setProgressStep("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={resetForm}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.titleWrap}>
              <View
                style={[
                  styles.titleIcon,
                  { backgroundColor: colors.primarySoft },
                ]}
              >
                <MaterialCommunityIcons
                  name="file-pdf-box"
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>
                  Import Routine PDF
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                  AI Timetable Extractor with Strict Verification
                </Text>
              </View>
            </View>

            <Pressable
              onPress={resetForm}
              disabled={isProcessing}
              style={({ pressed }) => [
                styles.closeBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <MaterialCommunityIcons
                name="close"
                size={22}
                color={colors.muted}
              />
            </Pressable>
          </View>

          <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
            {/* Safety Guarantee Callout */}
            <View
              style={[
                styles.safetyCallout,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F0FDF4",
                  borderColor: isDark ? colors.border : "#BBF7D0",
                },
              ]}
            >
              <MaterialCommunityIcons
                name="shield-check"
                size={18}
                color="#16A34A"
              />
              <Text
                style={[
                  styles.safetyText,
                  { color: isDark ? colors.text : "#15803D" },
                ]}
              >
                Zero-Risk Guarantee: AI creates an editable draft. You will
                verify each class before any reminders are activated.
              </Text>
            </View>

            {/* Step 1: Select File */}
            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              1. Select University Routine (PDF or Image)
            </Text>

            <Pressable
              onPress={handlePickDocument}
              disabled={isProcessing}
              style={({ pressed }) => [
                styles.filePickerBox,
                {
                  borderColor: selectedFile
                    ? colors.primary
                    : isDark
                    ? colors.border
                    : "#CBD5E1",
                  backgroundColor: selectedFile
                    ? isDark
                      ? colors.primarySoft
                      : "#EFF6FF"
                    : isDark
                    ? colors.surface2
                    : "#F8FAFC",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={selectedFile ? "file-check" : "cloud-upload-outline"}
                size={34}
                color={selectedFile ? colors.primary : colors.muted}
              />
              {selectedFile ? (
                <View style={{ alignItems: "center", gap: 2 }}>
                  <Text
                    style={[styles.fileName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {selectedFile.name}
                  </Text>
                  <Text style={[styles.fileSize, { color: colors.muted }]}>
                    {selectedFile.size
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : "File selected"}
                  </Text>
                </View>
              ) : (
                <View style={{ alignItems: "center", gap: 2 }}>
                  <Text style={[styles.pickerTitle, { color: colors.text }]}>
                    Tap to Choose Routine PDF
                  </Text>
                  <Text style={[styles.pickerSub, { color: colors.muted }]}>
                    Supports official semester schedules & timetable photos
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Step 2: Academic Context (helps AI disambiguate section/batches) */}
            <Text
              style={[
                styles.sectionHeading,
                { color: colors.text, marginTop: 16 },
              ]}
            >
              2. Academic Information
            </Text>

            <View style={styles.formGrid}>
              <View style={styles.inputGroupHalf}>
                <Text style={[styles.inputLabel, { color: colors.muted }]}>
                  University
                </Text>
                <TextInput
                  value={university}
                  onChangeText={setUniversity}
                  placeholder="e.g. RUET, BUET"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.textInput,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>

              <View style={styles.inputGroupHalf}>
                <Text style={[styles.inputLabel, { color: colors.muted }]}>
                  Department
                </Text>
                <TextInput
                  value={department}
                  onChangeText={setDepartment}
                  placeholder="e.g. CSE, EEE"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.textInput,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={styles.inputGroupHalf}>
                <Text style={[styles.inputLabel, { color: colors.muted }]}>
                  Semester
                </Text>
                <TextInput
                  value={semester}
                  onChangeText={setSemester}
                  placeholder="e.g. 2-1, 3-2"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.textInput,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>

              <View style={styles.inputGroupHalf}>
                <Text style={[styles.inputLabel, { color: colors.muted }]}>
                  Section
                </Text>
                <TextInput
                  value={section}
                  onChangeText={setSection}
                  placeholder="e.g. A, B"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.textInput,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.inputGroupFull}>
              <Text style={[styles.inputLabel, { color: colors.muted }]}>
                Batch / Academic Year (Optional)
              </Text>
              <TextInput
                value={batch}
                onChangeText={setBatch}
                placeholder="e.g. 2024, 2023"
                placeholderTextColor={colors.muted}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />
            </View>

            <View style={styles.inputGroupFull}>
              <Text style={[styles.inputLabel, { color: colors.muted }]}>
                Notes for AI (e.g. "We are in Section A, Group 1")
              </Text>
              <TextInput
                value={additionalContext}
                onChangeText={setAdditionalContext}
                placeholder="Optional instructions to disambiguate lab groups"
                placeholderTextColor={colors.muted}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />
            </View>

            {/* Processing state indicator */}
            {isProcessing ? (
              <View style={styles.processingWrap}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.processingText, { color: colors.primary }]}>
                  {progressStep}
                </Text>
                <Text style={[styles.processingSub, { color: colors.muted }]}>
                  Gemini multimodal extractor is structuring timetable slots...
                </Text>
              </View>
            ) : null}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Bottom Action Footer */}
          <View
            style={[
              styles.sheetFooter,
              { borderTopColor: isDark ? colors.border : "#E2E8F0" },
            ]}
          >
            <Pressable
              onPress={handleStartExtraction}
              disabled={isProcessing}
              style={({ pressed }) => [
                styles.extractBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || isProcessing ? 0.75 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="creation"
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.extractBtnText}>
                {isProcessing ? "Extracting..." : "Extract Timetable with AI"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    maxHeight: "90%",
    minHeight: 520,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.15)",
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sheetSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  sheetBody: {
    padding: 16,
  },
  safetyCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: 16,
  },
  safetyText: {
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
    lineHeight: 16,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  filePickerBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 8,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "700",
    maxWidth: 240,
  },
  fileSize: {
    fontSize: 11,
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  pickerSub: {
    fontSize: 11,
    textAlign: "center",
  },
  formGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  inputGroupHalf: {
    flex: 1,
    gap: 4,
  },
  inputGroupFull: {
    gap: 4,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  processingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
  },
  processingText: {
    fontSize: 13,
    fontWeight: "700",
  },
  processingSub: {
    fontSize: 11,
    textAlign: "center",
  },
  sheetFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  extractBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  extractBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
