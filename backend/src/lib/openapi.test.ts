import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { getOpenApiSpec } from "./openapi.js";
import { createApp } from "../app.js";

test("OpenAPI and Documentation Endpoints", async (t) => {
  await t.test("getOpenApiSpec returns valid OpenAPI 3.1 structure", () => {
    const spec = getOpenApiSpec();
    assert.strictEqual(spec.openapi, "3.1.0");
    assert.strictEqual(spec.info.title, "SkillBridge API");
    assert.strictEqual(spec.info.version, "2.0.0");
    assert.ok(spec.components.securitySchemes.bearerAuth);
    assert.ok(spec.paths["/health"]);
    assert.ok(spec.paths["/dashboard"]);
  });

  await t.test("GET /openapi.json returns machine-readable spec", async () => {
    const app = createApp();
    const res = await request(app).get("/openapi.json");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.openapi, "3.1.0");
    assert.strictEqual(res.body.info.title, "SkillBridge API");
  });

  await t.test("GET /api-docs returns HTML documentation UI", async () => {
    const app = createApp();
    const res = await request(app).get("/api-docs");
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("SwaggerUIBundle"));
    assert.ok(res.text.includes("/openapi.json"));
  });

  await t.test("Responses include X-Request-ID correlation header", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers["x-request-id"]);
    assert.ok(res.headers["x-request-id"].length > 0);
  });

  await t.test("Reuses incoming X-Request-ID if provided", async () => {
    const app = createApp();
    const customReqId = "custom-client-request-id-9988";
    const res = await request(app).get("/health").set("X-Request-ID", customReqId);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers["x-request-id"], customReqId);
  });
});
