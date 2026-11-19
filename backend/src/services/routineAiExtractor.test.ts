import test from "node:test";
import assert from "node:assert/strict";
import {
  extractRoutine,
  normalizeTime,
  normalizeDay,
  analyzeConflicts,
  TEACHER_DIRECTORY,
  COURSE_TITLES,
  LAB_DIRECTORY,
} from "./routineAiExtractor.js";

test("routineAiExtractor - time and day normalization", async (t) => {
  await t.test("normalizes various time formats to 24h HH:mm", () => {
    assert.strictEqual(normalizeTime("8:00 AM"), "08:00");
    assert.strictEqual(normalizeTime("08:00 AM"), "08:00");
    assert.strictEqual(normalizeTime("8.00am"), "08:00");
    assert.strictEqual(normalizeTime("9.40am"), "09:40");
    assert.strictEqual(normalizeTime("10.50am"), "10:50");
    assert.strictEqual(normalizeTime("2:30 PM"), "14:30");
    assert.strictEqual(normalizeTime("2.30pm"), "14:30");
    assert.strictEqual(normalizeTime("4.10pm"), "16:10");
    assert.strictEqual(normalizeTime("5.00pm"), "17:00");
    assert.strictEqual(normalizeTime("14:30"), "14:30");
  });

  await t.test("normalizes day names to proper standard English", () => {
    assert.strictEqual(normalizeDay("sat"), "Saturday");
    assert.strictEqual(normalizeDay("Sunday"), "Sunday");
    assert.strictEqual(normalizeDay("mon"), "Monday");
    assert.strictEqual(normalizeDay("tue"), "Tuesday");
    assert.strictEqual(normalizeDay("Wed"), "Wednesday");
    assert.strictEqual(normalizeDay("thursday"), "Thursday");
    assert.strictEqual(normalizeDay("fri"), "Friday");
  });
});

test("routineAiExtractor - directories and knowledge base", async (t) => {
  await t.test("has teacher initials mapped", () => {
    assert.strictEqual(TEACHER_DIRECTORY["SA"], "Shyla Afroge");
    assert.strictEqual(TEACHER_DIRECTORY["SZM"], "Sadia Zaman Mishu");
    assert.strictEqual(TEACHER_DIRECTORY["MIT"], "Md. Mazharul Islam");
    assert.strictEqual(TEACHER_DIRECTORY["SUZ"], "Prof. Dr. Md. Shahid Uz Zaman");
  });

  await t.test("has lab names mapped", () => {
    assert.strictEqual(LAB_DIRECTORY["ACL Lab"], "Alg. & Computational Lab");
    assert.strictEqual(LAB_DIRECTORY["PG Lab"], "Post Graduate Lab");
  });

  await t.test("has standard courses mapped", () => {
    assert.strictEqual(COURSE_TITLES["CSE 2201"], "Algorithms");
    assert.strictEqual(COURSE_TITLES["CSE 2204"], "Object Oriented Programming Sessional (Lab)");
  });
});

test("routineAiExtractor - conflict analyzer", async (t) => {
  await t.test("detects overlapping classes on same day", () => {
    const res = analyzeConflicts([
      {
        courseCode: "CSE 2201",
        courseTitle: "Algorithms",
        day: "Sunday",
        startTime: "08:00",
        endTime: "08:50",
        type: "CLASS",
        confidence: "high",
        warnings: [],
      },
      {
        courseCode: "CSE 2203",
        courseTitle: "OOP",
        day: "Sunday",
        startTime: "08:30",
        endTime: "09:40",
        type: "CLASS",
        confidence: "high",
        warnings: [],
      },
    ]);

    assert.strictEqual(res.conflicts.length, 1);
    assert.strictEqual(res.hasAmbiguity, true);
  });
});
