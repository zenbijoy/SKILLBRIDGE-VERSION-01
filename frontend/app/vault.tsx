import React, { useState } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import {
  Button,
  Card,
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

  // Pick Document for Upload
  const handlePickDocument = async () => {
    try {
      triggerHaptic();
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];

      // Read base64
      let base64 = "";
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

  // Upload Mutation
  const handleUploadSubmit = async () => {
    if (!selectedDoc) {
      Alert.alert("Document Required", "Please select a PDF document first.");
      return;
    }
    if (!uploadTitle.trim()) {
      Alert.alert("Title Required", "Please enter a descriptive title for this note.");
      return;
    }
    if (!selectedDoc.base64) {
      Alert.alert("File Error", "Could not process PDF data. Please select the file again.");
      return;
    }

    try {
      triggerHaptic();
      setIsUploading(true);

      const parsedTags = uploadTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await api("/vault/upload", {
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
          communityName: uploadVisibility === "community" ? uploadCommunityName.trim() || "Campus Community" : undefined,
        }),
      });

      triggerHaptic();
      setUploadModalVisible(false);
      setSelectedDoc(null);
      setUploadTitle("");
      setUploadDesc("");
      setUploadCourseCode("");
      setUploadTags("");
      setUploadCommunityName("");
      await qc.invalidateQueries({ queryKey: ["vault-notes"] });
      Alert.alert("Upload Successful", "Your PDF has been optimized and saved in Cloudflare R2 Vault!");
    } catch (err: any) {
      Alert.alert("Upload Failed", err.message || "Could not complete PDF upload to Cloudflare R2.");
    } finally {
      setIsUploading(false);
    }
  };

  // Open In-App PDF Reader
  const handleOpenReader = async (note: VaultNote) => {
    triggerHaptic();
    setReaderNote(note);

    // Record view in backend
    try {
      void api(`/vault/${note.id}/view`, { method: "POST" });
    } catch {}
  };

  // Launch Fullscreen Native In-App Browser
  const handleLaunchInAppBrowser = async (url: string) => {
    triggerHaptic();
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        readerMode: true,
        toolbarColor: colors.surface,
      });
    } catch (err: any) {
      Alert.alert("Browser Error", err.message || "Could not open in-app browser.");
    }
  };

  // Share PDF
  const handleShareNote = async (note: VaultNote) => {
    triggerHaptic();
    try {
      await Share.share({
        title: note.title,
        message: `Read "${note.title}" on SkillBridge Note Vault: ${note.file_url}`,
        url: note.file_url,
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

            <Pressable
              onPress={() => {
                triggerHaptic();
                setUploadModalVisible(true);
              }}
              style={[styles.uploadPillBtn, { backgroundColor: colors.primary }]}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={styles.uploadPillText}>Upload PDF</Text>
            </Pressable>
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
                Cloudflare R2 • Storage Optimization Active
              </Text>
              <Text style={[styles.engineDesc, { color: colors.muted }]}>
                SHA-256 CAS deduplication reduces redundant storage. Read documents in-app seamlessly.
              </Text>
            </View>
          </LinearGradient>
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
            detail="Be the first to share an academic PDF or lecture slides with the campus."
            actionTitle="+ Upload First PDF"
            onAction={() => setUploadModalVisible(true)}
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
                  <Row style={{ gap: 12, alignItems: "flex-start" }}>
                    {/* PDF Badge Icon */}
                    <View style={styles.pdfBadgeWrap}>
                      <MaterialCommunityIcons name="file-pdf-box" size={36} color="#EF4444" />
                      <Text style={styles.pdfBadgeExt}>PDF</Text>
                    </View>

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

                  {/* Actions Bar */}
                  <Row style={[styles.cardActionBar, { borderTopColor: colors.border }]}>
                    <Pressable
                      onPress={() => handleOpenReader(note)}
                      style={[styles.readBtn, { backgroundColor: colors.primary }]}
                    >
                      <MaterialCommunityIcons name="book-open-page-variant-outline" size={16} color="#fff" />
                      <Text style={styles.readBtnText}>Read PDF</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleLaunchInAppBrowser(note.file_url)}
                      style={[styles.iconActionBtn, { borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons name="open-in-new" size={17} color={colors.text} />
                    </Pressable>

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
      {/* IN-APP PDF READER MODAL */}
      {/* ------------------------------------------------------------- */}
      <Modal
        visible={Boolean(readerNote)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReaderNote(null)}
      >
        <View style={[styles.readerContainer, { backgroundColor: colors.background }]}>
          {/* Reader Top Bar */}
          <Row
            style={[
              styles.readerHeader,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.readerTitle, { color: colors.text }]} numberOfLines={1}>
                {readerNote?.title}
              </Text>
              <Text style={[styles.readerMeta, { color: colors.muted }]} numberOfLines={1}>
                {[readerNote?.department, readerNote?.course_code, formatBytes(readerNote?.file_size_bytes)]
                  .filter(Boolean)
                  .join(" • ")}
              </Text>
            </View>

            <Row style={{ gap: 8, alignItems: "center" }}>
              <Pressable
                onPress={() => {
                  if (readerNote) handleShareNote(readerNote);
                }}
                hitSlop={8}
                style={[styles.readerIconBtn, { borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={() => {
                  if (readerNote) {
                    triggerHaptic();
                    void Clipboard.setStringAsync(readerNote.file_url);
                    Alert.alert("Link Copied", "PDF direct link copied to clipboard.");
                  }
                }}
                hitSlop={8}
                style={[styles.readerIconBtn, { borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="link-variant" size={18} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={() => setReaderNote(null)}
                hitSlop={8}
                style={[styles.readerCloseBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.text} />
              </Pressable>
            </Row>
          </Row>

          {/* Reader Main Display */}
          {readerNote && (
            <View style={{ flex: 1 }}>
              {Platform.OS === "web" ? (
                // Web In-App iframe
                <View style={{ flex: 1 }}>
                  {/* @ts-ignore - web iframe */}
                  <iframe
                    src={readerNote.file_url}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    title={readerNote.title}
                  />
                </View>
              ) : (
                // Mobile In-App Viewer Hub
                <ScrollView contentContainerStyle={styles.mobileReaderHub}>
                  <View
                    style={[
                      styles.hubCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <MaterialCommunityIcons name="file-pdf-box" size={68} color="#EF4444" />
                    <H2 style={{ textAlign: "center", marginTop: 8 }}>{readerNote.title}</H2>
                    {readerNote.description ? (
                      <Text style={[styles.hubDesc, { color: colors.muted }]}>
                        {readerNote.description}
                      </Text>
                    ) : null}

                    {/* Metadata Specs */}
                    <View
                      style={[
                        styles.hubSpecsTable,
                        { backgroundColor: isDark ? "#1e293b50" : "#f8fafc", borderColor: colors.border },
                      ]}
                    >
                      <Row style={styles.hubSpecRow}>
                        <Text style={[styles.hubSpecKey, { color: colors.muted }]}>Storage Provider</Text>
                        <Text style={[styles.hubSpecVal, { color: colors.primary }]}>Cloudflare R2</Text>
                      </Row>
                      <Row style={styles.hubSpecRow}>
                        <Text style={[styles.hubSpecKey, { color: colors.muted }]}>File Size</Text>
                        <Text style={[styles.hubSpecVal, { color: colors.text }]}>
                          {formatBytes(readerNote.file_size_bytes)}
                        </Text>
                      </Row>
                      <Row style={styles.hubSpecRow}>
                        <Text style={[styles.hubSpecKey, { color: colors.muted }]}>Department</Text>
                        <Text style={[styles.hubSpecVal, { color: colors.text }]}>
                          {readerNote.department || "General"}
                        </Text>
                      </Row>
                      <Row style={styles.hubSpecRow}>
                        <Text style={[styles.hubSpecKey, { color: colors.muted }]}>Semester</Text>
                        <Text style={[styles.hubSpecVal, { color: colors.text }]}>
                          {readerNote.semester || "All"}
                        </Text>
                      </Row>
                      <Row style={styles.hubSpecRow}>
                        <Text style={[styles.hubSpecKey, { color: colors.muted }]}>Visibility</Text>
                        <Text style={[styles.hubSpecVal, { color: colors.text }]}>
                          {readerNote.visibility === "community"
                            ? readerNote.community_name || "Community"
                            : "Public Campus"}
                        </Text>
                      </Row>
                    </View>

                    {/* Launch Native In-App Browser Reader */}
                    <View style={{ width: "100%", marginTop: 16 }}>
                      <Button
                        title="Launch Fullscreen Reader"
                        variant="primary"
                        icon="open-in-new"
                        onPress={() => handleLaunchInAppBrowser(readerNote.file_url)}
                      />
                    </View>

                    <View style={{ width: "100%", marginTop: 8 }}>
                      <Button
                        title="Share / Save PDF"
                        variant="secondary"
                        icon="share-variant-outline"
                        onPress={() => handleShareNote(readerNote)}
                      />
                    </View>
                  </View>
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </Modal>

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
              <Muted style={{ fontSize: 12 }}>Cloudflare R2 • Content-Addressable Storage</Muted>
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
                {selectedDoc ? selectedDoc.name : "Select PDF Document"}
              </Text>
              <Text style={[styles.pickDocSub, { color: colors.muted }]}>
                {selectedDoc
                  ? `${formatBytes(selectedDoc.size)} • PDF Ready`
                  : "Tap to browse PDF notes, lecture slides, or exam sheets"}
              </Text>
            </Pressable>

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

            {/* Upload Action Button */}
            <View style={{ marginTop: 12, marginBottom: 40 }}>
              <Button
                title={isUploading ? "Optimizing & Saving to R2..." : "Upload PDF to Vault"}
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
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  pdfBadgeWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 54,
    borderRadius: radius.md,
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
  readerTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  readerMeta: {
    fontSize: 12,
  },
  readerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  readerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileReaderHub: {
    padding: 20,
    alignItems: "center",
  },
  hubCard: {
    width: "100%",
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: "center",
  },
  hubDesc: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  hubSpecsTable: {
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
    gap: 8,
  },
  hubSpecRow: {
    justifyContent: "space-between",
  },
  hubSpecKey: {
    fontSize: 12,
  },
  hubSpecVal: {
    fontSize: 12,
    fontWeight: "700",
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
