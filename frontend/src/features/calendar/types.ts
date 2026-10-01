export type DayOfWeek =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

export type CalendarEventType =
  | "CLASS"
  | "LAB"
  | "QUIZ"
  | "ASSIGNMENT"
  | "EXAM"
  | "PRESENTATION"
  | "PROJECT"
  | "DEADLINE"
  | "PERSONAL_TASK"
  | "HOLIDAY"
  | "OTHER";

export type EventPriority = "low" | "medium" | "high";

export type RoutineConfidence = "high" | "medium" | "low" | "ambiguous";

export type RoutineVerificationStatus =
  | "ai_draft"
  | "user_verified"
  | "class_shared"
  | "community_confirmed"
  | "needs_review"
  | "reported_issue";

export interface AcademicProfile {
  user_id: string;
  university: string;
  department: string;
  semester: string;
  section: string;
  batch?: string | null;
  academic_group: string;
  updated_at?: string;
}

export interface RoutineEntry {
  id?: string;
  routine_id?: string;
  course_code: string;
  course_title: string;
  day_of_week: DayOfWeek;
  start_time: string; // HH:MM 24h
  end_time: string;   // HH:MM 24h
  room?: string | null;
  instructor?: string | null;
  type: "CLASS" | "LAB" | "OTHER";
  group_name?: string | null;
  confidence?: RoutineConfidence;
  warnings?: string[];
  is_confirmed?: boolean;
}

export interface AcademicRoutine {
  id: string;
  user_id: string;
  title: string;
  university: string;
  department: string;
  semester: string;
  section: string;
  batch?: string | null;
  academic_group: string;
  version: number;
  is_active: boolean;
  is_public: boolean;
  source_type: "manual" | "pdf_import" | "public_copy";
  verification_status: RoutineVerificationStatus;
  verified_at?: string | null;
  raw_metadata?: {
    conflicts?: any[];
    hasAmbiguity?: boolean;
    overallConfidence?: RoutineConfidence;
    source?: string;
    totalDetected?: number;
  };
  created_at: string;
  updated_at: string;
  uploader?: {
    full_name: string;
    avatar_url?: string | null;
  };
  entries?: RoutineEntry[];
  confirmedCount?: number;
  reportedCount?: number;
}

export interface UserRoutineOverride {
  id: string;
  user_id: string;
  routine_id: string;
  routine_entry_id: string;
  custom_room?: string | null;
  custom_instructor?: string | null;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  custom_notes?: string | null;
  is_hidden: boolean;
}

export interface CalendarEvent {
  id: string;
  user_id?: string;
  routine_entry_id?: string | null;
  title: string;
  event_type: CalendarEventType;
  course_code?: string | null;
  course_title?: string | null;
  description?: string | null;
  location?: string | null;
  instructor?: string | null;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time?: string | null;
  is_all_day?: boolean;
  is_completed?: boolean;
  priority?: EventPriority;
  is_exception?: boolean;
  is_cancelled?: boolean;
  exception_type?: "cancelled" | "rescheduled" | "makeup" | "extra";
  reminder_minutes?: number[];
  is_routine_class?: boolean;
}

export interface ExtractionConflict {
  itemA: string;
  itemB: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface ExtractedRoutineClass {
  courseCode: string;
  courseTitle: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  room?: string | null;
  instructor?: string | null;
  type: "CLASS" | "LAB" | "OTHER";
  groupName?: string | null;
  confidence: RoutineConfidence;
  warnings: string[];
}

export interface ExtractionResult {
  classes: ExtractedRoutineClass[];
  conflicts: ExtractionConflict[];
  hasAmbiguity: boolean;
  needsReview: boolean;
  overallConfidence: RoutineConfidence;
  source: string;
  totalDetected: number;
}

export interface UpcomingSummary {
  activeClass?: {
    id: string;
    courseCode: string;
    courseTitle: string;
    startTime: string;
    endTime: string;
    room?: string;
    instructor?: string;
    type: string;
    minutesLeft: number;
  } | null;
  nextClass?: {
    id: string;
    courseCode: string;
    courseTitle: string;
    startTime: string;
    endTime: string;
    room?: string;
    instructor?: string;
    type: string;
    countdown: string;
    dayLabel: string;
  } | null;
  todayClasses: {
    id: string;
    courseCode: string;
    courseTitle: string;
    startTime: string;
    endTime: string;
    room?: string;
    instructor?: string;
    type: string;
  }[];
  upcomingTasks: CalendarEvent[];
  counts: {
    assignments: number;
    quizzes: number;
    exams: number;
    todayClassesCount: number;
  };
  routine?: {
    id: string;
    title: string;
    department: string;
    semester: string;
    section: string;
  } | null;
}

export interface AcademicNotificationPreferences {
  user_id: string;
  notify_classes: boolean;
  class_lead_minutes: number;
  notify_assignments: boolean;
  assignment_lead_hours: number;
  notify_exams: boolean;
  exam_lead_hours: number;
  notify_tasks: boolean;
  task_lead_minutes: number;
  smart_grouping: boolean;
  timezone: string;
}
