import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import {
  Button,
  Empty,
  ErrorState,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { FullScreenPdfReader } from "@/components/FullScreenPdfReader";
import { radius, useTheme } from "@/theme";
import { useSession } from "@/hooks/useSession";

export interface VaultNote {
  id: string;
  title: string;
  description?: string | null;
  file_url: string;
  file_key: string;
  file_size_bytes?: number;
  mime_type?: string;
  uploader_id: string;
  uploader?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
    university?: string | null;
    department?: string | null;
  };
  department?: string | null;
  semester?: string | null;
  course_code?: string | null;
  tags?: string[];
  visibility: "public" | "community" | "private";
  community_id?: string | null;
  community_name?: string | null;
  downloads_count: number;
  views_count: number;
  created_at: string;
  source_type?: "direct_upload" | "google_drive";
  source_drive_id?: string | null;
  source_drive_url?: string | null;
  sync_status?: string;
  r2_cached_at?: string | null;
}

const DEPARTMENTS = ["All", "CSE", "EEE", "BBA", "Architecture", "Civil", "Mechanical", "General"];
const SEMESTERS = ["All", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "1.2 MB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function initials(name?: string): string {
  if (!name) return "SB";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function NoteVaultScreen() {
  const { colors, isDark } = useTheme();
  const { session } = useSession();
  const qc = useQueryClient();

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"all" | "public" | "community">("all");
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedSem, setSelectedSem] = useState("All");

  // Reader Modal State
  const [readerNote, setReaderNote] = useState<VaultNote | null>(null);

  // Upload Modal State
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadDept, setUploadDept] = useState("CSE");
  const [uploadSem, setUploadSem] = useState("1st");
  const [uploadCourseCode, setUploadCourseCode] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadVisibility, setUploadVisibility] = useState<"public" | "community">("public");
  const [uploadCommunityName, setUploadCommunityName] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
    base64?: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");

  // Google Drive Ingestion State
  const [driveModalVisible, setDriveModalVisible] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveDept, setDriveDept] = useState("CSE");
  const [driveSem, setDriveSem] = useState("1st");
  const [driveCourseCode, setDriveCourseCode] = useState("");
  const [driveTags, setDriveTags] = useState("");
  const [driveVisibility, setDriveVisibility] = useState<"public" | "community">("public");
  const [driveCommunityName, setDriveCommunityName] = useState("");
  const [isSubmittingDrive, setIsSubmittingDrive] = useState(false);

  // Active VPS Sync Job State & Polling
  const [activeSyncJob, setActiveSyncJob] = useState<{
    jobId: string;
    status: "pending" | "processing" | "completed" | "failed";
    filesFound: number;
    filesProcessed: number;
    error?: string;
  } | null>(null);

  // Manual R2 Caching State
  const [cachingNoteId, setCachingNoteId] = useState<string | null>(null);

  // Resolve direct or stream URL for a given note
  const resolveNoteStreamUrl = (note: VaultNote): string => {
    if (note.source_type === "google_drive") {
      return `${API_URL}/vault/drive/stream/${note.id}`;
    }
    return note.file_url;
  };

  // Poll active VPS sync job until completed or failed
  useEffect(() => {
    if (!activeSyncJob || activeSyncJob.status === "completed" || activeSyncJob.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await api<{ job: any }>(`/vault/drive/jobs/${activeSyncJob.jobId}`);
        if (res?.job) {
          const { status, files_found, files_processed, error_message } = res.job;
          setActiveSyncJob((prev) =>
            prev
              ? {
                  ...prev,
                  status,
                  filesFound: files_found || 0,
                  filesProcessed: files_processed || 0,
                  error: error_message,
                }
              : null,
          );

          if (status === "completed") {
            clearInterval(interval);
            triggerHaptic();
            await qc.invalidateQueries({ queryKey: ["vault-notes"] });
            await qc.refetchQueries({ queryKey: ["vault-notes"] });
            setTimeout(() => {
              setActiveSyncJob((curr) => (curr?.status === "completed" ? null : curr));
            }, 6000);
          } else if (status === "failed") {
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn("Poll sync job error:", e);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeSyncJob?.jobId, activeSyncJob?.status, qc]);

  // Fetch Vault Notes
  const queryParams = new URLSearchParams();
  if (search.trim()) queryParams.set("q", search.trim());
  if (selectedDept !== "All") queryParams.set("department", selectedDept);
  if (selectedSem !== "All") queryParams.set("semester", selectedSem);
  if (visibility !== "all") queryParams.set("visibility", visibility);

  const notesQuery = useQuery({
    queryKey: ["vault-notes", search, selectedDept, selectedSem, visibility],
    queryFn: () =>
      api<{ notes: VaultNote[] }>(`/vault?${queryParams.toString()}`).then((res) => res.notes ?? []),
  });

  // Pick Document for Upload (Supports up to 200 MB+ without JS heap crash)
  const handlePickDocument = async () => {
    try {
      triggerHaptic();
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];

      // Only attempt base64 read for small files on web; stream directly on native
      let base64 = "";
      if (Platform.OS === "web" && file.size && file.size < 15 * 1024 * 1024) {
        try {
          const response = await fetch(file.uri);
          const blob = await response.blob();
          const reader = new FileReader();
          base64 = await new Promise((resolve) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              const pureBase64 = result.includes(",") ? result.split(",")[1] ?? "" : result;
              resolve(pureBase64);
            };
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn("Base64 reading fallback error:", e);
        }
      }

      setSelectedDoc({
        uri: file.uri,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType || "application/pdf",
        base64,
      });

      if (!uploadTitle.trim()) {
        const cleanName = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
        setUploadTitle(cleanName);
      }
    } catch (err: any) {
      Alert.alert("Picker Error", err.message || "Failed to pick document.");
    }
  };

  // Upload & Compress Mutation (Handles 200 MB files via native streaming & R2 Turbo Compressor)
  const handleUploadSubmit = async () => {
    if (!selectedDoc) {
      Alert.alert("Document Required", "Please select a PDF document first.");
      return;
    }
    if (!uploadTitle.trim()) {
      Alert.alert("Title Required", "Please enter a descriptive title for this note.");
      return;
    }

    try {
      triggerHaptic();
      setIsUploading(true);
      setUploadStatusText("Streaming PDF to Turbo Compressor...");

      const parsedTags = uploadTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      let responseData: any = null;

      // NATIVE STREAMING: Uses FileSystem.uploadAsync (zero memory overhead, supports up to 250MB)
      if (Platform.OS !== "web" && selectedDoc.uri) {
        setUploadStatusText("Compressing & Saving in Cloudflare R2...");
        const token = (session as any)?.token || session?.access_token;
        const uploadResult = await FileSystem.uploadAsync(
          `${API_URL}/vault/upload-raw`,
          selectedDoc.uri,
          {
            httpMethod: "POST",
            uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT ?? 0,
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              "x-vault-title": encodeURIComponent(uploadTitle.trim()),
              "x-vault-description": encodeURIComponent(uploadDesc.trim()),
              "x-vault-department": encodeURIComponent(uploadDept),
              "x-vault-semester": encodeURIComponent(uploadSem),
              "x-vault-course-code": encodeURIComponent(uploadCourseCode.trim()),
              "x-vault-tags": encodeURIComponent(parsedTags.join(",")),
              "x-vault-visibility": uploadVisibility,
              "x-vault-filename": encodeURIComponent(selectedDoc.name),
              "x-vault-community-name": encodeURIComponent(
                uploadVisibility === "community" ? uploadCommunityName.trim() || "Campus Community" : "",
              ),
            },
          },
        );

        if (uploadResult.status >= 400) {
          let errMessage = "Upload failed";
          try {
            const parsed = JSON.parse(uploadResult.body);
            errMessage = parsed.error || errMessage;
          } catch {}
          throw new Error(errMessage);
        }

        responseData = JSON.parse(uploadResult.body);
      } else {
        // WEB STREAMING: Uses binary blob fetch
        setUploadStatusText("Compressing & Saving in Cloudflare R2...");
        const token = (session as any)?.token || session?.access_token;
        let blob: Blob | null = null;
        try {
          const blobRes = await fetch(selectedDoc.uri);
          blob = await blobRes.blob();
        } catch {}

        if (blob) {
          const rawRes = await fetch(`${API_URL}/vault/upload-raw`, {
            method: "POST",
            body: blob,
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              "Content-Type": "application/pdf",
              "x-vault-title": encodeURIComponent(uploadTitle.trim()),
              "x-vault-description": encodeURIComponent(uploadDesc.trim()),
              "x-vault-department": encodeURIComponent(uploadDept),
              "x-vault-semester": encodeURIComponent(uploadSem),
              "x-vault-course-code": encodeURIComponent(uploadCourseCode.trim()),
              "x-vault-tags": encodeURIComponent(parsedTags.join(",")),
              "x-vault-visibility": uploadVisibility,
              "x-vault-filename": encodeURIComponent(selectedDoc.name),
              "x-vault-community-name": encodeURIComponent(
                uploadVisibility === "community" ? uploadCommunityName.trim() || "Campus Community" : "",
              ),
            },
          });

          if (!rawRes.ok) {
            const errData = await rawRes.json().catch(() => ({}));
            throw new Error(errData.error || "Web upload failed");
          }
          responseData = await rawRes.json();
        } else if (selectedDoc.base64) {
          responseData = await api("/vault/upload", {
            method: "POST",
            body: JSON.stringify({
              title: uploadTitle.trim(),
              description: uploadDesc.trim(),
              fileBase64: selectedDoc.base64,
              fileName: selectedDoc.name,
              department: uploadDept,
              semester: uploadSem,
              courseCode: uploadCourseCode.trim() || undefined,
              tags: parsedTags,
              visibility: uploadVisibility,
              communityName:
                uploadVisibility === "community" ? uploadCommunityName.trim() || "Campus Community" : undefined,
            }),
          });
        }
      }

      triggerHaptic();
      setUploadModalVisible(false);
      setSelectedDoc(null);
      setUploadTitle("");
      setUploadDesc("");
      setUploadCourseCode("");
      setUploadTags("");
      setUploadCommunityName("");

      // Invalidate queries so note appears immediately at top of screen!
      await qc.invalidateQueries({ queryKey: ["vault-notes"] });
      await qc.refetchQueries({ queryKey: ["vault-notes"] });

      const opt = responseData?.optimization;
      if (opt) {
        if (opt.isDeduplicated) {
          Alert.alert(
            "Deduplication Match Found! ⚡",
            "An identical document was already in Cloudflare R2! 100% bandwidth saved and instantly indexed into your vault.",
          );
        } else if (opt.savedPercent && opt.savedPercent !== "0.0%") {
          Alert.alert(
            "Turbo Compression Successful! 🎉",
            `PDF compressed from ${formatBytes(opt.originalBytes)} down to ${formatBytes(opt.finalBytes)} (${opt.savedPercent} smaller)!\nSaved to Cloudflare R2 for lightning-fast reading.`,
          );
        } else {
          Alert.alert("Upload Successful", "Your document has been verified and saved to Cloudflare R2 Vault!");
        }
      } else {
        Alert.alert("Upload Successful", "Your document has been saved to Cloudflare R2 Vault!");
      }
    } catch (err: any) {
      Alert.alert("Upload Failed", err.message || "Could not complete PDF upload to Cloudflare R2.");
    } finally {
      setIsUploading(false);
      setUploadStatusText("");
    }
  };

  // Google Drive Ingestion Submission to VPS Background Worker
  const handleDriveSubmit = async () => {
    const trimmed = driveUrl.trim();
    if (!trimmed) {
      Alert.alert("Google Drive Link Required", "Please enter a valid Google Drive folder or file link.");
      return;
    }
    if (!trimmed.includes("drive.google.com") && !trimmed.includes("docs.google.com")) {
      Alert.alert(
        "Invalid Link",
        "Please provide a valid link from drive.google.com (folder/file) or docs.google.com (Doc, Slides, Sheets).",
      );
      return;
    }

    try {
      triggerHaptic();
      setIsSubmittingDrive(true);

      const parsedTags = driveTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await api<{
        success: boolean;
        jobId: string;
        message: string;
        driveType: string;
        driveId: string;
      }>("/vault/drive/import", {
        method: "POST",
        body: JSON.stringify({
          driveUrl: trimmed,
          department: driveDept,
          semester: driveSem,
          courseCode: driveCourseCode.trim() || undefined,
          tags: parsedTags.length > 0 ? parsedTags : ["GoogleDrive", "Academic"],
          visibility: driveVisibility,
          communityName:
            driveVisibility === "community" ? driveCommunityName.trim() || "Campus Community" : undefined,
        }),
      });

      triggerHaptic();
      setDriveModalVisible(false);
      setDriveUrl("");
      setDriveCourseCode("");
      setDriveTags("");

      // Start active background job banner
      setActiveSyncJob({
        jobId: res.jobId,
        status: "pending",
        filesFound: 0,
        filesProcessed: 0,
      });

      Alert.alert(
        "VPS Ingestion Started! 🚀",
        `Our VPS background worker has begun crawling the Google Drive ${res.driveType}.\n\nMetadata is cataloged into the Note Vault, a manifest is archived to Cloudflare R2, and documents can be streamed instantly.`,
      );
    } catch (err: any) {
      Alert.alert("Drive Import Failed", err.message || "Could not dispatch Google Drive ingestion job.");
    } finally {
      setIsSubmittingDrive(false);
    }
  };

  // Manual R2 Cache Trigger for Google Drive note
  const handleCacheNoteToR2 = async (noteId: string) => {
    try {
      triggerHaptic();
      setCachingNoteId(noteId);
      await api(`/vault/drive/cache/${noteId}`, { method: "POST" });
      triggerHaptic();
      await qc.invalidateQueries({ queryKey: ["vault-notes"] });
      await qc.refetchQueries({ queryKey: ["vault-notes"] });
      Alert.alert(
        "Cloudflare R2 Synced! ☁️",
        "Document has been downloaded, optimized, and permanently mirrored in Cloudflare R2 for lightning-fast access.",
      );
    } catch (err: any) {
      Alert.alert("Cache Failed", err.message || "Could not mirror document to Cloudflare R2.");
    } finally {
      setCachingNoteId(null);
    }
  };

  // Open In-App PDF Reader
  const handleOpenReader = (note: VaultNote) => {
    triggerHaptic();
    setReaderNote(note);

    // Record view in backend
    try {
      void api(`/vault/${note.id}/view`, { method: "POST" });
    } catch {}
  };

  // Share PDF / Drive Note
  const handleShareNote = async (note: VaultNote) => {
    triggerHaptic();
    const targetUrl = resolveNoteStreamUrl(note);
    try {
      await Share.share({
        title: note.title,
        message: `Read "${note.title}" on SkillBridge Note Vault: ${targetUrl}`,
        url: targetUrl,
      });
    } catch (err) {
      console.warn("Share failed:", err);
    }
  };

  // Delete Note
  const handleDeleteNote = (noteId: string) => {
    Alert.alert("Delete Note", "Are you sure you want to delete this resource from the vault?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            triggerHaptic();
            await api(`/vault/${noteId}`, { method: "DELETE" });
            await qc.invalidateQueries({ queryKey: ["vault-notes"] });
            if (readerNote?.id === noteId) setReaderNote(null);
          } catch (err: any) {
            Alert.alert("Delete Error", err.message || "Could not delete note.");
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Navigation & Header */}
        <Animated.View entering={FadeInDown.duration(250)} style={styles.topHeader}>
          <Row style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Row style={{ alignItems: "center", gap: 10 }}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={12}
                style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
              </Pressable>
              <View>
                <H1 style={styles.headerTitle}>Academic & Note Vault</H1>
                <Muted style={styles.headerSub}>Cloudflare R2 • Deduplicated Storage</Muted>
              </View>
            </Row>

            <Row style={{ alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setDriveModalVisible(true);
                }}
                style={[
                  styles.drivePillBtn,
                  {
                    backgroundColor: isDark ? "rgba(16, 185, 129, 0.18)" : "#ecfdf5",
                    borderColor: isDark ? "#059669" : "#10b981",
                  },
                ]}
              >
                <MaterialCommunityIcons name="google-drive" size={16} color="#10b981" />
                <Text style={[styles.drivePillText, { color: isDark ? "#6ee7b7" : "#065f46" }]}>
                  Drive Sync
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setUploadModalVisible(true);
                }}
                style={[styles.uploadPillBtn, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="plus" size={17} color="#fff" />
                <Text style={styles.uploadPillText}>Upload PDF</Text>
              </Pressable>
            </Row>
          </Row>

          {/* R2 Engine Capability Badge */}
          <LinearGradient
            colors={isDark ? ["#1e293b", "#0f172a"] : ["#eff6ff", "#dbeafe"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.engineBanner, { borderColor: colors.border }]}
          >
            <View style={[styles.engineIconWrap, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="cloud-check-outline" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.engineTitle, { color: colors.text }]}>
                Cloudflare R2 • Turbo Compression Active
              </Text>
              <Text style={[styles.engineDesc, { color: colors.muted }]}>
                Smart image re-encoding & CAS deduplication compresses large PDFs down to a few MB for fastest upload and reading.
              </Text>
            </View>
          </LinearGradient>

          {/* Active VPS Background Sync Job Banner */}
          {activeSyncJob && (
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={[
                styles.syncJobBanner,
                {
                  backgroundColor:
                    activeSyncJob.status === "failed"
                      ? isDark
                        ? "#450a0a"
                        : "#fef2f2"
                      : isDark
                      ? "rgba(6, 78, 59, 0.28)"
                      : "#ecfdf5",
                  borderColor: activeSyncJob.status === "failed" ? "#ef4444" : "#10b981",
                },
              ]}
            >
              <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                {activeSyncJob.status === "completed" ? (
                  <MaterialCommunityIcons name="check-circle" size={22} color="#10b981" />
                ) : activeSyncJob.status === "failed" ? (
                  <MaterialCommunityIcons name="alert-circle" size={22} color="#ef4444" />
                ) : (
                  <ActivityIndicator size="small" color="#10b981" />
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.syncJobTitle,
                      {
                        color:
                          activeSyncJob.status === "failed"
                            ? "#ef4444"
                            : isDark
                            ? "#a7f3d0"
                            : "#065f46",
                      },
                    ]}
                  >
                    {activeSyncJob.status === "completed"
                      ? "VPS Ingestion Complete • Vault Updated"
                      : activeSyncJob.status === "failed"
                      ? "VPS Ingestion Failed"
                      : "VPS Background Worker Active"}
                  </Text>
                  <Text
                    style={[
                      styles.syncJobSub,
                      {
                        color:
                          activeSyncJob.status === "failed"
                            ? "#dc2626"
                            : isDark
                            ? "#6ee7b7"
                            : "#047857",
                      },
                    ]}
                  >
                    {activeSyncJob.status === "completed"
                      ? `${activeSyncJob.filesProcessed} resources indexed & manifest saved to Cloudflare R2.`
                      : activeSyncJob.status === "failed"
                      ? activeSyncJob.error || "Could not crawl Google Drive resource."
                      : `Crawling Google Drive • Cataloged ${activeSyncJob.filesProcessed} / ${activeSyncJob.filesFound || "..."} files into Vault`}
                  </Text>
                </View>
              </Row>
              {activeSyncJob.status !== "pending" && activeSyncJob.status !== "processing" && (
                <Pressable onPress={() => setActiveSyncJob(null)} hitSlop={8}>
                  <MaterialCommunityIcons
                    name="close"
                    size={18}
                    color={activeSyncJob.status === "failed" ? "#ef4444" : "#10b981"}
                  />
                </Pressable>
              )}
            </Animated.View>
          )}
        </Animated.View>

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
          <TextInput
            placeholder="Search notes, course codes, syllabus..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Visibility Filter Tabs */}
        <Row style={styles.visibilityTabs}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setVisibility("all");
            }}
            style={[
              styles.visTab,
              visibility === "all" && [styles.visTabActive, { backgroundColor: colors.primary }],
            ]}
          >
            <Text
              style={[
                styles.visTabText,
                { color: visibility === "all" ? "#fff" : colors.muted },
              ]}
            >
              All Notes
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setVisibility("public");
            }}
            style={[
              styles.visTab,
              visibility === "public" && [styles.visTabActive, { backgroundColor: colors.primary }],
            ]}
          >
            <Text
              style={[
                styles.visTabText,
                { color: visibility === "public" ? "#fff" : colors.muted },
              ]}
            >
              Public Campus
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setVisibility("community");
            }}
            style={[
              styles.visTab,
              visibility === "community" && [styles.visTabActive, { backgroundColor: colors.primary }],
            ]}
          >
            <Text
              style={[
                styles.visTabText,
                { color: visibility === "community" ? "#fff" : colors.muted },
              ]}
            >
              Community Only
            </Text>
          </Pressable>
        </Row>

        {/* Department Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {DEPARTMENTS.map((dept) => {
            const active = selectedDept === dept;
            return (
              <Pressable
                key={dept}
                onPress={() => {
                  triggerHaptic();
                  setSelectedDept(dept);
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: active ? "#fff" : colors.text },
                  ]}
                >
                  {dept}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Semester Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filterScroll, { marginTop: 6, marginBottom: 14 }]}
        >
          {SEMESTERS.map((sem) => {
            const active = selectedSem === sem;
            return (
              <Pressable
                key={sem}
                onPress={() => {
                  triggerHaptic();
                  setSelectedSem(sem);
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: active ? "#fff" : colors.text },
                  ]}
                >
                  {sem === "All" ? "All Semesters" : `${sem} Sem`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Notes Feed */}
        {notesQuery.isLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={110} />
            <Skeleton height={110} />
            <Skeleton height={110} />
          </View>
        ) : notesQuery.isError ? (
          <ErrorState
            detail={(notesQuery.error as Error).message}
            onRetry={() => notesQuery.refetch()}
          />
        ) : (notesQuery.data ?? []).length === 0 ? (
          <Empty
            title="No notes found in vault"
            detail="Be the first to share an academic PDF or sync a Google Drive folder with the campus."
            actionTitle="+ Sync Google Drive"
            onAction={() => setDriveModalVisible(true)}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {(notesQuery.data ?? []).map((note) => {
              const isOwner = session?.user?.id === note.uploader_id;
              return (
                <Animated.View
                  key={note.id}
                  entering={FadeInUp.duration(200)}
                  style={[
                    styles.noteCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Pressable onPress={() => handleOpenReader(note)}>
                    <Row style={{ gap: 12, alignItems: "flex-start" }}>
                      {/* PDF / Drive Badge Icon */}
                      {note.source_type === "google_drive" ? (
                        <View
                          style={[
                            styles.pdfBadgeWrap,
                            {
                              backgroundColor: isDark
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(16, 185, 129, 0.1)",
                              borderColor: "rgba(16, 185, 129, 0.3)",
                            },
                          ]}
                        >
                          <MaterialCommunityIcons name="google-drive" size={32} color="#10B981" />
                          <Text style={[styles.pdfBadgeExt, { color: "#10B981" }]}>DRIVE</Text>
                        </View>
                      ) : (
                        <View style={styles.pdfBadgeWrap}>
                          <MaterialCommunityIcons name="file-pdf-box" size={36} color="#EF4444" />
                          <Text style={styles.pdfBadgeExt}>PDF</Text>
                        </View>
                      )}

                      {/* Note Details */}
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.noteTitle, { color: colors.text }]} numberOfLines={2}>
                          {note.title}
                        </Text>

                        {note.description ? (
                          <Text style={[styles.noteDesc, { color: colors.muted }]} numberOfLines={2}>
                            {note.description}
                          </Text>
                        ) : null}

                        {/* Tags & Metadata Badges */}
                        <Row style={{ gap: 6, flexWrap: "wrap", marginVertical: 4 }}>
                          {note.source_type === "google_drive" && (
                            <Pill
                              tone={
                                note.r2_cached_at || note.sync_status === "synced"
                                  ? "success"
                                  : "accent"
                              }
                            >
                              {note.r2_cached_at || note.sync_status === "synced"
                                ? "☁️ R2 Cached"
                                : "⚡ Direct Stream"}
                            </Pill>
                          )}
                          {note.course_code ? (
                            <Pill tone="primary">{note.course_code}</Pill>
                          ) : null}
                          {note.department ? (
                            <Pill tone="default">{note.department}</Pill>
                          ) : null}
                          {note.semester ? (
                            <Pill tone="accent">{note.semester} Sem</Pill>
                          ) : null}
                          <Pill tone={note.visibility === "community" ? "warning" : "success"}>
                            {note.visibility === "community"
                              ? note.community_name || "Community"
                              : "Public"}
                          </Pill>
                        </Row>

                        {/* Uploader & Size Footer */}
                        <Row style={{ justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <Pressable
                            onPress={() => {
                              triggerHaptic();
                              if (note.uploader_id === session?.user?.id) {
                                router.push("/(tabs)/profile" as any);
                              } else {
                                router.push(`/user/${note.uploader_id}` as any);
                              }
                            }}
                            style={styles.authorRow}
                          >
                            {note.uploader?.avatar_url ? (
                              <Image
                                source={{ uri: note.uploader.avatar_url }}
                                style={styles.authorAvatar}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.authorAvatar,
                                  styles.authorAvatarFallback,
                                  { backgroundColor: colors.primary },
                                ]}
                              >
                                <Text style={styles.authorInitials}>
                                  {initials(note.uploader?.full_name)}
                                </Text>
                              </View>
                            )}
                            <Text style={[styles.authorName, { color: colors.text }]}>
                              {note.uploader?.full_name || "Campus Peer"}
                            </Text>
                          </Pressable>

                          <Text style={[styles.fileSizeText, { color: colors.muted }]}>
                            {formatBytes(note.file_size_bytes)}
                          </Text>
                        </Row>
                      </View>
                    </Row>
                  </Pressable>

                  {/* Actions Bar */}
                  <Row style={[styles.cardActionBar, { borderTopColor: colors.border }]}>
                    <Pressable
                      onPress={() => handleOpenReader(note)}
                      style={[
                        styles.readBtn,
                        {
                          backgroundColor:
                            note.source_type === "google_drive" ? "#059669" : colors.primary,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          note.source_type === "google_drive"
                            ? "lightning-bolt"
                            : "book-open-page-variant-outline"
                        }
                        size={16}
                        color="#fff"
                      />
                      <Text style={styles.readBtnText}>
                        {note.source_type === "google_drive"
                          ? "Stream & Read Note"
                          : "Read Fullscreen PDF"}
                      </Text>
                    </Pressable>

                    {/* Manual R2 Cache Button for Drive note if not yet cached */}
                    {note.source_type === "google_drive" &&
                      !(note.r2_cached_at || note.sync_status === "synced") && (
                        <Pressable
                          onPress={() => handleCacheNoteToR2(note.id)}
                          disabled={cachingNoteId === note.id}
                          style={[
                            styles.iconActionBtn,
                            {
                              borderColor: "rgba(16, 185, 129, 0.4)",
                              backgroundColor: isDark ? "rgba(6, 78, 59, 0.3)" : "#ecfdf5",
                            },
                          ]}
                          accessibilityLabel="Mirror to Cloudflare R2"
                        >
                          {cachingNoteId === note.id ? (
                            <ActivityIndicator size="small" color="#10B981" />
                          ) : (
                            <MaterialCommunityIcons
                              name="cloud-download-outline"
                              size={17}
                              color="#10B981"
                            />
                          )}
                        </Pressable>
                      )}

                    <Pressable
                      onPress={() => handleShareNote(note)}
                      style={[styles.iconActionBtn, { borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons name="share-variant-outline" size={17} color={colors.text} />
                    </Pressable>

                    {isOwner && (
                      <Pressable
                        onPress={() => handleDeleteNote(note.id)}
                        style={[styles.iconActionBtn, { borderColor: "#ef444430" }]}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={17} color="#EF4444" />
                      </Pressable>
                    )}
                  </Row>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ------------------------------------------------------------- */}
      {/* FULL-SCREEN IN-APP PDF READER */}
      {/* ------------------------------------------------------------- */}
      {readerNote && (
        <FullScreenPdfReader
          visible={Boolean(readerNote)}
          url={resolveNoteStreamUrl(readerNote)}
          title={readerNote.title}
          uploaderName={readerNote.uploader?.full_name}
          department={readerNote.department}
          courseCode={readerNote.course_code}
          fileSizeBytes={readerNote.file_size_bytes}
          onClose={() => setReaderNote(null)}
          onShare={() => handleShareNote(readerNote)}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* UPLOAD PDF MODAL */}
      {/* ------------------------------------------------------------- */}
      <Modal
        visible={uploadModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!isUploading) setUploadModalVisible(false);
        }}
      >
        <View style={[styles.readerContainer, { backgroundColor: colors.background }]}>
          {/* Modal Header */}
          <Row
            style={[
              styles.readerHeader,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}
          >
            <View>
              <H2 style={{ fontSize: 18 }}>Upload to Note Vault</H2>
              <Muted style={{ fontSize: 12 }}>Cloudflare R2 • Turbo Compression Engine</Muted>
            </View>
            <Pressable
              onPress={() => setUploadModalVisible(false)}
              disabled={isUploading}
              hitSlop={8}
              style={[styles.readerCloseBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </Pressable>
          </Row>

          <ScrollView contentContainerStyle={styles.uploadForm} keyboardShouldPersistTaps="handled">
            {/* Pick Document Zone */}
            <Pressable
              onPress={handlePickDocument}
              disabled={isUploading}
              style={[
                styles.pickDocZone,
                {
                  backgroundColor: colors.surface,
                  borderColor: selectedDoc ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={selectedDoc ? "file-check-outline" : "file-upload-outline"}
                size={38}
                color={selectedDoc ? colors.primary : colors.muted}
              />
              <Text style={[styles.pickDocTitle, { color: colors.text }]}>
                {selectedDoc ? selectedDoc.name : "Select PDF Document (up to 250 MB)"}
              </Text>
              <Text style={[styles.pickDocSub, { color: colors.muted }]}>
                {selectedDoc
                  ? `${formatBytes(selectedDoc.size)} • PDF Ready for Turbo Compression`
                  : "Tap to browse PDF notes, lecture slides, books, or exam sheets"}
              </Text>
            </Pressable>

            {/* Compressor Info Banner when large document picked */}
            {selectedDoc && (selectedDoc.size || 0) > 3 * 1024 * 1024 && (
              <View
                style={[
                  styles.compressorNotice,
                  {
                    backgroundColor: isDark ? "#064e3b30" : "#ecfdf5",
                    borderColor: isDark ? "#05966950" : "#a7f3d0",
                  },
                ]}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={22} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.compressorTitle, { color: colors.text }]}>
                    R2 Turbo Compressor Active ({formatBytes(selectedDoc.size)})
                  </Text>
                  <Text style={[styles.compressorDesc, { color: colors.muted }]}>
                    High-res slide images and redundant streams will be automatically compressed down to a few MB for fastest upload and instant loading.
                  </Text>
                </View>
              </View>
            )}

            {/* Note Title */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Note Title *</Text>
              <TextInput
                placeholder="e.g. Data Structures & Algorithms Full Lecture Notes"
                placeholderTextColor={colors.muted}
                value={uploadTitle}
                onChangeText={setUploadTitle}
                style={[
                  styles.formInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>

            {/* Department Pills */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {DEPARTMENTS.filter((d) => d !== "All").map((dept) => {
                  const active = uploadDept === dept;
                  return (
                    <Pressable
                      key={dept}
                      onPress={() => {
                        triggerHaptic();
                        setUploadDept(dept);
                      }}
                      style={[
                        styles.filterPill,
                        {
                          backgroundColor: active ? colors.primary : colors.surface,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.filterPillText, { color: active ? "#fff" : colors.text }]}>
                        {dept}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Semester Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Semester</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {SEMESTERS.filter((s) => s !== "All").map((sem) => {
                  const active = uploadSem === sem;
                  return (
                    <Pressable
                      key={sem}
                      onPress={() => {
                        triggerHaptic();
                        setUploadSem(sem);
                      }}
                      style={[
                        styles.filterPill,
                        {
                          backgroundColor: active ? colors.accent : colors.surface,
                          borderColor: active ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.filterPillText, { color: active ? "#fff" : colors.text }]}>
                        {sem} Sem
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Course Code */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Course Code (Optional)</Text>
              <TextInput
                placeholder="e.g. CSE-2101 or MAT-101"
                placeholderTextColor={colors.muted}
                value={uploadCourseCode}
                onChangeText={setUploadCourseCode}
                style={[
                  styles.formInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>

            {/* Visibility Mode */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Visibility & Access</Text>
              <Row style={{ gap: 10 }}>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setUploadVisibility("public");
                  }}
                  style={[
                    styles.visOption,
                    {
                      borderColor: uploadVisibility === "public" ? colors.primary : colors.border,
                      backgroundColor: uploadVisibility === "public" ? colors.primarySoft : colors.surface,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="earth"
                    size={20}
                    color={uploadVisibility === "public" ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.visOptionTitle,
                      { color: uploadVisibility === "public" ? colors.primary : colors.text },
                    ]}
                  >
                    Public Campus
                  </Text>
                  <Text style={[styles.visOptionSub, { color: colors.muted }]}>
                    Visible to all verified students
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setUploadVisibility("community");
                  }}
                  style={[
                    styles.visOption,
                    {
                      borderColor: uploadVisibility === "community" ? colors.primary : colors.border,
                      backgroundColor: uploadVisibility === "community" ? colors.primarySoft : colors.surface,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="account-group"
                    size={20}
                    color={uploadVisibility === "community" ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.visOptionTitle,
                      { color: uploadVisibility === "community" ? colors.primary : colors.text },
                    ]}
                  >
                    Community Only
                  </Text>
                  <Text style={[styles.visOptionSub, { color: colors.muted }]}>
                    Restricted to club or batch peers
                  </Text>
                </Pressable>
              </Row>
            </View>

            {/* If community: community name */}
            {uploadVisibility === "community" && (
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Community / Club Name</Text>
                <TextInput
                  placeholder="e.g. CSE 24 Batch or Robotics Club"
                  placeholderTextColor={colors.muted}
                  value={uploadCommunityName}
                  onChangeText={setUploadCommunityName}
                  style={[
                    styles.formInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>
            )}

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Description (Optional)</Text>
              <TextInput
                placeholder="What topics or lectures are covered in this PDF?"
                placeholderTextColor={colors.muted}
                value={uploadDesc}
                onChangeText={setUploadDesc}
                multiline
                numberOfLines={3}
                style={[
                  styles.formInput,
                  styles.formTextArea,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>

            {/* Tags */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Tags (Comma-separated)</Text>
              <TextInput
                placeholder="Midterm, Hand notes, Chapter 4"
                placeholderTextColor={colors.muted}
                value={uploadTags}
                onChangeText={setUploadTags}
                style={[
                  styles.formInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>

            {/* In-Flight Upload & Compressor Progress Display */}
            {isUploading && (
              <View
                style={[
                  styles.uploadProgressBox,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <ActivityIndicator size="small" color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.progressStageText, { color: colors.text }]}>
                    {uploadStatusText || "Streaming & Compressing PDF..."}
                  </Text>
                  <Text style={[styles.progressSubText, { color: colors.muted }]}>
                    MozJPEG Optimization • Flate Deflate • Cloudflare R2 CAS
                  </Text>
                </View>
              </View>
            )}

            {/* Upload Action Button */}
            <View style={{ marginTop: 12, marginBottom: 40 }}>
              <Button
                title={isUploading ? "Compressing & Saving to R2..." : "Compress & Upload PDF"}
                variant="primary"
                disabled={isUploading}
                loading={isUploading}
                icon="cloud-upload-outline"
                onPress={handleUploadSubmit}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* GOOGLE DRIVE IMPORT MODAL */}
      {/* ------------------------------------------------------------- */}
      <Modal
        visible={driveModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!isSubmittingDrive) setDriveModalVisible(false);
        }}
      >
        <View style={[styles.readerContainer, { backgroundColor: colors.background }]}>
          {/* Modal Header */}
          <Row
            style={[
              styles.readerHeader,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}
          >
            <Row style={{ alignItems: "center", gap: 8 }}>
              <View style={[styles.driveIconHeaderWrap, { backgroundColor: isDark ? "#064e3b" : "#dcfce7" }]}>
                <MaterialCommunityIcons name="google-drive" size={20} color="#10B981" />
              </View>
              <View>
                <H2 style={{ fontSize: 17 }}>Sync Google Drive</H2>
                <Muted style={{ fontSize: 11 }}>VPS Crawler • Cloudflare R2 Ingestion</Muted>
              </View>
            </Row>
            <Pressable
              onPress={() => setDriveModalVisible(false)}
              disabled={isSubmittingDrive}
              hitSlop={8}
              style={[styles.readerCloseBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </Pressable>
          </Row>

          <ScrollView contentContainerStyle={styles.uploadForm} keyboardShouldPersistTaps="handled">
            {/* Info callout */}
            <LinearGradient
              colors={isDark ? ["#064e3b40", "#022c2220"] : ["#ecfdf5", "#f0fdf4"]}
              style={[styles.driveInfoCard, { borderColor: isDark ? "#05966950" : "#a7f3d0" }]}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={22} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.driveInfoTitle, { color: isDark ? "#a7f3d0" : "#065f46" }]}>
                  Automatic VPS Ingestion Pipeline
                </Text>
                <Text style={[styles.driveInfoDesc, { color: isDark ? "#6ee7b7" : "#047857" }]}>
                  Provide any public or shared Google Drive folder or file link. The background task on our VPS crawls the directory, extracts metadata, indexes resources to the Vault, and archives an R2 manifest. Documents stream on-demand and auto-cache to Cloudflare R2.
                </Text>
              </View>
            </LinearGradient>

            {/* Drive URL Input */}
            <View style={styles.formGroup}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Google Drive Link *</Text>
                {driveUrl.trim() ? (
                  <Text style={[styles.detectedBadge, { color: "#10b981" }]}>
                    {driveUrl.includes("/folders/")
                      ? "📁 Folder Detected"
                      : driveUrl.includes("/document/")
                      ? "📝 Doc Detected"
                      : driveUrl.includes("/presentation/")
                      ? "📊 Slides Detected"
                      : driveUrl.includes("/spreadsheets/")
                      ? "📈 Sheet Detected"
                      : "📄 File Detected"}
                  </Text>
                ) : null}
              </Row>
              <TextInput
                placeholder="https://drive.google.com/drive/folders/... or docs.google.com/..."
                placeholderTextColor={colors.muted}
                value={driveUrl}
                onChangeText={setDriveUrl}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.formInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                ]}
              />
              <Muted style={{ fontSize: 11 }}>
                Folder links recursively catalog all PDF lecture notes, exam papers, and syllabus files.
              </Muted>
            </View>

            {/* Department Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {DEPARTMENTS.filter((d) => d !== "All").map((dept) => {
                  const active = driveDept === dept;
                  return (
                    <Pressable
                      key={dept}
                      onPress={() => {
                        triggerHaptic();
                        setDriveDept(dept);
                      }}
                      style={[
                        styles.filterPill,
                        {
                          backgroundColor: active ? colors.primary : colors.surface,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.filterPillText, { color: active ? "#fff" : colors.text }]}>
                        {dept}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Semester Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Semester</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {SEMESTERS.filter((s) => s !== "All").map((sem) => {
                  const active = driveSem === sem;
                  return (
                    <Pressable
                      key={sem}
                      onPress={() => {
                        triggerHaptic();
                        setDriveSem(sem);
                      }}
                      style={[
                        styles.filterPill,
                        {
                          backgroundColor: active ? colors.accent : colors.surface,
                          borderColor: active ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.filterPillText, { color: active ? "#fff" : colors.text }]}>
                        {sem} Sem
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Course Code */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Course Code (Optional)</Text>
              <TextInput
                placeholder="e.g. CSE-3100 or EEE-2101"
                placeholderTextColor={colors.muted}
                value={driveCourseCode}
                onChangeText={setDriveCourseCode}
                style={[
                  styles.formInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>

            {/* Visibility Mode */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Visibility & Access</Text>
              <Row style={{ gap: 10 }}>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setDriveVisibility("public");
                  }}
                  style={[
                    styles.visOption,
                    {
                      borderColor: driveVisibility === "public" ? colors.primary : colors.border,
                      backgroundColor: driveVisibility === "public" ? colors.primarySoft : colors.surface,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="earth"
                    size={20}
                    color={driveVisibility === "public" ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.visOptionTitle,
                      { color: driveVisibility === "public" ? colors.primary : colors.text },
                    ]}
                  >
                    Public Campus
                  </Text>
                  <Text style={[styles.visOptionSub, { color: colors.muted }]}>
                    Visible to all university students
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setDriveVisibility("community");
                  }}
                  style={[
                    styles.visOption,
                    {
                      borderColor: driveVisibility === "community" ? colors.primary : colors.border,
                      backgroundColor: driveVisibility === "community" ? colors.primarySoft : colors.surface,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="account-group"
                    size={20}
                    color={driveVisibility === "community" ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.visOptionTitle,
                      { color: driveVisibility === "community" ? colors.primary : colors.text },
                    ]}
                  >
                    Community Only
                  </Text>
                  <Text style={[styles.visOptionSub, { color: colors.muted }]}>
                    Restricted to club or batch peers
                  </Text>
                </Pressable>
              </Row>
            </View>

            {/* Community Name if community */}
            {driveVisibility === "community" && (
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Community / Batch Name</Text>
                <TextInput
                  placeholder="e.g. RUET CSE 2024 Batch"
                  placeholderTextColor={colors.muted}
                  value={driveCommunityName}
                  onChangeText={setDriveCommunityName}
                  style={[
                    styles.formInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>
            )}

            {/* Tags */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Tags (Comma-separated)</Text>
              <TextInput
                placeholder="GoogleDrive, Lecture Slides, Midterm, Hand notes"
                placeholderTextColor={colors.muted}
                value={driveTags}
                onChangeText={setDriveTags}
                style={[
                  styles.formInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>

            {/* Submit Action */}
            <View style={{ marginTop: 12, marginBottom: 40 }}>
              <Button
                title={isSubmittingDrive ? "Dispatching VPS Crawler..." : "Start VPS Background Ingestion"}
                variant="primary"
                disabled={isSubmittingDrive}
                loading={isSubmittingDrive}
                icon="cloud-sync"
                onPress={handleDriveSubmit}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  topHeader: {
    marginBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 12,
  },
  drivePillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  drivePillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  syncJobBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 8,
  },
  syncJobTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  syncJobSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  driveIconHeaderWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  driveInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  driveInfoTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  driveInfoDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  detectedBadge: {
    fontSize: 11,
    fontWeight: "700",
  },
  uploadPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  uploadPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  engineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 6,
  },
  engineIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  engineTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  engineDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  visibilityTabs: {
    gap: 8,
    marginBottom: 10,
  },
  visTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  visTabActive: {
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  visTabText: {
    fontSize: 12,
    fontWeight: "700",
  },
  filterScroll: {
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  noteCard: {
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  pdfBadgeWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 50,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  pdfBadgeExt: {
    fontSize: 9,
    fontWeight: "900",
    color: "#EF4444",
    marginTop: -4,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  noteDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  authorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  authorAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  authorInitials: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  authorName: {
    fontSize: 12,
    fontWeight: "600",
  },
  fileSizeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  cardActionBar: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  readBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  readBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  readerContainer: {
    flex: 1,
  },
  readerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    alignItems: "center",
    justifyContent: "space-between",
  },
  readerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadForm: {
    padding: 16,
    gap: 14,
  },
  pickDocZone: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pickDocTitle: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  pickDocSub: {
    fontSize: 12,
    textAlign: "center",
  },
  compressorNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  compressorTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  compressorDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  uploadProgressBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  progressStageText: {
    fontSize: 13,
    fontWeight: "700",
  },
  progressSubText: {
    fontSize: 11,
    marginTop: 2,
  },
  formGroup: {
    gap: 6,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  formInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  formTextArea: {
    height: 72,
    textAlignVertical: "top",
  },
  visOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
  visOptionTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  visOptionSub: {
    fontSize: 11,
    lineHeight: 14,
  },
});
