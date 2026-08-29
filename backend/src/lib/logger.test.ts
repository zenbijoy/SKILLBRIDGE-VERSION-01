import test from "node:test";
import assert from "node:assert";
import { REDACTED_KEYS, logger } from "./logger.js";
import { requestContext } from "./context.js";

test("Structured Logger and Redaction", async (t) => {
  await t.test("logger exposes standard log levels", () => {
    assert.strictEqual(typeof logger.info, "function");
    assert.strictEqual(typeof logger.warn, "function");
    assert.strictEqual(typeof logger.error, "function");
    assert.strictEqual(typeof logger.debug, "function");
    assert.strictEqual(typeof logger.fatal, "function");
  });

  await t.test("redacted keys list includes critical authentication secrets", () => {
    assert.ok(REDACTED_KEYS.includes("authorization"));
    assert.ok(REDACTED_KEYS.includes("cookie"));
    assert.ok(REDACTED_KEYS.includes("password"));
    assert.ok(REDACTED_KEYS.includes("token"));
    assert.ok(REDACTED_KEYS.includes("accessToken"));
    assert.ok(REDACTED_KEYS.includes("refreshToken"));
    assert.ok(REDACTED_KEYS.includes("serviceRoleKey"));
    assert.ok(REDACTED_KEYS.includes("secret"));
    assert.ok(REDACTED_KEYS.includes("otp"));
  });

  await t.test("requestContext properly isolates store across async execution", async () => {
    const testReqId = "test-req-uuid-1234";
    const testUserId = "user-uuid-5678";

    await requestContext.run({ requestId: testReqId, userId: testUserId }, async () => {
      assert.strictEqual(requestContext.getRequestId(), testReqId);
      assert.strictEqual(requestContext.getUserId(), testUserId);
    });

    assert.strictEqual(requestContext.getRequestId(), undefined);
  });
});
