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

interface CreateAssignmentModalProps {
  visible: boolean;
  roomId: string;
  onClose: () => void;
}

export function CreateAssignmentModal({ visible, roomId, onClose }: CreateAssignmentModalProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalPoints, setTotalPoints] = useState("100");
  const [dueDaysPreset, setDueDaysPreset] = useState<number>(3); // Default 3 days
  const [customDueDate, setCustomDueDate] = useState<Date>(new Date(Date.now() + 3 * 86400000));
  const [referenceFile, setReferenceFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
  } | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Pick Reference Document (Optional question paper / rubric)
  const handlePickReferenceDoc = async () => {
    try {
      triggerHaptic("selection");
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "*/*"],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];

      if (file.size && file.size > 50 * 1024 * 1024) {
        Alert.alert("File Too Large", "Reference materials must be under 50MB.");
        return;
      }

      setReferenceFile({
        uri: file.uri,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType || "application/pdf",
      });
    } catch (err: any) {
      Alert.alert("Picker Error", err.message || "Failed to pick file");
    }
  };

  // Create Assignment Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      let attachmentUrl: string | null = null;
      let attachmentPath: string | null = null;

      // Upload reference file to R2 if selected
      if (referenceFile) {
        setIsUploadingFile(true);
        const ticketRes = await api<{
          url: string;
          path: string;
          publicUrl?: string;
        }>("/resources/upload-ticket", {
          method: "POST",
          body: JSON.stringify({
            roomId,
            filename: referenceFile.name,
            contentType: referenceFile.mimeType || "application/pdf",
            fileSizeBytes: referenceFile.size,
          }),
        });

        const fileBlob = await (await fetch(referenceFile.uri)).blob();
        await fetch(ticketRes.url, {
          method: "PUT",
          headers: { "Content-Type": referenceFile.mimeType || "application/octet-stream" },
          body: fileBlob,
        });

        attachmentUrl = ticketRes.publicUrl || ticketRes.url.split("?")[0];
        attachmentPath = ticketRes.path;
      }

      const points = parseInt(totalPoints, 10) || 100;
      const dueDate = new Date(Date.now() + dueDaysPreset * 86400000).toISOString();

      return api(`/rooms/${roomId}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          totalPoints: points,
          dueDate,
          attachmentUrl,
          attachmentPath,
        }),
      });
    },
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["room-assignments", roomId] });
      resetAndClose();
    },
    onError: (err: any) => {
      Alert.alert("Failed to Create Assignment", err.message || "Could not publish assignment");
    },
    onSettled: () => setIsUploadingFile(false),
  });

  const resetAndClose = () => {
    setTitle("");
    setDescription("");
    setTotalPoints("100");
    setDueDaysPreset(3);
    setReferenceFile(null);
    onClose();
  };

  const isPending = createMutation.isPending || isUploadingFile;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <View style={s.overlay}>
        <View style={[s.content, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <Row style={s.headerRow}>
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={22} color={colors.primary} />
              <Text style={[s.title, { color: colors.text }]}>Create Homework Assignment</Text>
            </Row>
            <Pressable onPress={resetAndClose} disabled={isPending}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Title */}
            <Text style={[s.label, { color: colors.muted }]}>Assignment Title *</Text>
            <TextInput
              style={[s.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              placeholder="e.g. Physics Problem Set 4: Electromagnetism"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Description / Instructions */}
            <Text style={[s.label, { color: colors.muted }]}>Instructions & Details</Text>
            <TextInput
              style={[
                s.input,
                s.textArea,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              ]}
              placeholder="Explain the questions, page numbers, or guidelines for submission..."
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            {/* Total Points */}
            <Text style={[s.label, { color: colors.muted }]}>Total Points / Marks</Text>
            <TextInput
              style={[s.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              placeholder="100"
              placeholderTextColor={colors.muted}
              value={totalPoints}
              onChangeText={setTotalPoints}
              keyboardType="numeric"
            />

            {/* Deadline Presets */}
            <Text style={[s.label, { color: colors.muted }]}>Due Date / Deadline</Text>
            <Row style={{ gap: 8, marginBottom: 16 }}>
              {[
                { days: 1, label: "24 Hours" },
                { days: 3, label: "3 Days" },
                { days: 7, label: "1 Week" },
                { days: 14, label: "2 Weeks" },
              ].map((p) => {
                const isSelected = dueDaysPreset === p.days;
                return (
                  <Pressable
                    key={p.days}
                    onPress={() => {
                      triggerHaptic("selection");
                      setDueDaysPreset(p.days);
                    }}
                    style={[
                      s.presetBtn,
                      {
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary : colors.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.presetBtnText,
                        { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "700" : "500" },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>

            {/* Optional Reference File Picker (R2) */}
            <Text style={[s.label, { color: colors.muted }]}>Question Paper or Reference Material (Optional)</Text>
            <Pressable
              onPress={handlePickReferenceDoc}
              style={[
                s.referenceFileBox,
                {
                  borderColor: referenceFile ? colors.primary : colors.border,
                  backgroundColor: referenceFile ? `${colors.primary}12` : colors.surface,
                },
              ]}
            >
              {referenceFile ? (
                <Row style={{ alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                    <MaterialCommunityIcons name="file-pdf-box" size={26} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[s.fileNameText, { color: colors.text }]}>
                        {referenceFile.name}
                      </Text>
                      <Text style={[s.fileSubText, { color: colors.muted }]}>Ready to upload to R2 Vault</Text>
                    </View>
                  </Row>
                  <Pressable onPress={() => setReferenceFile(null)}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                </Row>
              ) : (
                <Row style={{ alignItems: "center", gap: 8, paddingVertical: 4 }}>
                  <MaterialCommunityIcons name="paperclip" size={20} color={colors.primary} />
                  <Text style={[s.uploadText, { color: colors.primary }]}>Attach Question Paper (PDF / Slides up to 50MB)</Text>
                </Row>
              )}
            </Pressable>
          </ScrollView>

          {/* Action Row */}
          <Row style={s.actionsRow}>
            <Pressable onPress={resetAndClose} disabled={isPending} style={s.cancelBtn}>
              <Text style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={isPending || !title.trim()}
              style={[
                s.submitBtn,
                { backgroundColor: colors.primary, opacity: !isPending && title.trim() ? 1 : 0.5 },
              ]}
            >
              {isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={s.submitBtnText}>Publish Assignment</Text>
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
    maxHeight: "88%",
  },
  headerRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 6,
  },
  textArea: {
    height: 75,
    textAlignVertical: "top",
  },
  presetBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  presetBtnText: {
    fontSize: 11,
  },
  referenceFileBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  uploadText: {
    fontSize: 12,
    fontWeight: "600",
  },
  fileNameText: {
    fontSize: 13,
    fontWeight: "700",
  },
  fileSubText: {
    fontSize: 11,
    marginTop: 1,
  },
  actionsRow: {
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
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
