import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import express from "express";
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
} from "./errors.js";
import { errors, notFound } from "../middleware/error.js";
import { requestIdMiddleware } from "../middleware/requestId.js";

test("Central Error Architecture", async (t) => {
  await t.test("AppError subclasses construct with accurate status codes and codes", () => {
    const valErr = new ValidationError("Invalid field");
    assert.strictEqual(valErr.statusCode, 400);
    assert.strictEqual(valErr.code, "VALIDATION_ERROR");
    assert.strictEqual(valErr.isOperational, true);

    const authErr = new UnauthorizedError();
    assert.strictEqual(authErr.statusCode, 401);
    assert.strictEqual(authErr.code, "AUTHENTICATION_REQUIRED");

    const forbidErr = new ForbiddenError();
    assert.strictEqual(forbidErr.statusCode, 403);
    assert.strictEqual(forbidErr.code, "FORBIDDEN");

    const notFoundErr = new NotFoundError();
    assert.strictEqual(notFoundErr.statusCode, 404);
    assert.strictEqual(notFoundErr.code, "RESOURCE_NOT_FOUND");

    const conflictErr = new ConflictError();
    assert.strictEqual(conflictErr.statusCode, 409);
    assert.strictEqual(conflictErr.code, "RESOURCE_CONFLICT");

    const rateLimitErr = new RateLimitError();
    assert.strictEqual(rateLimitErr.statusCode, 429);
    assert.strictEqual(rateLimitErr.code, "RATE_LIMIT_EXCEEDED");

    const internalErr = new InternalServerError();
    assert.strictEqual(internalErr.statusCode, 500);
    assert.strictEqual(internalErr.code, "INTERNAL_SERVER_ERROR");
    assert.strictEqual(internalErr.isOperational, false);
  });

  await t.test("Error middleware serializes AppError with requestId and code", async () => {
    const testApp = express();
    testApp.use(requestIdMiddleware);
    testApp.get("/test-custom-error", () => {
      throw new ValidationError("Username already taken", { field: "username" });
    });
    testApp.use(errors);

    const res = await request(testApp).get("/test-custom-error");
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.code, "VALIDATION_ERROR");
    assert.strictEqual(res.body.error, "Username already taken");
    assert.ok(res.body.requestId);
    assert.strictEqual(res.headers["x-request-id"], res.body.requestId);
  });

  await t.test("NotFound handler returns standardized 404 response with requestId", async () => {
    const testApp = express();
    testApp.use(requestIdMiddleware);
    testApp.use(notFound);

    const res = await request(testApp).get("/non-existent-endpoint");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.code, "RESOURCE_NOT_FOUND");
    assert.strictEqual(res.body.error, "Not found");
    assert.ok(res.body.requestId);
  });
});
