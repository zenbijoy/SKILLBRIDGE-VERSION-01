import { z } from "zod";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { geminiKeyManager } from "./geminiKeyManager.js";

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const RoutineEntrySchema = z.object({
  courseCode: z.string().min(1).max(30),
  courseTitle: z.string().min(1).max(100),
  day: z.enum(DAYS_OF_WEEK),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM 24h format"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM 24h format"),
  room: z.string().max(50).nullable().optional(),
  instructor: z.string().max(100).nullable().optional(),
  type: z.enum(["CLASS", "LAB", "OTHER"]).default("CLASS"),
  groupName: z.string().max(20).nullable().optional(),
  confidence: z.enum(["high", "medium", "low", "ambiguous"]).default("high"),
  warnings: z.array(z.string()).default([]),
});

export type ExtractedRoutineEntry = z.infer<typeof RoutineEntrySchema>;

export interface ExtractionContext {
  university?: string;
  department?: string;
  semester?: string;
  section?: string;
  batch?: string;
  userNotes?: string;
}

export interface ExtractionConflict {
  itemA: string;
  itemB: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface ExtractionResult {
  classes: ExtractedRoutineEntry[];
  conflicts: ExtractionConflict[];
  hasAmbiguity: boolean;
  needsReview: boolean;
  overallConfidence: "high" | "medium" | "low" | "ambiguous";
  source: "gemini_vision" | "gemini_text" | "heuristic_fallback";
  totalDetected: number;
}

/**
 * Standardize time string into HH:MM (24-hour)
 */
export function normalizeTime(raw: string): string | null {
  if (!raw) return null;
  const str = raw.trim().toUpperCase();

  // Match 24h format: "14:30" or "09:00"
  const m24 = str.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m24 && m24[1] && m24[2]) {
    const hh = m24[1].padStart(2, "0");
    const mm = m24[2];
    return `${hh}:${mm}`;
  }

  // Match 12h format: "10:30 AM", "2:15PM", "09:00AM"
  const m12 = str.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/);
  if (m12 && m12[1] && m12[2] && m12[3]) {
    let hour = parseInt(m12[1], 10);
    const min = m12[2];
    const ampm = m12[3];

    if (ampm === "AM" && hour === 12) hour = 0;
    if (ampm === "PM" && hour < 12) hour += 12;

    return `${String(hour).padStart(2, "0")}:${min}`;
  }

  // Match simple hour: "10 AM", "2 PM"
  const mHour = str.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (mHour && mHour[1]) {
    let hour = parseInt(mHour[1], 10);
    const ampm = mHour[2] || "AM";
    if (ampm === "AM" && hour === 12) hour = 0;
    if (ampm === "PM" && hour < 12) hour += 12;
    return `${String(hour).padStart(2, "0")}:00`;
  }

  return null;
}

/**
 * Normalize day name to full capitalized English day
 */
export function normalizeDay(raw: string): DayOfWeek | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith("sun")) return "Sunday";
  if (lower.startsWith("mon")) return "Monday";
  if (lower.startsWith("tue")) return "Tuesday";
  if (lower.startsWith("wed")) return "Wednesday";
  if (lower.startsWith("thu")) return "Thursday";
  if (lower.startsWith("fri")) return "Friday";
  if (lower.startsWith("sat")) return "Saturday";
  return null;
}

/**
 * Detect conflicts (overlapping slots, invalid start/end)
 */
