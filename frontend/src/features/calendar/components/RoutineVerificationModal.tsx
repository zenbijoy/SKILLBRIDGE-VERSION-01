import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  Switch,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import type { AcademicRoutine, RoutineEntry, DayOfWeek } from "../types";
import { useTheme, radius } from "@/theme";
import { formatTime12h } from "../utils/dateUtils";
import { DAYS_OF_WEEK } from "../constants";
import { triggerHaptic } from "@/components/ui";
import { ManualClassModal } from "./ManualClassModal";
import { FullScreenPdfReader } from "@/components/FullScreenPdfReader";

export interface RoutineVerificationModalProps {
  visible: boolean;
  routine: AcademicRoutine | null;
  uploadedFile?: {
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
    base64?: string;
  } | null;
  extractionMeta?: {
    matchedSection?: string;
    availableSections?: string[];
    routineTitle?: string;
    conflicts?: any[];
    hasAmbiguity?: boolean;
    overallConfidence?: string;
    source?: string;
    totalDetected?: number;
    notes?: string;
  } | null;
  onClose: () => void;
  onActivated: (activatedRoutine: AcademicRoutine) => void;
}

// RUET CSE 2-2 Curriculum Default Timetable Template
const RUET_CSE_2_2_TEMPLATE: RoutineEntry[] = [
  { course_code: "CSE 2201", courseTitle: "Algorithms", course_title: "Algorithms", day_of_week: "Sunday", day: "Sunday", start_time: "08:00", startTime: "08:00", end_time: "08:50", endTime: "08:50", room: "CSE 301", instructor: "SA", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2203", courseTitle: "Object Oriented Programming", course_title: "Object Oriented Programming", day_of_week: "Sunday", day: "Sunday", start_time: "08:50", startTime: "08:50", end_time: "09:40", endTime: "09:40", room: "CSE 301", instructor: "MIT", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "MATH 2213", courseTitle: "Complex Variables, Fourier Analysis & Statistics", course_title: "Complex Variables, Fourier Analysis & Statistics", day_of_week: "Sunday", day: "Sunday", start_time: "09:40", startTime: "09:40", end_time: "10:30", endTime: "10:30", room: "CSE 301", instructor: "Math Dept", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2202", courseTitle: "Algorithms Sessional (Lab)", course_title: "Algorithms Sessional (Lab)", day_of_week: "Sunday", day: "Sunday", start_time: "14:30", startTime: "14:30", end_time: "17:00", endTime: "17:00", room: "Alg. & Computational Lab", instructor: "SA / SZM", type: "LAB", confidence: "high", is_confirmed: true },
  
  { course_code: "CSE 2205", courseTitle: "Computer Architecture", course_title: "Computer Architecture", day_of_week: "Monday", day: "Monday", start_time: "08:00", startTime: "08:00", end_time: "08:50", endTime: "08:50", room: "CSE 301", instructor: "EKH", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "HUM 2213", courseTitle: "Government & Sociology", course_title: "Government & Sociology", day_of_week: "Monday", day: "Monday", start_time: "08:50", startTime: "08:50", end_time: "09:40", endTime: "09:40", room: "CSE 301", instructor: "Hum Dept", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2201", courseTitle: "Algorithms", course_title: "Algorithms", day_of_week: "Monday", day: "Monday", start_time: "09:40", startTime: "09:40", end_time: "10:30", endTime: "10:30", room: "CSE 301", instructor: "SA", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2204", courseTitle: "Object Oriented Programming Sessional (Lab)", course_title: "Object Oriented Programming Sessional (Lab)", day_of_week: "Monday", day: "Monday", start_time: "14:30", startTime: "14:30", end_time: "17:00", endTime: "17:00", room: "Software Lab", instructor: "MIT / MRK", type: "LAB", confidence: "high", is_confirmed: true },

  { course_code: "MATH 2213", courseTitle: "Complex Variables, Fourier Analysis & Statistics", course_title: "Complex Variables, Fourier Analysis & Statistics", day_of_week: "Tuesday", day: "Tuesday", start_time: "08:00", startTime: "08:00", end_time: "08:50", endTime: "08:50", room: "CSE 301", instructor: "Math Dept", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2203", courseTitle: "Object Oriented Programming", course_title: "Object Oriented Programming", day_of_week: "Tuesday", day: "Tuesday", start_time: "08:50", startTime: "08:50", end_time: "09:40", endTime: "09:40", room: "CSE 301", instructor: "MIT", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2205", courseTitle: "Computer Architecture", course_title: "Computer Architecture", day_of_week: "Tuesday", day: "Tuesday", start_time: "09:40", startTime: "09:40", end_time: "10:30", endTime: "10:30", room: "CSE 301", instructor: "EKH", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2206", courseTitle: "Computer Architecture Sessional (Lab)", course_title: "Computer Architecture Sessional (Lab)", day_of_week: "Tuesday", day: "Tuesday", start_time: "14:30", startTime: "14:30", end_time: "17:00", endTime: "17:00", room: "Hardware Lab", instructor: "EKH / JR", type: "LAB", confidence: "high", is_confirmed: true },

  { course_code: "HUM 2213", courseTitle: "Government & Sociology", course_title: "Government & Sociology", day_of_week: "Wednesday", day: "Wednesday", start_time: "08:00", startTime: "08:00", end_time: "08:50", endTime: "08:50", room: "CSE 301", instructor: "Hum Dept", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "MATH 2213", courseTitle: "Complex Variables, Fourier Analysis & Statistics", course_title: "Complex Variables, Fourier Analysis & Statistics", day_of_week: "Wednesday", day: "Wednesday", start_time: "08:50", startTime: "08:50", end_time: "09:40", endTime: "09:40", room: "CSE 301", instructor: "Math Dept", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2201", courseTitle: "Algorithms", course_title: "Algorithms", day_of_week: "Wednesday", day: "Wednesday", start_time: "09:40", startTime: "09:40", end_time: "10:30", endTime: "10:30", room: "CSE 301", instructor: "SA", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2200", courseTitle: "Software Development Project I", course_title: "Software Development Project I", day_of_week: "Wednesday", day: "Wednesday", start_time: "14:30", startTime: "14:30", end_time: "17:00", endTime: "17:00", room: "Software Lab", instructor: "CSE Faculty", type: "LAB", confidence: "high", is_confirmed: true },

  { course_code: "CSE 2203", courseTitle: "Object Oriented Programming", course_title: "Object Oriented Programming", day_of_week: "Thursday", day: "Thursday", start_time: "08:00", startTime: "08:00", end_time: "08:50", endTime: "08:50", room: "CSE 301", instructor: "MIT", type: "CLASS", confidence: "high", is_confirmed: true },
  { course_code: "CSE 2205", courseTitle: "Computer Architecture", course_title: "Computer Architecture", day_of_week: "Thursday", day: "Thursday", start_time: "08:50", startTime: "08:50", end_time: "09:40", endTime: "09:40", room: "CSE 301", instructor: "EKH", type: "CLASS", confidence: "high", is_confirmed: true },
];

export function RoutineVerificationModal({
  visible,
  routine,
  uploadedFile,
  extractionMeta,
  onClose,
  onActivated,
}: RoutineVerificationModalProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLargeScreen = windowWidth >= 900;

  // View modes: "compare" (Side-by-side or split), "routine" (cards only), "document" (PDF only)
  const [viewMode, setViewMode] = useState<"compare" | "routine" | "document">(
    isLargeScreen ? "compare" : "routine"
  );

  // Editable entries state
  const [entries, setEntries] = useState<RoutineEntry[]>(routine?.entries ?? []);
  const [selectedDay, setSelectedDay] = useState<string>("All");
  const [verifiedEntryIds, setVerifiedEntryIds] = useState<Set<string>>(new Set());

  // PDF Viewer controls
  const [currentPage, setCurrentPage] = useState<number>(1);
  const totalDocPages = 3; // RUET routines are typically 3 pages
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showFullScreenReader, setShowFullScreenReader] = useState<boolean>(false);

  // Section switcher & multi-section management
  const availableSections = useMemo(() => {
    const list =
      extractionMeta?.availableSections ||
      routine?.raw_metadata?.availableSections ||
      [];
    return Array.from(new Set(list)).filter(Boolean);
  }, [extractionMeta, routine]);

  const [currentSection, setCurrentSection] = useState<string>(
    extractionMeta?.matchedSection ||
      routine?.raw_metadata?.matchedSection ||
      routine?.academic_group ||
      ""
  );
  const [isSwitchingSection, setIsSwitchingSection] = useState<boolean>(false);

  // Verification & Activation state
  const [isVerifiedChecked, setIsVerifiedChecked] = useState(false);
  const [shareWithClass, setShareWithClass] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  // Manual class editor modal state
  const [editingEntry, setEditingEntry] = useState<{
    entry: RoutineEntry | null;
    index: number;
    isOpen: boolean;
  }>({
    entry: null,
    index: -1,
    isOpen: false,
  });

  // Sync entries on routine change
  useEffect(() => {
    if (routine?.entries && routine.entries.length > 0) {
      setEntries(routine.entries);
    } else if ((!routine?.entries || routine.entries.length === 0) && entries.length === 0) {
      // Auto-prepopulate template for RUET CSE 2-2 if empty
      const isCse22 = (routine?.semester || "").includes("2-2") || (routine?.semester || "").toLowerCase().includes("even");
      if (isCse22) {
        setEntries(RUET_CSE_2_2_TEMPLATE);
      }
    }
  }, [routine]);

  // Adjust view mode if screen size changes
  useEffect(() => {
    if (isLargeScreen) {
      setViewMode("compare");
    }
  }, [isLargeScreen]);

  // Filtered and grouped classes (declared before any early returns to satisfy React Hook rules)
  const displayedEntries = useMemo(() => {
    if (selectedDay === "All") return entries;
    return entries.filter((e) => (e.day_of_week || e.day) === selectedDay);
  }, [entries, selectedDay]);

  const entriesByDay = useMemo(() => {
    return DAYS_OF_WEEK.map((day) => ({
      day,
      items: entries
        .map((entry, index) => ({ entry, index }))
        .filter((item) => (item.entry.day_of_week || item.entry.day) === day)
        .sort((a, b) => {
          const tA = a.entry.start_time || a.entry.startTime || "00:00";
          const tB = b.entry.start_time || b.entry.startTime || "00:00";
          return tA.localeCompare(tB);
        }),
    })).filter((group) => (selectedDay === "All" ? group.items.length > 0 : group.day === selectedDay));
  }, [entries, selectedDay]);

  // Construct PDF/document URI for viewer
  const fileDataUrl = useMemo(() => {
    if (uploadedFile?.base64) {
      const mime = uploadedFile.mimeType || "application/pdf";
      return `data:${mime};base64,${uploadedFile.base64}`;
    }
    return uploadedFile?.uri || "";
  }, [uploadedFile]);

  if (!routine) return null;

  const conflicts = routine.raw_metadata?.conflicts ?? extractionMeta?.conflicts ?? [];
  const hasAmbiguity =
    routine.raw_metadata?.hasAmbiguity ||
    extractionMeta?.hasAmbiguity ||
    entries.some((e) => e.confidence === "ambiguous" || e.confidence === "low");

  // Day to page mapping for RUET multi-page booklet
  const handleSelectDay = (day: string) => {
    triggerHaptic();
    setSelectedDay(day);
    if (day === "Saturday" || day === "Sunday") {
      setCurrentPage(1);
    } else if (day === "Monday" || day === "Tuesday") {
      setCurrentPage(2);
    } else if (day === "Wednesday" || day === "Thursday" || day === "Friday") {
      setCurrentPage(3);
    }
  };

  // Switch section dynamically using existing uploaded file
  const handleSwitchSection = async (targetSec: string) => {
    if (targetSec === currentSection || isSwitchingSection) return;
    triggerHaptic();
    setIsSwitchingSection(true);

    try {
      const resp = await api<{
        routine: AcademicRoutine;
        extraction: any;
      }>("/calendar/routine/extract", {
        method: "POST",
        body: JSON.stringify({
          fileBase64: uploadedFile?.base64,
          fileMimeType: uploadedFile?.mimeType || "application/pdf",
          fileName: uploadedFile?.name,
          selectedSection: targetSec,
          department: routine.department,
          semester: routine.semester,
          section: routine.section,
          university: routine.university,
        }),
      });

      if (resp?.routine?.entries && resp.routine.entries.length > 0) {
        setEntries(resp.routine.entries);
        setCurrentSection(targetSec);
        setVerifiedEntryIds(new Set());
        Alert.alert(
          "Section Switched! 🎯",
          `Extracted ${resp.routine.entries.length} classes for ${targetSec} from the uploaded routine.`
        );
      } else {
        throw new Error(`Could not find classes for section: ${targetSec}`);
      }
    } catch (err: any) {
      Alert.alert("Section Switch", err?.message || "Could not switch section timetable.");
    } finally {
      setIsSwitchingSection(false);
    }
  };

  // Toggle single item verification
  const toggleItemVerified = (entryKey: string) => {
    triggerHaptic();
    setVerifiedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryKey)) {
        next.delete(entryKey);
      } else {
        next.add(entryKey);
      }
      return next;
    });
  };

  // Manual class actions
  const handleEditEntry = (entry: RoutineEntry, index: number) => {
    triggerHaptic();
    setEditingEntry({ entry, index, isOpen: true });
  };

  const handleAddNewClass = () => {
    triggerHaptic();
    setEditingEntry({ entry: null, index: -1, isOpen: true });
  };

  const handleAutoFillRuetTemplate = () => {
    triggerHaptic();
    setEntries(RUET_CSE_2_2_TEMPLATE);
    Alert.alert(
      "Curriculum Loaded! 📋",
      "Loaded 18 standard class & lab sessions for RUET CSE 2-2. You can verify and adjust them against your routine document."
    );
  };

  const formatEntriesForPayload = (rawEntries: RoutineEntry[]) => {
    return rawEntries.map((e) => {
      const code = e.course_code || e.courseCode || "CSE";
      const title = e.course_title || e.courseTitle || code;
      const day = e.day_of_week || e.day || "Sunday";
      const start = e.start_time || e.startTime || "08:00";
      const end = e.end_time || e.endTime || "08:50";
      const grp = e.group_name || e.groupName || null;

      return {
        id: e.id,
        course_code: code,
        courseCode: code,
        course_title: title,
        courseTitle: title,
        day_of_week: day,
        day: day,
        start_time: start,
        startTime: start,
        end_time: end,
        endTime: end,
        room: e.room || null,
        instructor: e.instructor || null,
        type: e.type || "CLASS",
        group_name: grp,
        groupName: grp,
        confidence: e.confidence || "high",
        warnings: e.warnings || [],
        is_confirmed: true,
      };
    });
  };

  const handleSaveEditedEntry = async (saved: RoutineEntry) => {
    const nextEntries = [...entries];
    if (editingEntry.index >= 0) {
      nextEntries[editingEntry.index] = {
        ...saved,
        confidence: "high",
        warnings: [],
      };
    } else {
      nextEntries.push({
        ...saved,
        confidence: "high",
      });
    }
    setEntries(nextEntries);
    setEditingEntry({ entry: null, index: -1, isOpen: false });

    // Sync draft in background
    try {
      await api(`/calendar/routines/${routine.id}`, {
        method: "PUT",
        body: JSON.stringify({
          entries: formatEntriesForPayload(nextEntries),
          academic_group: currentSection || routine.academic_group,
          academicGroup: currentSection || routine.academic_group,
          title: routine.title,
        }),
      });
    } catch (e) {
      console.warn("Could not sync edit draft", e);
    }
  };

  const handleDeleteEntry = async (index: number) => {
    triggerHaptic();
    const nextEntries = entries.filter((_, idx) => idx !== index);
    setEntries(nextEntries);

    try {
      await api(`/calendar/routines/${routine.id}`, {
        method: "PUT",
        body: JSON.stringify({
          entries: formatEntriesForPayload(nextEntries),
          academic_group: currentSection || routine.academic_group,
          academicGroup: currentSection || routine.academic_group,
          title: routine.title,
        }),
      });
    } catch (e) {
      console.warn("Could not sync delete draft", e);
    }
  };

  // Confirm and activate
  const handleConfirmAndActivate = async () => {
    if (!isVerifiedChecked) {
      Alert.alert(
        "Verification Required",
        "Please check 'I have cross-checked this timetable with the PDF' before activating."
      );
      return;
    }

    if (entries.length === 0) {
      Alert.alert("No Classes", "Your routine has no classes. Please tap 'Auto-Fill RUET Classes' or add at least one class.");
      return;
    }

    triggerHaptic();
    setIsActivating(true);

    try {
      const payloadEntries = formatEntriesForPayload(entries);

      // 1. Save all edited entries first
      await api(`/calendar/routines/${routine.id}`, {
        method: "PUT",
        body: JSON.stringify({
          entries: payloadEntries,
          academic_group: currentSection || routine.academic_group,
          academicGroup: currentSection || routine.academic_group,
          title: routine.title,
        }),
      });

      // 2. Activate routine
      const activateResp = await api<{
        success: boolean;
        routine: AcademicRoutine;
      }>(`/calendar/routines/${routine.id}/activate`, {
        method: "POST",
      });

      // 3. Share with class if opted
      if (shareWithClass) {
        try {
          await api(`/calendar/routines/${routine.id}/share`, {
            method: "POST",
            body: JSON.stringify({
              is_public: true,
              isPublic: true,
            }),
          });
        } catch (shareErr) {
          console.warn("Routine share error (non-fatal):", shareErr);
        }
      }

      setIsActivating(false);
      Alert.alert(
        "Routine Activated! 🎉",
        "Your academic timetable is active. SkillBridge will keep your classes, labs, and reminders synced."
      );
      onActivated(
        activateResp?.routine || {
          ...routine,
          is_active: true,
          verification_status: "user_verified",
        }
      );
    } catch (error: any) {
      setIsActivating(false);
      Alert.alert("Activation Error", error.message || "Failed to activate routine.");
    }
  };

  const isPdf =
    uploadedFile?.mimeType?.includes("pdf") ||
    uploadedFile?.name?.toLowerCase().endsWith(".pdf") ||
    fileDataUrl.includes("application/pdf");

  // Render Left Column / Document Pane
  const renderDocumentViewer = () => {
    return (
      <View
        style={[
          styles.docPane,
          {
            backgroundColor: isDark ? "#0F172A" : "#F1F5F9",
            borderColor: isDark ? colors.border : "#CBD5E1",
          },
        ]}
      >
        {/* Document Toolbar */}
        <View
          style={[
            styles.docToolbar,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderBottomColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          <View style={styles.docInfoWrap}>
            <View
              style={[
                styles.docIconBadge,
                { backgroundColor: isPdf ? "#FEE2E2" : "#E0E7FF" },
              ]}
            >
              <MaterialCommunityIcons
                name={isPdf ? "file-pdf-box" : "image"}
                size={18}
                color={isPdf ? "#DC2626" : "#4F46E5"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.docNameText, { color: colors.text }]}
                numberOfLines={1}
              >
                {uploadedFile?.name || "Original Routine PDF"}
              </Text>
              <Text style={[styles.docSubText, { color: colors.muted }]}>
                {isPdf ? "Official PDF Document" : "Image Routine"} • Page {currentPage} of {totalDocPages}
              </Text>
            </View>
          </View>

          {/* Page Controls & Fullscreen Action */}
          <View style={styles.pageControlsWrap}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                setCurrentPage((p) => Math.max(1, p - 1));
              }}
              disabled={currentPage <= 1}
              style={[
                styles.pageBtn,
                { opacity: currentPage <= 1 ? 0.4 : 1, backgroundColor: isDark ? colors.bg : "#F8FAFC" },
              ]}
            >
              <MaterialCommunityIcons name="chevron-left" size={18} color={colors.text} />
            </Pressable>

            <View style={styles.pageChip}>
              <Text style={[styles.pageChipText, { color: colors.text }]}>
                {currentPage} / {totalDocPages}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                triggerHaptic();
                setCurrentPage((p) => Math.min(totalDocPages, p + 1));
              }}
              disabled={currentPage >= totalDocPages}
              style={[
                styles.pageBtn,
                { opacity: currentPage >= totalDocPages ? 0.4 : 1, backgroundColor: isDark ? colors.bg : "#F8FAFC" },
              ]}
            >
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.text} />
            </Pressable>

            {fileDataUrl ? (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setShowFullScreenReader(true);
                }}
                style={[styles.zoomBtn, { backgroundColor: colors.primarySoft }]}
              >
                <MaterialCommunityIcons name="fullscreen" size={18} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Quick Page Jump Pills */}
        <View
          style={[
            styles.pagePillsRow,
            {
              backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
              borderBottomColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          <Pressable
            onPress={() => {
              triggerHaptic();
              setCurrentPage(1);
            }}
            style={[
              styles.quickPagePill,
              currentPage === 1 && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.quickPagePillText,
                { color: currentPage === 1 ? "#FFFFFF" : colors.muted },
              ]}
            >
              Page 1: Sat & Sun
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setCurrentPage(2);
            }}
            style={[
              styles.quickPagePill,
              currentPage === 2 && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.quickPagePillText,
                { color: currentPage === 2 ? "#FFFFFF" : colors.muted },
              ]}
            >
              Page 2: Mon & Tue
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setCurrentPage(3);
            }}
            style={[
              styles.quickPagePill,
              currentPage === 3 && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.quickPagePillText,
                { color: currentPage === 3 ? "#FFFFFF" : colors.muted },
              ]}
            >
              Page 3: Wed & Teachers
            </Text>
          </Pressable>
        </View>

        {/* Document Display Area */}
        <View style={styles.docCanvasWrap}>
          {fileDataUrl ? (
            Platform.OS === "web" ? (
              // Browser-Native Iframe/Object PDF & Image Renderer
              React.createElement("iframe", {
                src: `${fileDataUrl}#page=${currentPage}&zoom=${zoomLevel}`,
                style: {
                  width: "100%",
                  height: "100%",
                  border: "none",
                  backgroundColor: "#FFFFFF",
                },
                title: "Uploaded Routine Document",
              })
            ) : (
              // Native PDF Preview Card with 1-click Reader Button
              <View style={styles.nativeDocBanner}>
                <View style={[styles.pdfIconWrap, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="file-pdf-box" size={52} color={colors.primary} />
                </View>
                <Text style={[styles.nativeDocTitle, { color: colors.text }]}>
                  {uploadedFile?.name || "Uploaded Routine PDF"}
                </Text>
                <Text style={[styles.nativeDocSub, { color: colors.muted }]}>
                  Page {currentPage} of {totalDocPages} • Original document ready for cross-checking
                </Text>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setShowFullScreenReader(true);
                  }}
                  style={[styles.openViewerBtn, { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons name="magnify-plus-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.openViewerBtnText}>Open Interactive PDF Viewer</Text>
                </Pressable>
              </View>
            )
          ) : (
            <View style={styles.emptyDocWrap}>
              <MaterialCommunityIcons name="file-search-outline" size={44} color={colors.muted} />
              <Text style={[styles.emptyDocTitle, { color: colors.text }]}>
                Routine File Uploaded
              </Text>
              <Text style={[styles.emptyDocSub, { color: colors.muted }]}>
                Use the cards on the right to verify, edit, and activate your semester classes.
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Render Right Column / Routine Studio Pane
  const renderRoutineStudio = () => {
    return (
      <View
        style={[
          styles.studioPane,
          {
            backgroundColor: isDark ? colors.bg : "#F8FAFC",
          },
        ]}
      >
        {/* Subheader with Section Switcher & Status */}
        <View
          style={[
            styles.studioHeader,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderBottomColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          <View style={styles.sectionSelectWrap}>
            <View style={styles.sectionLabelRow}>
              <MaterialCommunityIcons name="school-outline" size={16} color={colors.primary} />
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                Target Timetable:
              </Text>
              <Text style={[styles.sectionActiveBadge, { color: colors.primary }]}>
                {currentSection || routine.academic_group || "CSE 2-2 Sec A"}
              </Text>
            </View>

            {/* Multi-Section Chips if Available */}
            {availableSections.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sectionChipsScroll}
              >
                {availableSections.map((secName) => {
                  const isActive = secName === currentSection;
                  return (
                    <Pressable
                      key={secName}
                      onPress={() => handleSwitchSection(secName)}
                      disabled={isSwitchingSection}
                      style={[
                        styles.sectionChip,
                        isActive && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                        !isActive && {
                          backgroundColor: isDark ? colors.bg : "#F1F5F9",
                          borderColor: isDark ? colors.border : "#E2E8F0",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sectionChipText,
                          { color: isActive ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {secName}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Quick Metrics & Actions */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={[styles.metricNumber, { color: colors.primary }]}>
                {entries.length}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>Classes</Text>
            </View>

            <View style={styles.metricItem}>
              <Text style={[styles.metricNumber, { color: "#10B981" }]}>
                {verifiedEntryIds.size}/{entries.length}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>Verified</Text>
            </View>

            <Pressable
              onPress={handleAddNewClass}
              style={[styles.addBtn, { backgroundColor: colors.primarySoft }]}
            >
              <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
              <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Class</Text>
            </Pressable>
          </View>
        </View>

        {/* Ambiguity or Conflict Alert */}
        {hasAmbiguity || conflicts.length > 0 ? (
          <View
            style={[
              styles.alertBanner,
              {
                backgroundColor: isDark ? "#451A03" : "#FEF3C7",
                borderColor: isDark ? "#78350F" : "#FDE68A",
              },
            ]}
          >
            <MaterialCommunityIcons name="alert-outline" size={20} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, { color: "#92400E" }]}>
                Cross-Verification Recommended
              </Text>
              <Text style={[styles.alertText, { color: "#B45309" }]}>
                Verify each period against the PDF. Tap [Edit] on any card to update rooms or instructors.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Day Filter Pills */}
        <View
          style={[
            styles.dayFilterRow,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderBottomColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          {["All", ...DAYS_OF_WEEK].map((d) => {
            const isDayActive = selectedDay === d;
            const count = d === "All" ? entries.length : entries.filter((e) => (e.day_of_week || e.day) === d).length;

            return (
              <Pressable
                key={d}
                onPress={() => handleSelectDay(d)}
                style={[
                  styles.dayFilterPill,
                  isDayActive && { backgroundColor: colors.primary },
                  !isDayActive && { backgroundColor: isDark ? colors.bg : "#F1F5F9" },
                ]}
              >
                <Text
                  style={[
                    styles.dayFilterText,
                    { color: isDayActive ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {d === "All" ? "All" : d.slice(0, 3)} {count > 0 ? `(${count})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Class Cards List */}
        <ScrollView
          style={styles.cardsScroll}
          contentContainerStyle={{ paddingBottom: 160 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {isSwitchingSection ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.text }]}>
                Re-extracting timetable for {currentSection}...
              </Text>
            </View>
          ) : displayedEntries.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {entries.length === 0 ? "No classes detected yet" : `No classes scheduled for ${selectedDay}`}
              </Text>
              <Text style={[styles.emptySub, { color: colors.muted }]}>
                {entries.length === 0
                  ? "AI could not parse table cells from this document layout. You can instantly auto-fill RUET CSE classes or add your own."
                  : "Tap [Add Class] if your timetable contains a session for this day."}
              </Text>

              {entries.length === 0 ? (
                <View style={styles.emptyActionsRow}>
                  <Pressable
                    onPress={handleAutoFillRuetTemplate}
                    style={[styles.autoFillBtn, { backgroundColor: colors.primary }]}
                  >
                    <MaterialCommunityIcons name="lightning-bolt" size={18} color="#FFFFFF" />
                    <Text style={styles.autoFillBtnText}>Auto-Fill RUET CSE 2-2 Classes</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleAddNewClass}
                    style={[styles.manualAddBtn, { borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
                    <Text style={[styles.manualAddBtnText, { color: colors.text }]}>Add Manually</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            entriesByDay.map((group) => (
              <View key={group.day} style={styles.dayGroup}>
                <View style={styles.dayGroupTitleRow}>
                  <Text style={[styles.dayGroupTitle, { color: colors.primary }]}>
                    {group.day}
                  </Text>
                  <Text style={[styles.dayGroupBadge, { color: colors.muted }]}>
                    {group.items.length} {group.items.length === 1 ? "class" : "classes"}
                  </Text>
                </View>

                {group.items.map(({ entry, index }) => {
                  const code = entry.course_code || entry.courseCode || "Course";
                  const title = entry.course_title || entry.courseTitle || code;
                  const day = entry.day_of_week || entry.day || "Sunday";
                  const startTime = entry.start_time || entry.startTime || "08:00";
                  const endTime = entry.end_time || entry.endTime || "08:50";
                  const entryKey = entry.id || `${code}_${day}_${startTime}`;
                  const isVerified = verifiedEntryIds.has(entryKey);
                  const isLab = entry.type === "LAB" || code.endsWith("2") || code.endsWith("4") || code.endsWith("6") || code.endsWith("0");
                  const isAmbiguous =
                    entry.confidence === "ambiguous" ||
                    entry.confidence === "low" ||
                    (entry.warnings && entry.warnings.length > 0);

                  return (
                    <View
                      key={`${code}-${index}`}
                      style={[
                        styles.classCard,
                        {
                          backgroundColor: isDark ? colors.surface : "#FFFFFF",
                          borderColor: isVerified
                            ? "#10B981"
                            : isAmbiguous
                            ? "#F59E0B"
                            : isDark
                            ? colors.border
                            : "#E2E8F0",
                          borderLeftWidth: 4,
                          borderLeftColor: isVerified
                            ? "#10B981"
                            : isLab
                            ? "#8B5CF6"
                            : colors.primary,
                        },
                      ]}
                    >
                      {/* Card Header: Code, Title & Type */}
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.codeRow}>
                            <Text style={[styles.courseCode, { color: colors.text }]}>
                              {code}
                            </Text>
                            <View
                              style={[
                                styles.typeBadge,
                                {
                                  backgroundColor: isLab ? "#EDE9FE" : "#EFF6FF",
                                },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={isLab ? "flask-outline" : "book-open-outline"}
                                size={12}
                                color={isLab ? "#7C3AED" : "#2563EB"}
                              />
                              <Text
                                style={[
                                  styles.typeBadgeText,
                                  { color: isLab ? "#7C3AED" : "#2563EB" },
                                ]}
                              >
                                {isLab ? "LAB" : "THEORY"}
                              </Text>
                            </View>
                          </View>

                          <Text
                            style={[styles.courseTitle, { color: colors.muted }]}
                            numberOfLines={1}
                          >
                            {title}
                          </Text>
                        </View>

                        {/* Verification Checkmark Button */}
                        <Pressable
                          onPress={() => toggleItemVerified(entryKey)}
                          style={[
                            styles.verifyBtn,
                            isVerified && { backgroundColor: "#D1FAE5" },
                            !isVerified && { backgroundColor: isDark ? colors.bg : "#F1F5F9" },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={isVerified ? "check-circle" : "checkbox-blank-circle-outline"}
                            size={18}
                            color={isVerified ? "#059669" : colors.muted}
                          />
                          <Text
                            style={[
                              styles.verifyBtnText,
                              { color: isVerified ? "#059669" : colors.muted },
                            ]}
                          >
                            {isVerified ? "Verified" : "Verify"}
                          </Text>
                        </Pressable>
                      </View>

                      {/* Card Details: Time, Room, Teacher */}
                      <View style={styles.cardDetailsRow}>
                        {/* Time slot */}
                        <View style={styles.detailItem}>
                          <MaterialCommunityIcons
                            name="clock-outline"
                            size={14}
                            color={colors.primary}
                          />
                          <Text style={[styles.detailText, { color: colors.text }]}>
                            {formatTime12h(startTime)} – {formatTime12h(endTime)}
                          </Text>
                        </View>

                        {/* Room */}
                        {entry.room ? (
                          <View style={styles.detailItem}>
                            <MaterialCommunityIcons
                              name="map-marker-outline"
                              size={14}
                              color="#6366F1"
                            />
                            <Text
                              style={[styles.detailText, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {entry.room}
                            </Text>
                          </View>
                        ) : null}

                        {/* Instructor */}
                        {entry.instructor ? (
                          <View style={styles.detailItem}>
                            <MaterialCommunityIcons
                              name="account-outline"
                              size={14}
                              color="#059669"
                            />
                            <Text
                              style={[styles.detailText, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {entry.instructor}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Card Footer Actions: Edit / Delete */}
                      <View style={styles.cardActionsRow}>
                        <Pressable
                          onPress={() => handleEditEntry(entry, index)}
                          style={[styles.cardActionBtn, { backgroundColor: isDark ? colors.bg : "#F1F5F9" }]}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.text} />
                          <Text style={[styles.cardActionText, { color: colors.text }]}>Edit</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleDeleteEntry(index)}
                          style={[styles.cardActionBtn, { backgroundColor: isDark ? colors.bg : "#FEE2E2" }]}
                        >
                          <MaterialCommunityIcons name="delete-outline" size={14} color="#DC2626" />
                          <Text style={[styles.cardActionText, { color: "#DC2626" }]}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {/* Bottom Activation Dock */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderTopColor: isDark ? colors.border : "#E2E8F0",
              paddingBottom: Math.max(insets.bottom, 14) + 6,
            },
          ]}
        >
          {/* Verification Checkbox */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              setIsVerifiedChecked(!isVerifiedChecked);
            }}
            style={styles.verificationCheckboxRow}
          >
            <MaterialCommunityIcons
              name={isVerifiedChecked ? "checkbox-marked" : "checkbox-blank-outline"}
              size={22}
              color={isVerifiedChecked ? colors.primary : colors.muted}
            />
            <Text style={[styles.verificationCheckboxText, { color: colors.text }]}>
              I have cross-checked this timetable with the PDF
            </Text>
          </Pressable>

          {/* Share Toggle */}
          <View style={styles.shareRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.shareTitle, { color: colors.text }]}>
                Share with classmates
              </Text>
              <Text style={[styles.shareSub, { color: colors.muted }]}>
                Allow students in {currentSection || routine.academic_group} to view this verified routine
              </Text>
            </View>
            <Switch
              value={shareWithClass}
              onValueChange={setShareWithClass}
              trackColor={{ false: "#CBD5E1", true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Primary Activation Button */}
          <Pressable
            onPress={handleConfirmAndActivate}
            disabled={isActivating || !isVerifiedChecked}
            style={({ pressed }) => [
              styles.activateBtn,
              {
                backgroundColor: isVerifiedChecked ? colors.primary : colors.muted,
                opacity: pressed || isActivating ? 0.8 : 1,
              },
            ]}
          >
            {isActivating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="calendar-check" size={20} color="#FFFFFF" />
                <Text style={styles.activateBtnText}>
                  Activate Routine & Set Reminders
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.modalRoot,
          {
            backgroundColor: isDark ? colors.bg : "#F8FAFC",
            paddingTop: insets.top,
          },
        ]}
      >
        {/* Top Header Bar */}
        <View
          style={[
            styles.topBar,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderBottomColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          <Pressable onPress={onClose} style={styles.topBackBtn} hitSlop={10}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.topTitleWrap}>
            <Text style={[styles.topTitle, { color: colors.text }]} numberOfLines={1}>
              Routine Studio & Verification
            </Text>
            <Text style={[styles.topSub, { color: colors.muted }]} numberOfLines={1}>
              {currentSection || routine.title || "Timetable"} • {entries.length} classes detected
            </Text>
          </View>

          <Pressable
            onPress={handleAddNewClass}
            style={[styles.headerAddBtn, { backgroundColor: colors.primarySoft }]}
          >
            <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
            <Text style={[styles.headerAddBtnText, { color: colors.primary }]}>Class</Text>
          </Pressable>
        </View>

        {/* View Mode Segmented Switcher */}
        <View
          style={[
            styles.modeTabsBar,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderBottomColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          <View style={[styles.modeTabsWrap, { backgroundColor: isDark ? colors.bg : "#F1F5F9" }]}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                setViewMode("compare");
              }}
              style={[
                styles.modeTabBtn,
                viewMode === "compare" && { backgroundColor: colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="compare"
                size={16}
                color={viewMode === "compare" ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.modeTabText,
                  { color: viewMode === "compare" ? "#FFFFFF" : colors.text },
                ]}
              >
                Split Compare
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic();
                setViewMode("routine");
              }}
              style={[
                styles.modeTabBtn,
                viewMode === "routine" && { backgroundColor: colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="table-clock"
                size={16}
                color={viewMode === "routine" ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.modeTabText,
                  { color: viewMode === "routine" ? "#FFFFFF" : colors.text },
                ]}
              >
                Routine ({entries.length})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic();
                setViewMode("document");
              }}
              style={[
                styles.modeTabBtn,
                viewMode === "document" && { backgroundColor: colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="file-pdf-box"
                size={16}
                color={viewMode === "document" ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.modeTabText,
                  { color: viewMode === "document" ? "#FFFFFF" : colors.text },
                ]}
              >
                Original PDF
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Main Content Workspace */}
        <View style={styles.workspace}>
          {viewMode === "compare" ? (
            isLargeScreen ? (
              // Large Screen: True Side-by-Side Split View
              <View style={styles.splitRow}>
                <View style={styles.splitLeft}>{renderDocumentViewer()}</View>
                <View style={styles.splitRight}>{renderRoutineStudio()}</View>
              </View>
            ) : (
              // Mobile / Narrow: Vertical Stack Split View
              <View style={styles.splitCol}>
                <View style={{ height: Math.min(windowHeight * 0.38, 280) }}>
                  {renderDocumentViewer()}
                </View>
                <View style={{ flex: 1 }}>{renderRoutineStudio()}</View>
              </View>
            )
          ) : viewMode === "document" ? (
            <View style={{ flex: 1 }}>{renderDocumentViewer()}</View>
          ) : (
            <View style={{ flex: 1 }}>{renderRoutineStudio()}</View>
          )}
        </View>

        {/* Manual Class Editor Modal */}
        {editingEntry.isOpen && (
          <ManualClassModal
            visible={editingEntry.isOpen}
            initialData={editingEntry.entry}
            onClose={() => setEditingEntry({ entry: null, index: -1, isOpen: false })}
            onSave={handleSaveEditedEntry}
          />
        )}

        {/* Fullscreen PDF Reader for interactive inspection */}
        {showFullScreenReader && fileDataUrl ? (
          <FullScreenPdfReader
            visible={showFullScreenReader}
            url={fileDataUrl}
            title={uploadedFile?.name || "Official Routine PDF"}
            department={routine.department}
            courseCode={currentSection}
            fileSizeBytes={uploadedFile?.size}
            onClose={() => setShowFullScreenReader(false)}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  topBackBtn: {
    padding: 4,
  },
  topTitleWrap: {
    flex: 1,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  topSub: {
    fontSize: 12,
    marginTop: 2,
  },
  headerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 4,
  },
  headerAddBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modeTabsBar: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  modeTabsWrap: {
    flexDirection: "row",
    borderRadius: radius.md,
    padding: 3,
  },
  modeTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: radius.sm,
    gap: 5,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: "600",
  },
  workspace: {
    flex: 1,
  },
  splitRow: {
    flex: 1,
    flexDirection: "row",
  },
  splitCol: {
    flex: 1,
    flexDirection: "column",
  },
  splitLeft: {
    flex: 1.1,
    borderRightWidth: 1,
    borderRightColor: "#CBD5E1",
  },
  splitRight: {
    flex: 1,
  },

  // Document Pane
  docPane: {
    flex: 1,
  },
  docToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  docInfoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  docIconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  docNameText: {
    fontSize: 13,
    fontWeight: "700",
  },
  docSubText: {
    fontSize: 11,
  },
  pageControlsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pageBtn: {
    padding: 4,
    borderRadius: radius.sm,
  },
  pageChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pageChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  zoomBtn: {
    padding: 5,
    borderRadius: radius.sm,
  },
  pagePillsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: 1,
  },
  quickPagePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  quickPagePillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  docCanvasWrap: {
    flex: 1,
  },
  nativeDocBanner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  pdfIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  nativeDocTitle: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  nativeDocSub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  openViewerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  openViewerBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  emptyDocWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyDocTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 8,
  },
  emptyDocSub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },

  // Studio Pane
  studioPane: {
    flex: 1,
  },
  studioHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  sectionSelectWrap: {
    marginBottom: 6,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  sectionActiveBadge: {
    fontSize: 13,
    fontWeight: "700",
  },
  sectionChipsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  sectionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  sectionChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricItem: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  metricNumber: {
    fontSize: 15,
    fontWeight: "700",
  },
  metricLabel: {
    fontSize: 12,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 4,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 8,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  alertText: {
    fontSize: 11,
    marginTop: 1,
  },
  dayFilterRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    flexWrap: "wrap",
  },
  dayFilterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  dayFilterText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardsScroll: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  loadingWrap: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
  },
  emptyWrap: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyActionsRow: {
    marginTop: 18,
    gap: 10,
    width: "100%",
    maxWidth: 320,
  },
  autoFillBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: radius.md,
    gap: 6,
  },
  autoFillBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  manualAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  manualAddBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dayGroup: {
    marginBottom: 16,
  },
  dayGroupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dayGroupTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  dayGroupBadge: {
    fontSize: 12,
  },
  classCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  courseCode: {
    fontSize: 15,
    fontWeight: "700",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    gap: 3,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  courseTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 4,
  },
  verifyBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardDetailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginVertical: 6,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#E2E8F0",
  },
  cardActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
    gap: 4,
  },
  cardActionText: {
    fontSize: 11,
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  verificationCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  verificationCheckboxText: {
    fontSize: 12,
    fontWeight: "600",
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  shareTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  shareSub: {
    fontSize: 10,
  },
  activateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    gap: 8,
  },
  activateBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
