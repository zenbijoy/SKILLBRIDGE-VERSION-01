import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";

test("Room Assignments & Homework Submissions Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);
  const fakeRoomId = "00000000-0000-0000-0000-000000000001";
  const fakeAssignmentId = "00000000-0000-0000-0000-000000000002";
  const fakeSubId = "00000000-0000-0000-0000-000000000003";

  await t.test("GET /api/v1/rooms/:id/assignments - returns 401 without auth", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/assignments`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/assignments - returns 401 without auth", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/assignments`).send({
      title: "Calculus Homework",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/assignments/:assignmentId/upload-ticket - returns 401 without auth", async () => {
    const res = await request
      .post(`/api/v1/rooms/${fakeRoomId}/assignments/${fakeAssignmentId}/upload-ticket`)
      .send({
        filename: "solution.pdf",
        contentType: "application/pdf",
      });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/assignments/:assignmentId/submit - returns 401 without auth", async () => {
    const res = await request
      .post(`/api/v1/rooms/${fakeRoomId}/assignments/${fakeAssignmentId}/submit`)
      .send({
        fileUrl: "https://r2.test/sol.pdf",
        storagePath: "assignments/user/sol.pdf",
      });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/assignments/:assignmentId/submissions - returns 401 without auth", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/assignments/${fakeAssignmentId}/submissions`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/rooms/:id/assignments/:assignmentId/submissions/:subId/grade - returns 401 without auth", async () => {
    const res = await request
      .patch(`/api/v1/rooms/${fakeRoomId}/assignments/${fakeAssignmentId}/submissions/${fakeSubId}/grade`)
      .send({ grade: 95, feedback: "Great work!" });
    assert.strictEqual(res.status, 401);
  });
});