export function analyzeConflicts(classes: ExtractedRoutineEntry[]): {
  conflicts: ExtractionConflict[];
  enrichedClasses: ExtractedRoutineEntry[];
  hasAmbiguity: boolean;
} {
  const conflicts: ExtractionConflict[] = [];
  const enriched = classes.map((c) => ({ ...c, warnings: [...c.warnings] }));

  for (let i = 0; i < enriched.length; i++) {
    const a = enriched[i];
    if (!a) continue;

    // Check invalid duration
    const aParts = a.startTime.split(":");
    const aEndParts = a.endTime.split(":");
    const aStartH = Number(aParts[0] ?? 0);
    const aStartM = Number(aParts[1] ?? 0);
    const aEndH = Number(aEndParts[0] ?? 0);
    const aEndM = Number(aEndParts[1] ?? 0);
    const aStartMins = aStartH * 60 + aStartM;
    const aEndMins = aEndH * 60 + aEndM;

    if (aEndMins <= aStartMins) {
      a.confidence = "ambiguous";
      const w = `End time (${a.endTime}) is earlier than or equal to start time (${a.startTime})`;
      a.warnings.push(w);
      conflicts.push({
        itemA: a.courseCode,
        itemB: a.courseCode,
        day: a.day,
        startTime: a.startTime,
        endTime: a.endTime,
        reason: w,
      });
    }

    // Check overlaps on the same day
    for (let j = i + 1; j < enriched.length; j++) {
      const b = enriched[j];
      if (!b || a.day !== b.day) continue;

      // If group names are distinct (e.g. A1 vs A2), they can run parallel
      if (a.groupName && b.groupName && a.groupName !== b.groupName) continue;

      const bParts = b.startTime.split(":");
      const bEndParts = b.endTime.split(":");
      const bStartH = Number(bParts[0] ?? 0);
      const bStartM = Number(bParts[1] ?? 0);
      const bEndH = Number(bEndParts[0] ?? 0);
      const bEndM = Number(bEndParts[1] ?? 0);
      const bStartMins = bStartH * 60 + bStartM;
      const bEndMins = bEndH * 60 + bEndM;

      const hasOverlap = Math.max(aStartMins, bStartMins) < Math.min(aEndMins, bEndMins);
      if (hasOverlap) {
        a.confidence = "ambiguous";
        b.confidence = "ambiguous";
        const msg = `Schedule overlap with ${b.courseCode} (${b.startTime}-${b.endTime})`;
        a.warnings.push(msg);
        b.warnings.push(`Schedule overlap with ${a.courseCode} (${a.startTime}-${a.endTime})`);

        conflicts.push({
          itemA: `${a.courseCode} (${a.startTime}-${a.endTime})`,
          itemB: `${b.courseCode} (${b.startTime}-${b.endTime})`,
          day: a.day,
          startTime: a.startTime,
          endTime: a.endTime,
          reason: `Classes overlap on ${a.day}`,
        });
      }
    }
  }

  const hasAmbiguity = enriched.some(
    (c) => c.confidence === "ambiguous" || c.confidence === "low" || c.warnings.length > 0,
  );

  return { conflicts, enrichedClasses: enriched, hasAmbiguity };
}

/**
 * Main routine extractor function
 */
export async function extractRoutine(params: {
  fileBase64?: string;
  fileMimeType?: string;
  rawText?: string;
  context: ExtractionContext;
}): Promise<ExtractionResult> {
  const { fileBase64, fileMimeType, rawText, context } = params;

  if (fileBase64 || rawText) {
    try {
      return await callGeminiExtractor({
        fileBase64,
        fileMimeType: fileMimeType || "application/pdf",
        rawText,
        context,
      });
    } catch (err) {
      logger.warn(
        { event: "gemini_routine_extract_failed", err: (err as Error).message },
        "Gemini extraction failed; falling back to heuristic parsing",
      );
    }
  }

  // Fallback to text heuristic parser
  return heuristicFallback(rawText || "", context);
}

/**
 * Call Gemini Flash REST API with structured response
 */
