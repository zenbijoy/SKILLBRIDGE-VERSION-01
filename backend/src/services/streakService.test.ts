import test from "node:test";
import assert from "node:assert/strict";
import { computeStreaksFromDates } from "./streakService.js";

test("computeStreaksFromDates - empty dates returns zeros", () => {
  const result = computeStreaksFromDates([]);
  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 0);
  assert.equal(result.totalActiveDays, 0);
});

test("computeStreaksFromDates - today active increments current streak", () => {
  const today = new Date("2026-10-16T12:00:00Z");
  const dates = ["2026-10-16", "2026-10-15", "2026-10-14"];
  const result = computeStreaksFromDates(dates, today);
  assert.equal(result.currentStreak, 3);
  assert.equal(result.longestStreak, 3);
  assert.equal(result.totalActiveDays, 3);
});

test("computeStreaksFromDates - today not active yet but yesterday active preserves streak", () => {
  const today = new Date("2026-10-16T12:00:00Z");
  const dates = ["2026-10-15", "2026-10-14"];
  const result = computeStreaksFromDates(dates, today);
  assert.equal(result.currentStreak, 2);
  assert.equal(result.longestStreak, 2);
  assert.equal(result.totalActiveDays, 2);
});

test("computeStreaksFromDates - historical longer streak is retained", () => {
  const today = new Date("2026-10-16T12:00:00Z");
  // Past 5-day streak, then a break, then 2-day current streak
  const dates = [
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
    "2026-10-05",
    "2026-10-15",
    "2026-10-16",
  ];
  const result = computeStreaksFromDates(dates, today);
  assert.equal(result.currentStreak, 2);
  assert.equal(result.longestStreak, 5);
  assert.equal(result.totalActiveDays, 7);
});

test("computeStreaksFromDates - duplicate dates are deduplicated safely", () => {
  const today = new Date("2026-10-16T12:00:00Z");
  const dates = ["2026-10-16", "2026-10-16", "2026-10-15", "2026-10-15"];
  const result = computeStreaksFromDates(dates, today);
  assert.equal(result.currentStreak, 2);
  assert.equal(result.totalActiveDays, 2);
});
