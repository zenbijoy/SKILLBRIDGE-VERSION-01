import test from "node:test";
import assert from "node:assert/strict";
import { isWithinQuietHours } from "./push.js";

test("quiet-hours evaluation", async (t) => {
  await t.test("handles overnight windows", () => {
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T23:00:00Z"), "22:00", "07:00", "UTC"), true);
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T06:59:00Z"), "22:00", "07:00", "UTC"), true);
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T12:00:00Z"), "22:00", "07:00", "UTC"), false);
  });

  await t.test("handles daytime windows and exclusive end", () => {
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T10:00:00Z"), "09:00", "17:00", "UTC"), true);
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T17:00:00Z"), "09:00", "17:00", "UTC"), false);
  });

  await t.test("treats equal endpoints as disabled", () => {
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T12:00:00Z"), "12:00", "12:00", "UTC"), false);
  });
});