async function callGeminiExtractor(options: {
  fileBase64?: string;
  fileMimeType: string;
  rawText?: string;
  context: ExtractionContext;
}): Promise<ExtractionResult> {
  const { fileBase64, fileMimeType, rawText, context } = options;

  const systemInstruction = `You are an expert academic routine and timetable parser for universities.
Your goal is to extract weekly class schedules with high accuracy and safety.
RULES:
1. Extract ALL weekly recurring classes, labs, and tutorials for the student's section.
2. Context given by user:
   - University: ${context.university || "Not specified"}
   - Department: ${context.department || "Not specified"}
   - Semester: ${context.semester || "Not specified"}
   - Section: ${context.section || "Not specified"}
   - Batch: ${context.batch || "Not specified"}
   - Extra user notes: ${context.userNotes || "None"}
3. If the timetable has multiple sections (e.g., Section A and Section B) and the user specified a section, prioritize extracting classes for THAT section. If unsure, include both but set groupName or add a warning.
4. Normalize times to 24-hour HH:MM format (e.g. 08:00, 10:30, 14:15).
5. Day must strictly be one of: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday.
6. Type must be CLASS, LAB, or OTHER.
7. Mark confidence as:
   - "high": Clear day, time, course, room
   - "medium": One field slightly ambiguous but deduced
   - "low": Hand-written or blurry text, missing time
   - "ambiguous": Overlapping slots or conflicting information detected
8. Provide clear, concise warnings in the "warnings" array for any entry needing human verification.
9. Return ONLY a valid JSON object matching the requested schema.`;

  const parts: any[] = [];

  if (fileBase64) {
    parts.push({
      inlineData: {
        mimeType: fileMimeType,
        data: fileBase64.replace(/^data:[^;]+;base64,/, ""),
      },
    });
  }

  if (rawText) {
    parts.push({
      text: `Timetable Text:\n${rawText}`,
    });
  }

  parts.push({
    text: "Extract all weekly timetable classes from this document according to the user's academic context.",
  });

  const generationConfig = {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        classes: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              courseCode: { type: "STRING" },
              courseTitle: { type: "STRING" },
              day: {
                type: "STRING",
                enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
              },
              startTime: { type: "STRING", description: "HH:MM 24h format" },
              endTime: { type: "STRING", description: "HH:MM 24h format" },
              room: { type: "STRING" },
              instructor: { type: "STRING" },
              type: { type: "STRING", enum: ["CLASS", "LAB", "OTHER"] },
              groupName: { type: "STRING" },
              confidence: { type: "STRING", enum: ["high", "medium", "low", "ambiguous"] },
              warnings: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["courseCode", "courseTitle", "day", "startTime", "endTime"],
          },
        },
        detectedMetadata: {
          type: "OBJECT",
          properties: {
            university: { type: "STRING" },
            department: { type: "STRING" },
            semester: { type: "STRING" },
            section: { type: "STRING" },
          },
        },
      },
      required: ["classes"],
    },
  };

  const geminiRes = await geminiKeyManager.generateContent({
    contents: [{ parts }],
    systemInstruction,
    generationConfig,
    preferredModel: "gemini-flash-latest",
    timeoutMs: 35_000,
  });

  const rawJsonText = geminiRes.text;

  let parsed: any;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch (parseErr) {
    throw new Error(`Gemini returned unparseable JSON: ${(parseErr as Error).message}`);
  }

  const rawClasses = Array.isArray(parsed.classes) ? parsed.classes : [];
  const validatedClasses: ExtractedRoutineEntry[] = [];

  for (const item of rawClasses) {
    const normDay = normalizeDay(item.day);
    const normStart = normalizeTime(item.startTime);
    const normEnd = normalizeTime(item.endTime);

    if (!normDay || !normStart || !normEnd) {
      continue;
    }

    const entry: ExtractedRoutineEntry = {
      courseCode: String(item.courseCode || "COURSE").trim(),
      courseTitle: String(item.courseTitle || item.courseCode || "Class").trim(),
      day: normDay,
      startTime: normStart,
      endTime: normEnd,
      room: item.room ? String(item.room).trim() : null,
      instructor: item.instructor ? String(item.instructor).trim() : null,
      type: ["CLASS", "LAB", "OTHER"].includes(item.type) ? item.type : "CLASS",
      groupName: item.groupName ? String(item.groupName).trim() : null,
      confidence: ["high", "medium", "low", "ambiguous"].includes(item.confidence)
        ? item.confidence
        : "high",
      warnings: Array.isArray(item.warnings) ? item.warnings.map(String) : [],
    };

    validatedClasses.push(entry);
  }

  const { conflicts, enrichedClasses, hasAmbiguity } = analyzeConflicts(validatedClasses);

  let overallConfidence: "high" | "medium" | "low" | "ambiguous" = "high";
  if (conflicts.length > 0 || enrichedClasses.some((c) => c.confidence === "ambiguous")) {
    overallConfidence = "ambiguous";
  } else if (enrichedClasses.some((c) => c.confidence === "low")) {
    overallConfidence = "low";
  } else if (enrichedClasses.some((c) => c.confidence === "medium")) {
    overallConfidence = "medium";
  }

  return {
    classes: enrichedClasses,
    conflicts,
    hasAmbiguity,
    needsReview: hasAmbiguity || enrichedClasses.length === 0,
    overallConfidence,
    source: fileBase64 ? "gemini_vision" : "gemini_text",
    totalDetected: enrichedClasses.length,
  };
}

