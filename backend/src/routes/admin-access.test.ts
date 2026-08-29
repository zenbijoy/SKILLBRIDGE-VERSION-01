import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";
import { admin } from "../lib/db.js";
import { env } from "../config/env.js";

import { setAdminClient } from "../lib/db.js";

const app = createApp();

describe("Admin Access Routes", () => {
  beforeEach(() => {
    // Basic reset if necessary
  });

  describe("GET /api/v1/admin/bootstrap/status", () => {
    it("returns disabled if bootstrap is disabled", async () => {
      env.ADMIN_BOOTSTRAP_ENABLED = false;
      const res = await request(app).get("/api/v1/admin/bootstrap/status");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "disabled");
    });
  });
  
  describe("GET /api/v1/admin/me", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app).get("/api/v1/admin/me");
      assert.strictEqual(res.status, 401);
    });

    it("returns admin status for authenticated owner", async () => {
      // Mock auth.getUser
      const getUserMock = mock.fn(async () => ({
        data: { user: { id: "user-1", factors: [] } },
        error: null
      }));
      admin.auth.getUser = getUserMock as any;

      // Mock profiles & admin_accounts
      const fromMock = mock.fn((table?: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { roles: ["admin"], account_status: "active" }, error: null }),
              }),
            }),
          };
        }
        if (table === "admin_accounts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "owner", status: "active", must_change_credentials: true, mfa_required: true },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      });

      setAdminClient({
        auth: { getUser: getUserMock },
        from: fromMock,
      } as any);

      const res = await request(app)
        .get("/api/v1/admin/me")
        .set("Authorization", "Bearer token123");
        
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.role, "owner");
      assert.strictEqual(res.body.mustChangeCredentials, true);
    });
  });
});
