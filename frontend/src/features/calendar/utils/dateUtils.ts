import type { DayOfWeek } from "../types";
import { DAYS_OF_WEEK } from "../constants";

/**
 * Format "HH:MM" (24h) to "hh:mm AM/PM"
 */
export function formatTime12h(time24?: string | null): string {
  if (!time24) return "";
  const parts = time24.split(":");
  const hourStr = parts[0] ?? "00";
  const minuteStr = parts[1] ?? "00";
  let hours = parseInt(hourStr, 10);
  if (isNaN(hours)) return time24;
  const minutes = parseInt(minuteStr, 10) || 0;

  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const minutePadded = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutePadded} ${ampm}`;
}

/**
 * Format a Date to "YYYY-MM-DD"
 */
export function formatDateIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse "YYYY-MM-DD" safely without UTC shifts
 */
export function parseIsoDate(iso: string): Date {
  const parts = iso.split("-");
  const year = parseInt(parts[0] ?? "2026", 10);
  const month = parseInt(parts[1] ?? "1", 10) - 1;
  const day = parseInt(parts[2] ?? "1", 10);
  return new Date(year, month, day);
}

export interface MonthGridCell {
  date: Date;
  iso: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Return 35-42 days for the visual month grid (Sunday to Saturday)
 */
export function getMonthGrid(year: number, monthIndex: number): MonthGridCell[] {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, monthIndex, 0).getDate();

  const todayIso = formatDateIso(new Date());
  const cells: MonthGridCell[] = [];

  // Previous month padding
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const d = new Date(year, monthIndex - 1, day);
    const iso = formatDateIso(d);
    cells.push({
      date: d,
      iso,
      dayNumber: day,
      isCurrentMonth: false,
      isToday: iso === todayIso,
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    const iso = formatDateIso(d);
    cells.push({
      date: d,
      iso,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: iso === todayIso,
    });
  }

  // Next month padding to complete 5 or 6 rows (multiples of 7)
  const remainingCells = 7 - (cells.length % 7);
  if (remainingCells < 7) {
    for (let day = 1; day <= remainingCells; day++) {
      const d = new Date(year, monthIndex + 1, day);
      const iso = formatDateIso(d);
      cells.push({
        date: d,
        iso,
        dayNumber: day,
        isCurrentMonth: false,
        isToday: iso === todayIso,
      });
    }
  }

  return cells;
}

export interface WeekDayItem {
  date: Date;
  iso: string;
  dayOfWeek: DayOfWeek;
  dayShort: string;
  dayNumber: number;
  isToday: boolean;
}

/**
 * Return the 7 days of the week (Sunday through Saturday) for the given base date
 */
export function getWeekDays(baseDate: Date): WeekDayItem[] {
  const current = new Date(baseDate);
  const dayOfWeekIndex = current.getDay(); // 0 is Sunday
  const sunday = new Date(current);
  sunday.setDate(current.getDate() - dayOfWeekIndex);

  const todayIso = formatDateIso(new Date());
  const weekDays: WeekDayItem[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const iso = formatDateIso(d);
    const dayOfWeek = DAYS_OF_WEEK[d.getDay()] ?? "Sunday";
    weekDays.push({
      date: d,
      iso,
      dayOfWeek,
      dayShort: dayOfWeek.slice(0, 3),
      dayNumber: d.getDate(),
      isToday: iso === todayIso,
    });
  }

  return weekDays;
}

/**
 * "Today", "Tomorrow", "Yesterday", or "Fri, Oct 5"
 */
export function getRelativeDayLabel(iso: string): string {
  const target = parseIsoDate(iso);
  const today = new Date();
  const todayIso = formatDateIso(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = formatDateIso(tomorrow);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayIso = formatDateIso(yesterday);

  if (iso === todayIso) return "Today";
  if (iso === tomorrowIso) return "Tomorrow";
  if (iso === yesterdayIso) return "Yesterday";

  return target.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Convert "HH:MM" to minutes from 00:00
 */
export function minutesFromMidnight(time24: string): number {
  const parts = time24.split(":");
  const h = parseInt(parts[0] ?? "0", 10) || 0;
  const m = parseInt(parts[1] ?? "0", 10) || 0;
  return h * 60 + m;
}

/**
 * Check if current time falls within startTime and endTime on targetDate
 */
export function isCurrentlyActive(
  startTime24: string,
  endTime24: string,
  targetDateIso: string,
): boolean {
  const now = new Date();
  const todayIso = formatDateIso(now);
  if (targetDateIso !== todayIso) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMin = minutesFromMidnight(startTime24);
  const endMin = minutesFromMidnight(endTime24);
  return currentMinutes >= startMin && currentMinutes <= endMin;
}

/**
 * Get current time as minutes from midnight
 */
export function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
