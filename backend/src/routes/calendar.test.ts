import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";

test("Calendar & Academic Routine API Test Suite", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const USER_ID = "11111111-1111-4111-8111-111111111111";
  const ROUTINE_ID = "22222222-2222-4222-8222-222222222222";
  const ENTRY_ID = "33333333-3333-4333-8333-333333333333";

  const routineRecord: any = {
    id: ROUTINE_ID,
    user_id: USER_ID,
    title: "CSE 2-2 Section A Routine",
    university: "RUET",
    department: "CSE",
    semester: "2nd Year Even",
    section: "A",
    batch: "2024",
    academic_group: "RUET / CSE / 2ND YEAR EVEN / A",
    version: 1,
    is_active: false,
    is_public: false,
    source_type: "pdf_import",
    verification_status: "ai_draft",
    raw_metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const routineEntryRecord: any = {
    id: ENTRY_ID,
    routine_id: ROUTINE_ID,
    course_code: "CSE 2201",
    course_title: "Algorithms",
    day_of_week: "Sunday",
    start_time: "10:15",
    end_time: "11:30",
    room: "301",
    instructor: "Dr. Test",
    type: "CLASS",
    group_name: "All",
    confidence: "high",
    warnings: [],
    is_confirmed: true,
  };

  const createMockChain = (data: any = null, error: any = null, count: number = 0) => {
    let selected = "";
    const chain: any = {
      select: (columns?: string) => {
        selected = columns ?? "";
        return chain;
      },
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      or: () => chain,
      is: () => chain,
      gte: () => chain,
      lte: () => chain,
      lt: () => chain,
      gt: () => chain,
      ilike: () => chain,
      order: () => chain,
      limit: () => chain,
      range: () => Promise.resolve({ data, count, error }),
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () =>
        Promise.resolve({
          data: selected.includes("account_status")
            ? { roles: ["student"], account_status: "active" }
            : data,
          error,
        }),
      then: (resolve: any) => resolve({ data, count, error }),
    };
    return chain;
  };

  const mockAdmin = {
    from: (table?: string) => {
      if (table === "profiles") {
        return createMockChain({
          id: USER_ID,
          full_name: "Test Student",
          username: "teststudent",
          roles: ["student"],
          account_status: "active",
        });
      }
      if (table === "academic_profiles") {
        const chain = createMockChain({
          user_id: USER_ID,
          university: "RUET",
          department: "CSE",
          semester: "2nd Year Even",
          section: "A",
          academic_group: "RUET / CSE / 2ND YEAR EVEN / A",
        });
        return chain;
      }
      if (table === "academic_routines") {
        const chain = createMockChain(routineRecord);
        chain.single = () => Promise.resolve({ data: routineRecord, error: null });
        chain.maybeSingle = () => Promise.resolve({ data: routineRecord, error: null });
        return chain;
      }
      if (table === "routine_entries") {
        const chain = createMockChain([routineEntryRecord]);
        chain.single = () => Promise.resolve({ data: routineEntryRecord, error: null });
        chain.maybeSingle = () => Promise.resolve({ data: routineEntryRecord, error: null });
        return chain;
      }
      if (table === "user_routine_overrides") {
        const override = {
          id: "ov-1",
          user_id: USER_ID,
          routine_id: ROUTINE_ID,
          routine_entry_id: ENTRY_ID,
          custom_room: "Auditorium",
        };
        const chain = createMockChain(override);
        chain.single = () => Promise.resolve({ data: override, error: null });
        return chain;
      }
      if (table === "routine_validations") {
        const val = {
          id: "val-1",
          routine_id: ROUTINE_ID,
          user_id: USER_ID,
          status: "confirmed",
        };
        const chain = createMockChain(val);
        chain.single = () => Promise.resolve({ data: val, error: null });
        return chain;
      }
      if (table === "academic_calendar_events") {
        const ex = {
          id: "ex-1",
          user_id: USER_ID,
          routine_entry_id: ENTRY_ID,
          title: "[Cancelled] CSE 2201",
          event_type: "CLASS",
          date: "2026-11-25",
          is_exception: true,
          exception_type: "cancelled",
        };
        const chain = createMockChain(ex);
        chain.single = () => Promise.resolve({ data: ex, error: null });
        return chain;
      }
      return createMockChain([]);
    },
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID, role: "authenticated" } },
        error: null,
      }),
    },
  };

  setAdminClient(mockAdmin as any);
  const authHeader = { Authorization: "Bearer valid_token" };

  await t.test("PUT /api/v1/calendar/routines/:id accepts snake_case entries from frontend", async () => {
    const res = await request(app)
      .put(`/api/v1/calendar/routines/${ROUTINE_ID}`)
      .set(authHeader)
      .send({
        academic_group: "RUET CSE 2nd Year Even A",
        entries: [
          {
            course_code: "CSE 2201",
            course_title: "Computer Algorithms",
            day_of_week: "Sunday",
            start_time: "10:15",
            end_time: "11:30",
            room: "301",
            instructor: "Dr. X",
            type: "CLASS",
            group_name: "All",
            confidence: "high",
            warnings: [],
          },
        ],
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await t.test("PUT /api/v1/calendar/routines/:id accepts camelCase entries for backwards compatibility", async () => {
    const res = await request(app)
      .put(`/api/v1/calendar/routines/${ROUTINE_ID}`)
      .set(authHeader)
      .send({
        title: "Updated Title",
        entries: [
          {
            courseCode: "CSE 2202",
            courseTitle: "Algorithms Lab",
            day: "Monday",
            startTime: "14:00",
            endTime: "16:30",
            type: "LAB",
          },
        ],
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await t.test("POST /api/v1/calendar/routines/:id/activate activates routine successfully", async () => {
    const res = await request(app)
      .post(`/api/v1/calendar/routines/${ROUTINE_ID}/activate`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.routine);
  });

  await t.test("POST /api/v1/calendar/routines/:id/share accepts both isPublic and is_public", async () => {
    const res1 = await request(app)
      .post(`/api/v1/calendar/routines/${ROUTINE_ID}/share`)
      .set(authHeader)
      .send({ isPublic: true });

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.success, true);
    assert.strictEqual(res1.body.is_public, true);

    const res2 = await request(app)
      .post(`/api/v1/calendar/routines/${ROUTINE_ID}/share`)
      .set(authHeader)
      .send({ is_public: false });

    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.success, true);
    assert.strictEqual(res2.body.is_public, false);
  });

  await t.test("POST /api/v1/calendar/routines (manual creation) succeeds with default academic group", async () => {
    const res = await request(app)
      .post("/api/v1/calendar/routines")
      .set(authHeader)
      .send({
        title: "My Custom Routine",
        entries: [
          {
            course_code: "MATH 2101",
            course_title: "Linear Algebra",
            day_of_week: "Tuesday",
            start_time: "09:00",
            end_time: "10:15",
          },
        ],
      });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.routine);
  });

  await t.test("POST /api/v1/calendar/routines/:id/overrides accepts camelCase fields", async () => {
    const res = await request(app)
      .post(`/api/v1/calendar/routines/${ROUTINE_ID}/overrides`)
      .set(authHeader)
      .send({
        routineEntryId: ENTRY_ID,
        customRoom: "Auditorium",
        customNotes: "Bring textbook",
      });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.override);
  });

  await t.test("POST /api/v1/calendar/events/exception accepts camelCase fields", async () => {
    const res = await request(app)
      .post("/api/v1/calendar/events/exception")
      .set(authHeader)
      .send({
        routineEntryId: ENTRY_ID,
        date: "2026-11-25",
        exceptionType: "cancelled",
        notes: "Teacher is on leave",
      });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.exception);
  });

  await t.test("POST /api/v1/calendar/routines/:id/validate accepts action & status", async () => {
    const resConfirm = await request(app)
      .post(`/api/v1/calendar/routines/${ROUTINE_ID}/validate`)
      .set(authHeader)
      .send({ action: "confirm" });

    assert.strictEqual(resConfirm.status, 200);
    assert.ok(resConfirm.body.validation);

    const resReport = await request(app)
      .post(`/api/v1/calendar/routines/${ROUTINE_ID}/validate`)
      .set(authHeader)
      .send({
        action: "report",
        reason: "Friday class has wrong time slot",
      });

    assert.strictEqual(resReport.status, 200);
    assert.ok(resReport.body.validation);
  });
});