test("Authenticated Assignment Lifecycle & R2 Submissions", async (t) => {
  const { setAdminClient } = await import("../lib/db.js");
  const { createApp } = await import("../app.js");
  const app = createApp();
  const request = supertest(app);

  const TEACHER_USER = "11111111-1111-4111-8111-111111111111";
  const STUDENT_USER = "22222222-2222-4222-8222-222222222222";
  const ROOM_ID = "33333333-3333-4333-8333-333333333333";
  const ASSIGNMENT_ID = "44444444-4444-4444-8444-444444444444";
  const SUBMISSION_ID = "55555555-5555-4555-8555-555555555555";

  let currentUserId = TEACHER_USER;

  const createMockChain = (data: any = null, error: any = null) => {
    const chain: any = {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
      eq: () => chain,
      in: () => chain,
      limit: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({ data, error }),
      then: (resolve: any) => resolve({ data, error }),
    };
    return chain;
  };

  const mockAdmin: any = {
    from: () => createMockChain(),
    auth: {
      getUser: async () => ({ data: { user: { id: currentUserId, role: "authenticated" } }, error: null }),
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://r2.test/download_hw.pdf" }, error: null }),
        createSignedUploadUrl: async () => ({ data: { signedUrl: "https://r2.test/upload", path: "test.pdf" }, error: null }),
      }),
    },
  };

  setAdminClient(mockAdmin);
  const authHeader = { Authorization: "Bearer valid_test_token" };

  await t.test("POST /rooms/:id/assignments - teacher can create homework assignment", async () => {
    currentUserId = TEACHER_USER;
    const mockAssignment = {
      id: ASSIGNMENT_ID,
      room_id: ROOM_ID,
      creator_id: TEACHER_USER,
      title: "Calculus Problem Set 1",
      description: "Complete problems 1 to 10 on page 42.",
      total_points: 100,
      due_date: new Date(Date.now() + 86400000 * 3).toISOString(),
      status: "active",
      creator: { full_name: "Prof. Newton" },
    };

    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "room_assignments") return createMockChain(mockAssignment);
      return createMockChain();
    };

    const res = await request
      .post(`/api/v1/rooms/${ROOM_ID}/assignments`)
      .set(authHeader)
      .send({
        title: "Calculus Problem Set 1",
        description: "Complete problems 1 to 10 on page 42.",
        totalPoints: 100,
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.assignment.title, "Calculus Problem Set 1");
    assert.strictEqual(res.body.assignment.total_points, 100);
  });

  await t.test("POST /rooms/:id/assignments - rejects creation by plain student", async () => {
    currentUserId = STUDENT_USER;
    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "member" });
      if (table === "rooms") return createMockChain({ owner_id: TEACHER_USER });
      return createMockChain();
    };

    const res = await request
      .post(`/api/v1/rooms/${ROOM_ID}/assignments`)
      .set(authHeader)
      .send({
        title: "Unauthorized Assignment",
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      });

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /Only teachers/i);
  });

  await t.test("POST /rooms/:id/assignments/:assignmentId/upload-ticket - student gets R2 50MB ticket", async () => {
    currentUserId = STUDENT_USER;
    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "member" });
      return createMockChain();
    };

    const res = await request
      .post(`/api/v1/rooms/${ROOM_ID}/assignments/${ASSIGNMENT_ID}/upload-ticket`)
      .set(authHeader)
      .send({
        filename: "student_solution.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 25 * 1024 * 1024, // 25MB
      });

    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body.url === "string");
    assert.strictEqual(res.body.maxSizeBytes, 52428800);
  });

  await t.test("POST /rooms/:id/assignments/:assignmentId/submit - student submits homework", async () => {
    currentUserId = STUDENT_USER;
    const mockSubmission = {
      id: SUBMISSION_ID,
      assignment_id: ASSIGNMENT_ID,
      room_id: ROOM_ID,
      student_id: STUDENT_USER,
      file_url: "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/hw.pdf",
      storage_path: "assignments/student/hw.pdf",
      file_name: "student_solution.pdf",
      status: "submitted",
    };

    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "member" });
      if (table === "room_assignments") return createMockChain({ id: ASSIGNMENT_ID, status: "active" });
      if (table === "room_assignment_submissions") return createMockChain(mockSubmission);
      return createMockChain();
    };

    const res = await request
      .post(`/api/v1/rooms/${ROOM_ID}/assignments/${ASSIGNMENT_ID}/submit`)
      .set(authHeader)
      .send({
        fileUrl: "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/hw.pdf",
        storagePath: "assignments/student/hw.pdf",
        fileName: "student_solution.pdf",
        studentNotes: "Completed all parts including extra credit.",
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.submission.id, SUBMISSION_ID);
    assert.strictEqual(res.body.submission.status, "submitted");
  });

  await t.test("GET /rooms/:id/assignments/:assignmentId/submissions - teacher views all submissions", async () => {
    currentUserId = TEACHER_USER;
    const mockRoster = [
      {
        id: SUBMISSION_ID,
        student_id: STUDENT_USER,
        status: "submitted",
        student: { full_name: "Ada Lovelace" },
      },
    ];

    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "room_assignment_submissions") return createMockChain(mockRoster);
      return createMockChain();
    };

    const res = await request
      .get(`/api/v1/rooms/${ROOM_ID}/assignments/${ASSIGNMENT_ID}/submissions`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.submissions.length, 1);
    assert.strictEqual(res.body.submissions[0].student.full_name, "Ada Lovelace");
  });

  await t.test("PATCH /rooms/:id/assignments/:assignmentId/submissions/:subId/grade - teacher grades submission", async () => {
    currentUserId = TEACHER_USER;
    const mockGraded = {
      id: SUBMISSION_ID,
      student_id: STUDENT_USER,
      grade: 96,
      feedback: "Exceptional rigor and handwritten diagrams!",
      status: "graded",
    };

    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "room_assignment_submissions") return createMockChain(mockGraded);
      return createMockChain();
    };

    const res = await request
      .patch(`/api/v1/rooms/${ROOM_ID}/assignments/${ASSIGNMENT_ID}/submissions/${SUBMISSION_ID}/grade`)
      .set(authHeader)
      .send({
        grade: 96,
        feedback: "Exceptional rigor and handwritten diagrams!",
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.submission.grade, 96);
    assert.strictEqual(res.body.submission.status, "graded");
  });

  await t.test("GET /rooms/:id/assignments/:assignmentId/submissions/:subId/download - student downloads signed URL", async () => {
    currentUserId = STUDENT_USER;
    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "member" });
      if (table === "room_assignment_submissions") {
        return createMockChain({
          id: SUBMISSION_ID,
          student_id: STUDENT_USER,
          storage_path: "assignments/student/hw.pdf",
        });
      }
      return createMockChain();
    };

    const res = await request
      .get(`/api/v1/rooms/${ROOM_ID}/assignments/${ASSIGNMENT_ID}/submissions/${SUBMISSION_ID}/download`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body.url === "string");
  });
});
