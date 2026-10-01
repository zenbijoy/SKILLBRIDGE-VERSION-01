import type { CalendarEventType, DayOfWeek } from "./types";

export const DAYS_OF_WEEK: DayOfWeek[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DAY_SHORT_LABELS: Record<DayOfWeek, string> = {
  Sunday: "Sun",
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

export const EVENT_TYPE_CONFIG: Record<
  CalendarEventType,
  {
    label: string;
    icon: string;
    lightColor: string;
    darkColor: string;
    bgLight: string;
    bgDark: string;
  }
> = {
  CLASS: {
    label: "Class",
    icon: "book-open-variant",
    lightColor: "#2563EB",
    darkColor: "#60A5FA",
    bgLight: "#EFF6FF",
    bgDark: "#1E293B",
  },
  LAB: {
    label: "Lab",
    icon: "flask-outline",
    lightColor: "#7C3AED",
    darkColor: "#A78BFA",
    bgLight: "#F5F3FF",
    bgDark: "#2E1065",
  },
  QUIZ: {
    label: "Quiz",
    icon: "help-circle-outline",
    lightColor: "#EA580C",
    darkColor: "#FB923C",
    bgLight: "#FFF7ED",
    bgDark: "#431407",
  },
  ASSIGNMENT: {
    label: "Assignment",
    icon: "clipboard-text-outline",
    lightColor: "#059669",
    darkColor: "#34D399",
    bgLight: "#ECFDF5",
    bgDark: "#064E3B",
  },
  EXAM: {
    label: "Exam",
    icon: "alert-decagram-outline",
    lightColor: "#DC2626",
    darkColor: "#F87171",
    bgLight: "#FEF2F2",
    bgDark: "#450A0A",
  },
  PRESENTATION: {
    label: "Presentation",
    icon: "presentation",
    lightColor: "#0891B2",
    darkColor: "#22D3EE",
    bgLight: "#ECFEFF",
    bgDark: "#164E63",
  },
  PROJECT: {
    label: "Project",
    icon: "briefcase-outline",
    lightColor: "#4F46E5",
    darkColor: "#818CF8",
    bgLight: "#EEF2FF",
    bgDark: "#1E1B4B",
  },
  DEADLINE: {
    label: "Deadline",
    icon: "timer-sand",
    lightColor: "#D97706",
    darkColor: "#FBBF24",
    bgLight: "#FFFBEB",
    bgDark: "#451A03",
  },
  PERSONAL_TASK: {
    label: "Task",
    icon: "checkbox-marked-circle-outline",
    lightColor: "#4B5563",
    darkColor: "#9CA3AF",
    bgLight: "#F3F4F6",
    bgDark: "#1F2937",
  },
  HOLIDAY: {
    label: "Holiday",
    icon: "palm-tree",
    lightColor: "#10B981",
    darkColor: "#6EE7B7",
    bgLight: "#ECFDF5",
    bgDark: "#064E3B",
  },
  OTHER: {
    label: "Other",
    icon: "calendar-outline",
    lightColor: "#6B7280",
    darkColor: "#9CA3AF",
    bgLight: "#F9FAFB",
    bgDark: "#111827",
  },
};

export const TIME_SLOTS_HOURLY = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
];
