import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";

test("Room Learn Section: Live Sessions, Session Requests & Real-Time Polls API Suite", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const USER_TEACHER = "11111111-1111-4111-8111-111111111111"; // Room Owner / Teacher
  const USER_STUDENT = "22222222-2222-4222-8222-222222222222"; // Room Member / Student
  const ROOM_ID = "33333333-3333-4333-8333-333333333333";
  const POLL_ID = "44444444-4444-4444-8444-444444444444";
  const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
  const SESSION_ID = "66666666-6666-4666-8666-666666666666";

  let activeUserId = USER_TEACHER;

  const createMockChain = (data: any = null, error: any = null) => {
    const chain: any = {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      not: () => chain,
      is: () => chain,
      limit: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({ data, error }),
      then: (resolve: any) => resolve({ data, error }),
    };
    return chain;
  };

  const authHeader = { Authorization: "Bearer valid_mock_token" };

  // ── 1. Live Polls ────────────────────────────────────────────────────────
  await t.test("POST /api/v1/rooms/:id/polls - Teacher can create time-selection poll", async () => {
    activeUserId = USER_TEACHER;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") {
          return createMockChain({ role: "teacher" });
        }
        if (table === "room_posts") {
          return createMockChain({
            id: POLL_ID,
            room_id: ROOM_ID,
            author_id: USER_TEACHER,
            type: "poll",
            title: "When should we hold the System Design Live Session?",
            body: "When should we hold the System Design Live Session?",
            metadata: {
              kind: "live_poll",
              poll_type: "time_selection",
              options: [
                { id: "opt_0", text: "Friday 7:00 PM", votes: 0 },
                { id: "opt_1", text: "Saturday 11:00 AM", votes: 0 },
                { id: "opt_2", text: "Sunday 4:00 PM", votes: 0 },
              ],
              total_votes: 0,
              is_open: true,
            },
          });
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/polls`)
      .set(authHeader)
      .send({
        question: "When should we hold the System Design Live Session?",
        options: ["Friday 7:00 PM", "Saturday 11:00 AM", "Sunday 4:00 PM"],
        pollType: "time_selection",
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.poll.title, "When should we hold the System Design Live Session?");
    assert.strictEqual(res.body.poll.metadata.poll_type, "time_selection");
    assert.strictEqual(res.body.poll.metadata.options.length, 3);
  });

  await t.test("POST /api/v1/rooms/:id/polls - Member (non-leader) cannot create poll", async () => {
    activeUserId = USER_STUDENT;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "member" });
        if (table === "rooms") return createMockChain({ owner_id: USER_TEACHER });
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/polls`)
      .set(authHeader)
      .send({
        question: "Unauthorized poll?",
        options: ["Yes", "No"],
      });

    assert.strictEqual(res.status, 403);
  });

  await t.test("GET /api/v1/rooms/:id/polls/active - Member gets active poll with their vote status", async () => {
    activeUserId = USER_STUDENT;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "member" });
        if (table === "room_posts") {
          return createMockChain([
            {
              id: POLL_ID,
              title: "When should we hold the session?",
              metadata: {
                is_open: true,
                poll_type: "time_selection",
                options: [
                  { id: "opt_0", text: "Friday 7:00 PM", votes: 2 },
                  { id: "opt_1", text: "Saturday 11:00 AM", votes: 5 },
                ],
                total_votes: 7,
              },
            },
          ]);
        }
        if (table === "room_poll_votes") {
          return createMockChain({ option_id: "opt_1" });
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/polls/active`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.poll.id, POLL_ID);
    assert.strictEqual(res.body.userVote, "opt_1");
  });

  await t.test("POST /api/v1/rooms/:id/polls/:pollId/vote - Member can cast vote on option", async () => {
    activeUserId = USER_STUDENT;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "member" });
        if (table === "room_posts") {
          return createMockChain({
            id: POLL_ID,
            metadata: {
              is_open: true,
              options: [
                { id: "opt_0", text: "Friday 7:00 PM", votes: 0 },
                { id: "opt_1", text: "Saturday 11:00 AM", votes: 0 },
              ],
            },
          });
        }
        if (table === "room_poll_votes") {
          return createMockChain([{ option_id: "opt_0" }]);
        }
        return createMockChain(null);
      },
      rpc: async () => ({ data: null, error: null }),
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/polls/${POLL_ID}/vote`)
      .set(authHeader)
      .send({ optionId: "opt_0" });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.userVote, "opt_0");
  });

  await t.test("PATCH /api/v1/rooms/:id/polls/:pollId/close - Leader can close poll and get winner", async () => {
    activeUserId = USER_TEACHER;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "teacher" });
        if (table === "room_posts") {
          return createMockChain({
            id: POLL_ID,
            metadata: {
              is_open: true,
              poll_type: "time_selection",
              options: [
                { id: "opt_0", text: "Friday 7:00 PM", votes: 3 },
                { id: "opt_1", text: "Saturday 11:00 AM", votes: 9 },
              ],
              total_votes: 12,
            },
          });
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/polls/${POLL_ID}/close`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.winningOption.id, "opt_1");
    assert.strictEqual(res.body.winningOption.text, "Saturday 11:00 AM");
  });

  // ── 2. Member Session Requests ───────────────────────────────────────────
  await t.test("POST /api/v1/rooms/:id/session-requests - Member can request a Voice session", async () => {
    activeUserId = USER_STUDENT;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "member" });
        if (table === "room_session_requests") {
          return createMockChain({
            id: REQUEST_ID,
            room_id: ROOM_ID,
            user_id: USER_STUDENT,
            title: "Microservices Architecture Deep Dive",
            description: "Can we have an open audio discussion on event-driven queues?",
            session_type: "voice",
            preferred_time_note: "Saturday evening",
            status: "pending",
            profiles: { id: USER_STUDENT, full_name: "Student Two", username: "student2" },
          });
        }
        if (table === "rooms") return createMockChain({ owner_id: USER_TEACHER, title: "Backend Masters" });
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/session-requests`)
      .set(authHeader)
      .send({
        title: "Microservices Architecture Deep Dive",
        description: "Can we have an open audio discussion on event-driven queues?",
        sessionType: "voice",
        preferredTimeNote: "Saturday evening",
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.request.title, "Microservices Architecture Deep Dive");
    assert.strictEqual(res.body.request.session_type, "voice");
    assert.strictEqual(res.body.request.status, "pending");
  });

  await t.test("POST /api/v1/rooms/:id/session-requests/:requestId/upvote - Members can upvote requests", async () => {
    activeUserId = USER_STUDENT;
    let upvoted = false;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "member" });
        if (table === "room_session_request_upvotes") {
          const chain = createMockChain(null);
          chain.select = () => chain;
          chain.maybeSingle = () => Promise.resolve({ data: null, error: null }); // Not upvoted yet
          chain.insert = () => {
            upvoted = true;
            return chain;
          };
          chain.then = (res: any) => res({ count: 4, data: null });
          return chain;
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/session-requests/${REQUEST_ID}/upvote`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.upvoted, true);
  });

  // ── 3. Teacher Scheduling Live Sessions (Voice, Offline, Video) ───────────
  await t.test("POST /api/v1/rooms/:id/classes - Teacher schedules Offline campus session", async () => {
    activeUserId = USER_TEACHER;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "teacher" });
        if (table === "rooms") return createMockChain({ owner_id: USER_TEACHER, title: "Backend Masters" });
        if (table === "sessions") {
          return createMockChain({
            id: SESSION_ID,
            room_id: ROOM_ID,
            teacher_id: USER_TEACHER,
            title: "Hands-on System Design Workshop",
            mode: "offline",
            media: "audio",
            session_type: "offline",
            campus_location: "Science Building Room 402",
            status: "scheduled",
            starts_at: new Date(Date.now() + 86400000).toISOString(),
          });
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/classes`)
      .set(authHeader)
      .send({
        title: "Hands-on System Design Workshop",
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        session_type: "offline",
        campus_location: "Science Building Room 402",
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.session.session_type, "offline");
    assert.strictEqual(res.body.session.campus_location, "Science Building Room 402");
  });

  await t.test("POST /api/v1/rooms/:id/classes - Teacher schedules Video session approving member request", async () => {
    activeUserId = USER_TEACHER;
    let requestApproved = false;
    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "owner" });
        if (table === "rooms") return createMockChain({ owner_id: USER_TEACHER, title: "Backend Masters" });
        if (table === "room_session_requests") {
          const chain = createMockChain(null);
          chain.update = () => {
            requestApproved = true;
            return chain;
          };
          return chain;
        }
        if (table === "sessions") {
          return createMockChain({
            id: SESSION_ID,
            room_id: ROOM_ID,
            teacher_id: USER_TEACHER,
            title: "Microservices Architecture Deep Dive",
            mode: "online",
            media: "video",
            session_type: "video",
            status: "scheduled",
            starts_at: new Date(Date.now() + 86400000).toISOString(),
          });
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/classes`)
      .set(authHeader)
      .send({
        title: "Microservices Architecture Deep Dive",
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        session_type: "video",
        requestId: REQUEST_ID,
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.session.session_type, "video");
    assert.strictEqual(requestApproved, true);
  });

  await t.test("POST /api/v1/rooms/:id/polls/:pollId/announce - Leader broadcasts poll result to room chat", async () => {
    activeUserId = USER_TEACHER;
    const CONV_ID = "77777777-7777-4777-8777-777777777777";
    let messageInserted = false;

    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "teacher" });
        if (table === "room_posts") {
          return createMockChain({
            id: POLL_ID,
            title: "Live Session Timing Vote",
            metadata: {
              kind: "live_poll",
              winning_option: { id: "opt_1", text: "Saturday 11:00 AM", votes: 8 },
              options: [{ id: "opt_1", text: "Saturday 11:00 AM", votes: 8 }],
              total_votes: 8,
              is_open: false,
            },
          });
        }
        if (table === "rooms") {
          return createMockChain({ conversation_id: CONV_ID, title: "Algorithms Masterclass" });
        }
        if (table === "messages") {
          messageInserted = true;
          return createMockChain({
            id: "88888888-8888-4888-8888-888888888888",
            conversation_id: CONV_ID,
            sender_id: USER_TEACHER,
            body: "📢 **Live Poll Closed**\n**Question:** Live Session Timing Vote\n🏆 **Winning Decision:** Saturday 11:00 AM (8 votes)",
          });
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/polls/${POLL_ID}/announce`)
      .set(authHeader)
      .send();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(messageInserted, true);
  });

  await t.test("PATCH /api/v1/rooms/:id/classes/:sessionId - Teacher can edit scheduled session", async () => {
    activeUserId = USER_TEACHER;
    let sessionUpdated = false;

    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "teacher" });
        if (table === "rooms") return createMockChain({ owner_id: USER_TEACHER });
        if (table === "sessions") {
          sessionUpdated = true;
          return createMockChain({
            id: SESSION_ID,
            room_id: ROOM_ID,
            title: "Updated Voice Q&A Live Session",
            session_type: "voice",
            starts_at: new Date(Date.now() + 172800000).toISOString(),
            status: "scheduled",
          });
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/classes/${SESSION_ID}`)
      .set(authHeader)
      .send({
        title: "Updated Voice Q&A Live Session",
        session_type: "voice",
        starts_at: new Date(Date.now() + 172800000).toISOString(),
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(sessionUpdated, true);
    assert.strictEqual(res.body.session.session_type, "voice");
  });

  await t.test("DELETE /api/v1/rooms/:id/classes/:sessionId - Teacher can cancel/delete session", async () => {
    activeUserId = USER_TEACHER;
    let sessionDeleted = false;

    const mockAdmin: any = {
      from: (table?: string) => {
        if (table === "room_members") return createMockChain({ role: "teacher" });
        if (table === "rooms") return createMockChain({ owner_id: USER_TEACHER });
        if (table === "sessions") {
          sessionDeleted = true;
          return createMockChain({ id: SESSION_ID });
        }
        return createMockChain(null);
      },
      auth: {
        getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
      },
    };
    setAdminClient(mockAdmin as any);

    const res = await request(app)
      .delete(`/api/v1/rooms/${ROOM_ID}/classes/${SESSION_ID}`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(sessionDeleted, true);
  });
});
