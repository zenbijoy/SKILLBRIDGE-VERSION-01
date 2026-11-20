import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
  Share,
  ScrollView,
  Modal,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { api } from "@/lib/api";
import { Card, Pill, Row, triggerHaptic } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import { nextGenAnimationsV2 } from "@/assets/nextgen";
import { useSession } from "@/hooks/useSession";
import { getSocket } from "@/lib/socket";

export type MaterialResource = {
  id: string;
  room_id: string;
  title: string;
  description?: string | null;
  url: string;
  storage_path?: string | null;
  kind: "note" | "slide" | "link" | "file" | "image";
  created_at: string;
  uploader_id?: string;
  uploader?: {
    id: string;
    full_name?: string;
    username?: string;
    avatar_url?: string | null;
    reputation?: number;
  } | null;
};

type FilterCategory = "all" | "note" | "slide" | "file" | "image" | "link";

export function RoomMaterialsHub({
  roomId,
  isMember,
  isHostOrMod = false,
  initialResources = [],
}: {
  roomId: string;
  isMember: boolean;
  isHostOrMod?: boolean;
  initialResources?: MaterialResource[];
}) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { session } = useSession();
  const currentUserId = session?.user?.id;

  // Modal and Form States
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "link">("file");
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"note" | "slide" | "file" | "link" | "image">("note");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<string>("");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>("all");

  // 1. Fetch Storage Status (Observability)
  const storageStatusQuery = useQuery({
    queryKey: ["storage-status"],
    queryFn: () => api<{ provider: string; available: boolean; r2Configured?: boolean }>("/resources/storage-status"),
    staleTime: 60000,
  });

  // 2. Fetch Room Resources Query (Live Sync)
  const resourcesQuery = useQuery<MaterialResource[]>({
    queryKey: ["room-resources", roomId],
    queryFn: async () => {
      const res = await api<{ resources: MaterialResource[] }>(`/resources?roomId=${roomId}`);
      return res.resources ?? [];
    },
    initialData: initialResources.length > 0 ? initialResources : undefined,
    enabled: Boolean(roomId),
  });

  // 3. Socket event listener for real-time synchronization
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !roomId) return;

    const handleAdded = (data: { room_id: string; resource: MaterialResource }) => {
      if (data.room_id === roomId) {
        qc.invalidateQueries({ queryKey: ["room-resources", roomId] });
        qc.invalidateQueries({ queryKey: ["room", roomId] });
      }
    };

    const handleDeleted = (data: { room_id: string; resource_id: string }) => {
      if (data.room_id === roomId) {
        qc.invalidateQueries({ queryKey: ["room-resources", roomId] });
        qc.invalidateQueries({ queryKey: ["room", roomId] });
      }
    };

    socket.on("room:resource_added", handleAdded);
    socket.on("room:resource_deleted", handleDeleted);

    return () => {
      socket.off("room:resource_added", handleAdded);
      socket.off("room:resource_deleted", handleDeleted);
    };
  }, [roomId, qc]);

  // 4. Delete Resource Mutation
  const deleteMutation = useMutation({
    mutationFn: (resourceId: string) =>
      api(`/resources/${resourceId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["room-resources", roomId] });
      qc.invalidateQueries({ queryKey: ["room", roomId] });
    },
    onError: (err: Error) => Alert.alert("Could not delete material", err.message),
  });

  // Pick Document (Supports PDF, Notes, Word, PPT, Excel, Images up to 50MB)
  const handlePickDocument = async () => {
    try {
      triggerHaptic("selection");
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "text/plain",
          "text/markdown",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/zip",
          "image/*",
          "*/*",
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];

      // 50MB validation check
      if (file.size && file.size > 50 * 1024 * 1024) {
        Alert.alert(
          "File Too Large",
          `The selected file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. SkillBridge Cloud Vault supports files up to 50 MB.`
        );
        return;
      }

      setSelectedFile({
        uri: file.uri,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType || "application/pdf",
      });

      // Auto-populate Title without extension if blank
      if (!title.trim()) {
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        setTitle(baseName);
      }

      // Auto-detect Kind
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (ext === "pdf") {
        setKind("note");
      } else if (["ppt", "pptx"].includes(ext)) {
        setKind("slide");
      } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        setKind("image");
      } else if (["doc", "docx", "txt", "md"].includes(ext)) {
        setKind("note");
      } else {
        setKind("file");
      }
    } catch (err: any) {
      Alert.alert("File Selection Failed", err.message || "Could not access document picker");
    }
  };

  // Upload & Register Material Resource
  const handleUploadResource = async () => {
    if (!title.trim()) {
      Alert.alert("Title Required", "Please enter a title for the study material.");
      return;
    }

    if (uploadMode === "link") {
      if (!url.trim()) {
        Alert.alert("URL Required", "Please enter a valid URL link.");
        return;
      }
      try {
        setIsUploading(true);
        await api(`/resources`, {
          method: "POST",
          body: JSON.stringify({
            room_id: roomId,
            title: title.trim(),
            description: description.trim() || undefined,
            url: url.trim(),
            kind,
          }),
        });
        triggerHaptic("notificationSuccess");
        qc.invalidateQueries({ queryKey: ["room-resources", roomId] });
        qc.invalidateQueries({ queryKey: ["room", roomId] });
        resetForm();
      } catch (err: any) {
        Alert.alert("Upload Failed", err.message || "Failed to add link resource");
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Upload Mode === "file"
    if (!selectedFile) {
      Alert.alert("No File Selected", "Please pick a PDF, note, or document to upload.");
      return;
    }

    try {
      setIsUploading(true);
      setUploadStage("Minting secure R2 upload ticket...");

      // 1. Request presigned R2 upload ticket
      const ticketRes = await api<{
        bucket: string;
        url: string;
        path: string;
        provider: "supabase" | "r2";
        publicUrl?: string;
        mediaObjectId?: string;
      }>("/resources/upload-ticket", {
        method: "POST",
        body: JSON.stringify({
          roomId,
          filename: selectedFile.name,
          contentType: selectedFile.mimeType || "application/pdf",
          fileSizeBytes: selectedFile.size,
        }),
      });

      setUploadStage("Uploading to Cloudflare R2 Storage (up to 50MB)...");

      let uploadOk = false;
      try {
        const fileBlob = await (await fetch(selectedFile.uri)).blob();
        const putRes = await fetch(ticketRes.url, {
          method: "PUT",
          headers: {
            "Content-Type": selectedFile.mimeType || "application/octet-stream",
          },
          body: fileBlob,
        });
        if (putRes.ok) {
          uploadOk = true;
        }
      } catch (putErr) {
        console.warn("Direct R2 presigned PUT encountered issue, attempting fallback...", putErr);
      }

      // 2. Server Buffer fallback if direct PUT failed
      if (!uploadOk) {
        setUploadStage("Saving via server storage fallback...");
        const blob = await (await fetch(selectedFile.uri)).blob();
        const reader = new FileReader();
        const base64Data: string = await new Promise((resolve, reject) => {
          reader.onloadend = () => {
            const raw = reader.result as string;
            resolve(raw.includes(",") ? raw.split(",")[1] ?? "" : raw);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        await api("/resources/upload", {
          method: "POST",
          body: JSON.stringify({
            roomId,
            title: title.trim(),
            description: description.trim() || undefined,
            fileBase64: base64Data,
            fileName: selectedFile.name,
            contentType: selectedFile.mimeType || "application/pdf",
            kind,
          }),
        });
      } else {
        // 3. Finalize registration in room
        setUploadStage("Registering resource in room...");
        const finalUrl = ticketRes.publicUrl || ticketRes.url.split("?")[0];
        await api("/resources", {
          method: "POST",
          body: JSON.stringify({
            room_id: roomId,
            title: title.trim(),
            description: description.trim() || undefined,
            url: finalUrl,
            storage_path: ticketRes.path,
            media_object_id: ticketRes.mediaObjectId,
            file_size_bytes: selectedFile.size,
            kind,
          }),
        });
      }

      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["room-resources", roomId] });
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      resetForm();
    } catch (err: any) {
      Alert.alert("Upload Error", err.message || "Failed to upload file to Cloudflare R2 storage");
    } finally {
      setIsUploading(false);
      setUploadStage("");
    }
  };

  const resetForm = () => {
    setShowAddModal(false);
    setSelectedFile(null);
    setTitle("");
    setDescription("");
    setUrl("");
    setKind("note");
  };

  // Open / Download resource with fresh signed URL
  const handleAccessResource = async (item: MaterialResource) => {
    try {
      triggerHaptic("selection");
      let downloadUrl = item.url;
      try {
        const ticket = await api<{ url: string }>(`/resources/${item.id}/download`);
        if (ticket?.url) {
          downloadUrl = ticket.url;
        }
      } catch {
        // Fallback to item.url
      }

      const supported = await Linking.canOpenURL(downloadUrl).catch(() => false);
      if (supported) {
        await Linking.openURL(downloadUrl);
      } else {
        await Linking.openURL(item.url).catch(() => {
          Alert.alert("Resource URL", downloadUrl);
        });
      }
    } catch (err: any) {
      Alert.alert("Could not open material", err.message || "Unable to open link");
    }
  };

  // Share resource link
  const handleShareResource = async (item: MaterialResource) => {
    try {
      triggerHaptic("selection");
      await Share.share({
        title: item.title,
        message: `Check out "${item.title}" on SkillBridge: ${item.url}`,
        url: item.url,
      });
    } catch {}
  };

  // Delete Resource Confirmation
  const handleDeleteResource = (item: MaterialResource) => {
    triggerHaptic("warning");
    Alert.alert(
      "Delete Study Material?",
      `Are you sure you want to remove "${item.title}"? This will permanently delete the file from Cloudflare R2 storage.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(item.id),
        },
      ]
    );
  };

  // Icon Resolver
  const getKindConfig = (k?: string, fileUrl?: string) => {
    const raw = (k || "").toLowerCase();
    const ext = (fileUrl || "").split("?")[0].split(".").pop()?.toLowerCase() || "";

    if (raw === "slide" || raw === "ppt" || ext === "ppt" || ext === "pptx") {
      return { icon: "file-powerpoint" as const, color: "#EA580C", label: "Slides" };
    }
    if (raw === "note" || ext === "pdf") {
      return { icon: "file-pdf-box" as const, color: "#DC2626", label: "PDF / Notes" };
    }
    if (raw === "image" || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      return { icon: "file-image" as const, color: "#9333EA", label: "Image" };
    }
    if (["doc", "docx"].includes(ext)) {
      return { icon: "file-word" as const, color: "#2563EB", label: "Word Doc" };
    }
    if (["xls", "xlsx", "csv"].includes(ext)) {
      return { icon: "file-excel" as const, color: "#16A34A", label: "Spreadsheet" };
    }
    if (["zip", "rar", "7z"].includes(ext)) {
      return { icon: "folder-zip" as const, color: "#D97706", label: "Archive" };
    }
    if (raw === "link" || (!ext && fileUrl?.startsWith("http"))) {
      return { icon: "link-variant" as const, color: "#0D9488", label: "Link" };
    }
    return { icon: "file-document" as const, color: colors.primary, label: "Document" };
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const allResources = resourcesQuery.data ?? [];

  // Filter & Search Logic
  const filteredResources = allResources.filter((item) => {
    if (selectedFilter !== "all") {
      if (selectedFilter === "note" && item.kind !== "note" && !item.url.toLowerCase().includes(".pdf")) return false;
      if (selectedFilter === "slide" && item.kind !== "slide") return false;
      if (selectedFilter === "image" && item.kind !== "image") return false;
      if (selectedFilter === "link" && item.kind !== "link") return false;
      if (selectedFilter === "file" && item.kind !== "file") return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchUploader = item.uploader?.full_name?.toLowerCase().includes(q);
      return matchTitle || matchDesc || matchUploader;
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* 1. Header Bar with R2 Storage Badge */}
      <Row style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <Text style={[styles.title, { color: colors.text }]}>Study Materials & Handouts</Text>
            <Pill tone="accent">
              {storageStatusQuery.data?.r2Configured !== false ? "R2 Cloud Vault" : "Storage Vault"}
            </Pill>
          </Row>
          <Text style={[styles.subTitle, { color: colors.muted }]}>
            Upload PDFs, lecture slides & notes up to 50MB
          </Text>
        </View>

        {isMember && (
          <Pressable
            onPress={() => {
              triggerHaptic("selection");
              setShowAddModal(true);
            }}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="cloud-upload" size={17} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Upload File</Text>
          </Pressable>
        )}
      </Row>

      {/* 2. Filter & Search Controls */}
      <View style={styles.filterContainer}>
        {/* Search Input */}
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search materials by title or author..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
          {(
            [
              { key: "all", label: "All Items" },
              { key: "note", label: "PDFs & Notes" },
              { key: "slide", label: "Slides" },
              { key: "file", label: "Documents" },
              { key: "image", label: "Images" },
              { key: "link", label: "Links" },
            ] as const
          ).map((cat) => {
            const isSelected = selectedFilter === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => {
                  triggerHaptic("selection");
                  setSelectedFilter(cat.key);
                }}
                style={[
                  styles.filterPill,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "700" : "500" },
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Upload Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="cloud-upload-outline" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Share Learning Material</Text>
              </Row>
              <Pressable onPress={() => setShowAddModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            {/* Mode Switcher */}
            <Row style={[styles.modeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                onPress={() => setUploadMode("file")}
                style={[
                  styles.modeBtn,
                  uploadMode === "file" && { backgroundColor: colors.primary },
                ]}
              >
                <MaterialCommunityIcons
                  name="file-upload"
                  size={16}
                  color={uploadMode === "file" ? "#FFFFFF" : colors.muted}
                />
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: uploadMode === "file" ? "#FFFFFF" : colors.muted, fontWeight: uploadMode === "file" ? "700" : "500" },
                  ]}
                >
                  Upload File (Max 50MB)
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setUploadMode("link")}
                style={[
                  styles.modeBtn,
                  uploadMode === "link" && { backgroundColor: colors.primary },
                ]}
              >
                <MaterialCommunityIcons
                  name="link-variant"
                  size={16}
                  color={uploadMode === "link" ? "#FFFFFF" : colors.muted}
                />
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: uploadMode === "link" ? "#FFFFFF" : colors.muted, fontWeight: uploadMode === "link" ? "700" : "500" },
                  ]}
                >
                  Web / Cloud Link
                </Text>
              </Pressable>
            </Row>

            {/* File Mode Picker Card */}
            {uploadMode === "file" ? (
              <View style={{ marginBottom: 14 }}>
                <Pressable
                  onPress={handlePickDocument}
                  style={[
                    styles.pickDropZone,
                    {
                      borderColor: selectedFile ? colors.primary : colors.border,
                      backgroundColor: selectedFile ? `${colors.primary}10` : colors.surface,
                    },
                  ]}
                >
                  {selectedFile ? (
                    <Row style={{ alignItems: "center", gap: 12, width: "100%" }}>
                      <View style={[styles.filePickedIcon, { backgroundColor: colors.primary }]}>
                        <MaterialCommunityIcons name="file-check" size={24} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={[styles.fileNameText, { color: colors.text }]}>
                          {selectedFile.name}
                        </Text>
                        <Text style={[styles.fileSizeText, { color: colors.muted }]}>
                          {formatFileSize(selectedFile.size) || "Selected"} • Cloudflare R2 Ready
                        </Text>
                      </View>
                      <Pressable onPress={() => setSelectedFile(null)}>
                        <MaterialCommunityIcons name="close-circle" size={20} color={colors.muted} />
                      </Pressable>
                    </Row>
                  ) : (
                    <View style={{ alignItems: "center", paddingVertical: 12 }}>
                      <MaterialCommunityIcons name="file-pdf-box" size={40} color={colors.primary} />
                      <Text style={[styles.dropZoneTitle, { color: colors.text }]}>Tap to pick PDF, Notes, or Slides</Text>
                      <Text style={[styles.dropZoneSub, { color: colors.muted }]}>Supports PDF, PPTX, DOCX, TXT, ZIP up to 50MB</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ) : (
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                placeholder="Paste URL (Google Drive, Dropbox, or Web Link)"
                placeholderTextColor={colors.muted}
                value={url}
                onChangeText={setUrl}
              />
            )}

            {/* Document Title */}
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              placeholder="Material Title (e.g., Physics Chapter 3 Formulas)"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Optional Description */}
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              ]}
              placeholder="Description or notes for classmates/students (optional)..."
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
            />

            {/* Category / Kind Selector */}
            <Text style={[styles.kindLabel, { color: colors.muted }]}>Category:</Text>
            <Row style={{ gap: 8, marginBottom: 16 }}>
              {(["note", "slide", "file", "image"] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={[
                    styles.kindPill,
                    {
                      borderColor: kind === k ? colors.primary : colors.border,
                      backgroundColor: kind === k ? colors.primary : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: kind === k ? "#FFFFFF" : colors.text, fontWeight: "600", fontSize: 12 }}>
                    {k.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </Row>

            {/* Upload Progress Banner */}
            {isUploading && (
              <View style={[styles.progressBox, { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}>
                <Row style={{ alignItems: "center", gap: 10 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.progressText, { color: colors.primary }]}>
                    {uploadStage || "Storing in Cloudflare R2 Vault..."}
                  </Text>
                </Row>
              </View>
            )}

            {/* Action Buttons */}
            <Row style={styles.actionRow}>
              <Pressable onPress={() => setShowAddModal(false)} disabled={isUploading} style={styles.cancelBtn}>
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleUploadResource}
                disabled={isUploading || !title.trim() || (uploadMode === "file" ? !selectedFile : !url.trim())}
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      !isUploading && title.trim() && (uploadMode === "file" ? Boolean(selectedFile) : Boolean(url.trim()))
                        ? 1
                        : 0.5,
                  },
                ]}
              >
                {isUploading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Upload to Vault</Text>
                )}
              </Pressable>
            </Row>
          </View>
        </View>
      </Modal>

      {/* 4. Resources List */}
      {resourcesQuery.isLoading && allResources.length === 0 ? (
        <Card style={styles.emptyCard}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ marginTop: 8, fontSize: 13, color: colors.muted }}>Loading room materials...</Text>
        </Card>
      ) : filteredResources.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Image
            source={nextGenAnimationsV2.bookmarkSaved}
            style={{ width: 64, height: 64, marginBottom: 8 }}
            resizeMode="contain"
          />
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {searchQuery ? "No matching study materials found" : "No study materials shared yet"}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            {searchQuery
              ? "Try searching with different keywords"
              : "Students and teachers can upload past exam papers, lecture notes, or slides up to 50MB."}
          </Text>
        </Card>
      ) : (
        filteredResources.map((item) => {
          const cfg = getKindConfig(item.kind, item.url);
          const isOwnerOrAuthor = currentUserId === item.uploader_id || isHostOrMod;
          const uploaderName = item.uploader?.full_name || item.uploader?.username || "Study Member";

          return (
            <Card key={item.id} style={styles.resourceCard}>
              <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                <Row style={{ alignItems: "flex-start", gap: 12, flex: 1 }}>
                  {/* Category / Format Icon Badge */}
                  <View style={[styles.iconCircle, { backgroundColor: `${cfg.color}18` }]}>
                    <MaterialCommunityIcons name={cfg.icon} size={24} color={cfg.color} />
                  </View>

                  {/* Resource Details */}
                  <View style={{ flex: 1 }}>
                    <Row style={{ alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={[styles.resourceTitle, { color: colors.text }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                      {item.storage_path && (
                        <View style={[styles.r2Badge, { backgroundColor: `${colors.primary}18` }]}>
                          <Text style={[styles.r2BadgeText, { color: colors.primary }]}>R2 Vault</Text>
                        </View>
                      )}
                    </Row>

                    {Boolean(item.description) && (
                      <Text numberOfLines={2} style={[styles.resourceDesc, { color: colors.muted }]}>
                        {item.description}
                      </Text>
                    )}

                    <Row style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
                      <Text style={[styles.uploaderText, { color: colors.muted }]}>
                        By {uploaderName}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>•</Text>
                      <Text style={[styles.metaText, { color: colors.muted }]}>
                        {new Date(item.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </Row>
                  </View>
                </Row>

                {/* Actions: Access, Share, Delete */}
                <Row style={{ alignItems: "center", gap: 6, marginLeft: 8 }}>
                  <Pressable
                    onPress={() => handleShareResource(item)}
                    style={[styles.iconActionBtn, { borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="share-variant-outline" size={16} color={colors.muted} />
                  </Pressable>

                  {isOwnerOrAuthor && (
                    <Pressable
                      onPress={() => handleDeleteResource(item)}
                      style={[styles.iconActionBtn, { borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => handleAccessResource(item)}
                    style={[styles.accessBtn, { backgroundColor: colors.primary }]}
                  >
                    <MaterialCommunityIcons name="download" size={15} color="#FFFFFF" />
                    <Text style={styles.accessBtnText}>Open</Text>
                  </Pressable>
                </Row>
              </Row>
            </Card>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  headerRow: { alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 16, fontWeight: "700" },
  subTitle: { fontSize: 12, marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  addBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  filterContainer: { marginBottom: 12 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 13 },
  filterPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  filterPillText: { fontSize: 11 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: 18,
    maxHeight: "90%",
  },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  modeRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  modeBtnText: { fontSize: 12 },
  pickDropZone: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dropZoneTitle: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  dropZoneSub: { fontSize: 11, marginTop: 2, textAlign: "center" },
  filePickedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  fileNameText: { fontSize: 13, fontWeight: "700" },
  fileSizeText: { fontSize: 11, marginTop: 1 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    marginBottom: 10,
  },
  textArea: { height: 60, textAlignVertical: "top" },
  kindLabel: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
  kindPill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  progressBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 12,
  },
  progressText: { fontSize: 12, fontWeight: "600" },
  actionRow: { justifyContent: "flex-end", gap: 10, marginTop: 6 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md },
  submitBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  emptyCard: { padding: 24, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14, fontWeight: "700", marginTop: 8 },
  emptySubtext: { fontSize: 12, marginTop: 4, textAlign: "center" },
  resourceCard: { padding: 12, marginBottom: 8, borderRadius: radius.md },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  resourceTitle: { fontSize: 13, fontWeight: "700" },
  resourceDesc: { fontSize: 11, marginTop: 2 },
  uploaderText: { fontSize: 11, fontWeight: "500" },
  metaText: { fontSize: 11 },
  r2Badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.xs },
  r2BadgeText: { fontSize: 9, fontWeight: "800" },
  iconActionBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  accessBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  accessBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});
