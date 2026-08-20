import test from "node:test";
import assert from "node:assert";
import request from "supertest";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test_anon_key_123456789";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_key_123456789";
process.env.WEB_ORIGINS = "http://localhost";
process.env.NODE_ENV = "test";

test("Chat and Messaging Tests", async (t) => {
  const { app } = await import("../server.js");
  const { setAdminClient } = await import("../lib/db.js");

  const USER_A = "11111111-1111-4111-8111-111111111111"; // user
  const CONVERSATION_ID = "77777777-7777-4777-8777-777777777777";
  const MESSAGE_ID = "88888888-8888-4888-8888-888888888888";
  
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
      or: () => chain,
      match: () => chain,
    };
    return chain;
  };

  const mockAdmin = {
    from: (table?: string) => createMockChain(),
    auth: {
      getUser: async () => ({ data: { user: { id: USER_A, role: "authenticated" } }, error: null }),
    },
  };
  setAdminClient(mockAdmin as any);

  const authHeader = { Authorization: "Bearer valid_mock_token" };

  await t.test("PATCH /chat/conversations/:id/read - updates last_read_message_id", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "conversation_members") {
        return createMockChain({ user_id: USER_A, conversation_id: CONVERSATION_ID, last_read_message_id: MESSAGE_ID });
      }
      return createMockChain();
    };

    const res = await request(app)
      .patch(`/api/v1/chat/conversations/${CONVERSATION_ID}/read`)
      .set(authHeader)
      .send({ message_id: MESSAGE_ID });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.last_read_message_id, MESSAGE_ID);
  });

  await t.test("PATCH /chat/messages/:id/status - updates delivery_status", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "messages") {
        return createMockChain({ id: MESSAGE_ID, conversation_id: CONVERSATION_ID, delivery_status: "read" });
      }
      if (table === "conversation_members") {
        return createMockChain({ role: "member" });
      }
      return createMockChain();
    };

    const res = await request(app)
      .patch(`/api/v1/chat/messages/${MESSAGE_ID}/status`)
      .set(authHeader)
      .send({ status: "read" });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.delivery_status, "read");
  });

  await t.test("POST /chat/messages/:id/reactions - adds a reaction", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "message_reactions") {
        return createMockChain({ message_id: MESSAGE_ID, user_id: USER_A, reaction: "👍" });
      }
      if (table === "messages") {
        return createMockChain({ conversation_id: CONVERSATION_ID });
      }
      if (table === "conversation_members") {
        return createMockChain({ id: "cm-1", conversation_id: CONVERSATION_ID, user_id: USER_A });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/chat/messages/${MESSAGE_ID}/reactions`)
      .set(authHeader)
      .send({ reaction: "👍" });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.reaction, "👍");
  });

  await t.test("DELETE /chat/messages/:id - soft deletes a message", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "messages") {
        return createMockChain({ id: MESSAGE_ID, soft_deleted: true, conversation_id: CONVERSATION_ID });
      }
      return createMockChain();
    };

    const res = await request(app)
      .delete(`/api/v1/chat/messages/${MESSAGE_ID}`)
      .set(authHeader);

    assert.strictEqual(res.status, 204);
  });
});