/**
 * Heuristic text parser fallback
 */
function heuristicFallback(text: string, context: ExtractionContext): ExtractionResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const detected: ExtractedRoutineEntry[] = [];

  let currentDay: DayOfWeek = "Sunday";

  const timeRegex = /(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i;

  for (const line of lines) {
    const dayMatch = normalizeDay(line);
    if (dayMatch) {
      currentDay = dayMatch;
      continue;
    }

    const tMatch = line.match(timeRegex);
    if (tMatch && tMatch[1] && tMatch[2]) {
      const start = normalizeTime(tMatch[1]);
      const end = normalizeTime(tMatch[2]);
      if (start && end) {
        const remaining = line.replace(timeRegex, "").trim();
        const parts = remaining.split(/[,|\t]+/).map((s) => s.trim()).filter(Boolean);

        const courseCode = parts[0] || "COURSE";
        const room = parts[1] || null;
        const instructor = parts[2] || null;
        const isLab = /lab|sessional|practical/i.test(line);

        detected.push({
          courseCode,
          courseTitle: courseCode,
          day: currentDay,
          startTime: start,
          endTime: end,
          room,
          instructor,
          type: isLab ? "LAB" : "CLASS",
          groupName: null,
          confidence: "medium",
          warnings: ["Extracted using heuristic text parser. Please verify details."],
        });
      }
    }
  }

  // If nothing detected, generate a clean sample template for the user's department/semester
  if (detected.length === 0) {
    detected.push({
      courseCode: `${context.department || "CSE"} 2101`,
      courseTitle: "Data Structures & Algorithms",
      day: "Sunday",
      startTime: "10:00",
      endTime: "11:30",
      room: "Room 302",
      instructor: "Dept Faculty",
      type: "CLASS",
      groupName: null,
      confidence: "medium",
      warnings: ["Template entry created for review. Adjust time and course as per your routine."],
    });
    detected.push({
      courseCode: `${context.department || "MATH"} 2113`,
      courseTitle: "Integral Calculus",
      day: "Tuesday",
      startTime: "11:30",
      endTime: "13:00",
      room: "Room 401",
      instructor: "Faculty",
      type: "CLASS",
      groupName: null,
      confidence: "medium",
      warnings: ["Template entry created for review. Adjust time and course as per your routine."],
    });
  }

  const { conflicts, enrichedClasses, hasAmbiguity } = analyzeConflicts(detected);

  return {
    classes: enrichedClasses,
    conflicts,
    hasAmbiguity: true,
    needsReview: true,
    overallConfidence: "medium",
    source: "heuristic_fallback",
    totalDetected: enrichedClasses.length,
  };
}
