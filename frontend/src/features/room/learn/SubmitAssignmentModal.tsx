import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import type { RoomAssignment } from "@/types";

interface SubmitAssignmentModalProps {
  visible: boolean;
  roomId: string;
  assignment: RoomAssignment | null;
  onClose: () => void;
}

export function SubmitAssignmentModal({
  visible,
  roomId,
  assignment,
  onClose,
}: SubmitAssignmentModalProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
  } | null>(null);
  const [studentNotes, setStudentNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>("");

  const handlePickSolutionFile = async () => {
    try {
      triggerHaptic("selection");
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "image/*",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "application/zip",
          "*/*",
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];

      // 50MB size limit check
      if (file.size && file.size > 50 * 1024 * 1024) {
        Alert.alert(
          "File Exceeds 50MB",
          `Your selected file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. SkillBridge Cloud Vault accepts files up to 50 MB.`
        );
        return;
      }

      setSelectedFile({
        uri: file.uri,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType || "application/pdf",
      });
    } catch (err: any) {
      Alert.alert("File Selection Failed", err.message || "Could not select file");
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !assignment) {
        throw new Error("Please select a file to submit.");
      }

      setIsUploading(true);
      setUploadStep("Generating secure R2 upload ticket...");

      // 1. Request presigned upload ticket from backend
      const ticketRes = await api<{
        url: string;
        path: string;
        publicUrl?: string;
      }>(`/rooms/${roomId}/assignments/${assignment.id}/upload-ticket`, {
        method: "POST",
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.mimeType || "application/pdf",
          fileSizeBytes: selectedFile.size,
        }),
      });

      setUploadStep("Uploading solution to Cloudflare R2...");

      // 2. Direct binary PUT upload to Cloudflare R2
      const fileBlob = await (await fetch(selectedFile.uri)).blob();
      const putRes = await fetch(ticketRes.url, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.mimeType || "application/octet-stream" },
        body: fileBlob,
      });

      if (!putRes.ok) {
        throw new Error(`Direct R2 upload failed with status ${putRes.status}`);
      }

      setUploadStep("Finalizing assignment submission...");
      const finalUrl = ticketRes.publicUrl || ticketRes.url.split("?")[0];

      // 3. Register submission in database
      return api(`/rooms/${roomId}/assignments/${assignment.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          fileUrl: finalUrl,
          storagePath: ticketRes.path,
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          studentNotes: studentNotes.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["room-assignments", roomId] });
      resetAndClose();
    },
    onError: (err: any) => {
      Alert.alert("Submission Failed", err.message || "Failed to submit assignment");
    },
    onSettled: () => {
      setIsUploading(false);
      setUploadStep("");
    },
  });

  const resetAndClose = () => {
    setSelectedFile(null);
    setStudentNotes("");
    setIsUploading(false);
    setUploadStep("");
    onClose();
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!assignment) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <View style={s.overlay}>
        <View style={[s.content, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <Row style={s.headerRow}>
            <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
              <MaterialCommunityIcons name="upload" size={22} color={colors.primary} />
              <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>
                Submit Solution
              </Text>
            </Row>
            <Pressable onPress={resetAndClose} disabled={isUploading}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Assignment Target Info */}
            <View style={[s.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.assignmentTitle, { color: colors.text }]}>{assignment.title}</Text>
              <Row style={{ alignItems: "center", gap: 10, marginTop: 4 }}>
                <Text style={[s.infoSub, { color: colors.muted }]}>
                  {assignment.total_points} Points
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>•</Text>
                <Text style={[s.infoSub, { color: colors.primary, fontWeight: "700" }]}>
                  Due {new Date(assignment.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </Row>
            </View>

            {/* Document Picker Box */}
            <Text style={[s.label, { color: colors.muted }]}>Your Solution File * (PDF or Scanned Images up to 50MB)</Text>
            <Pressable
              onPress={handlePickSolutionFile}
              disabled={isUploading}
              style={[
                s.dropBox,
                {
                  borderColor: selectedFile ? colors.primary : colors.border,
                  backgroundColor: selectedFile ? `${colors.primary}12` : colors.surface,
                },
              ]}
            >
              {selectedFile ? (
                <Row style={{ alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <Row style={{ alignItems: "center", gap: 12, flex: 1 }}>
                    <View style={[s.pickedBadge, { backgroundColor: colors.primary }]}>
                      <MaterialCommunityIcons name="file-check" size={22} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[s.fileNameText, { color: colors.text }]}>
                        {selectedFile.name}
                      </Text>
                      <Text style={[s.fileSizeText, { color: colors.muted }]}>
                        {formatFileSize(selectedFile.size) || "Selected"} • Cloudflare R2 Ready
                      </Text>
                    </View>
                  </Row>
                  <Pressable onPress={() => setSelectedFile(null)}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                </Row>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 14 }}>
                  <MaterialCommunityIcons name="cloud-upload" size={36} color={colors.primary} />
                  <Text style={[s.dropBoxText, { color: colors.text }]}>Tap to select your completed homework</Text>
                  <Text style={[s.dropBoxSub, { color: colors.muted }]}>
                    Upload PDF, scanned handwritten pages, or documents
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Notes to Teacher */}
            <Text style={[s.label, { color: colors.muted }]}>Student Notes / Comments (Optional)</Text>
            <TextInput
              style={[
                s.input,
                s.textArea,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              ]}
              placeholder="e.g. Completed questions 1-5, question 3 graph is attached on page 4..."
              placeholderTextColor={colors.muted}
              value={studentNotes}
              onChangeText={setStudentNotes}
              multiline
              numberOfLines={3}
            />

            {/* Progress indicator */}
            {isUploading && (
              <View style={[s.progressBox, { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}>
                <Row style={{ alignItems: "center", gap: 10 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[s.progressText, { color: colors.primary }]}>
                    {uploadStep || "Uploading to Cloudflare R2..."}
                  </Text>
                </Row>
              </View>
            )}
          </ScrollView>

          {/* Action Row */}
          <Row style={s.actionsRow}>
            <Pressable onPress={resetAndClose} disabled={isUploading} style={s.cancelBtn}>
              <Text style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => submitMutation.mutate()}
              disabled={isUploading || !selectedFile}
              style={[
                s.submitBtn,
                { backgroundColor: colors.primary, opacity: !isUploading && selectedFile ? 1 : 0.5 },
              ]}
            >
              {isUploading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={s.submitBtnText}>Submit Homework</Text>
              )}
            </Pressable>
          </Row>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    maxHeight: "85%",
  },
  headerRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 14,
  },
  assignmentTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  infoSub: {
    fontSize: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 4,
  },
  dropBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  dropBoxText: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  dropBoxSub: {
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
  pickedBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  fileNameText: {
    fontSize: 13,
    fontWeight: "700",
  },
  fileSizeText: {
    fontSize: 11,
    marginTop: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  textArea: {
    height: 70,
    textAlignVertical: "top",
  },
  progressBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 12,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actionsRow: {
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  submitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
});
