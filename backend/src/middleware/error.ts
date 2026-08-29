import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

export function notFound(req: Request, res: Response) {
  if (res.headersSent) return;
  const requestId = req.id || req.requestId || (res.getHeader("X-Request-ID") as string);
  res.status(404).json({
    success: false,
    error: "Not found",
    code: "RESOURCE_NOT_FOUND",
    message: `Cannot ${req.method} ${req.originalUrl || req.path}`,
    requestId,
  });
}

export function errors(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (res.headersSent) {
    logger.error(
      {
        event: "error_headers_already_sent",
        err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
        requestId: req.id || req.requestId,
        path: req.originalUrl || req.path,
      },
      "Headers already sent, cannot send error response",
    );
    return;
  }

  const requestId = req.id || req.requestId || (res.getHeader("X-Request-ID") as string);
  const isProduction = env.NODE_ENV === "production";

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const issues = err.flatten();
    logger.warn(
      {
        event: "validation_error",
        requestId,
        path: req.originalUrl || req.path,
        issues,
      },
      "Request validation failed",
    );
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      issues,
      requestId,
    });
  }

  // Handle AppError and its subclasses
  if (err instanceof AppError) {
    const logMethod = err.statusCode >= 500 ? "error" : "warn";
    logger[logMethod](
      {
        event: "application_error",
        code: err.code,
        statusCode: err.statusCode,
        isOperational: err.isOperational,
        requestId,
        path: req.originalUrl || req.path,
        details: err.details,
        err: err.statusCode >= 500 ? { message: err.message, stack: isProduction ? undefined : err.stack } : undefined,
      },
      err.message,
    );

    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      message: err.message,
      requestId,
      ...(err.details && !isProduction ? { details: err.details } : {}),
    });
  }

  // Handle body-parser JSON syntax error
  if (err instanceof SyntaxError && "status" in err && (err as any).status === 400 && "body" in err) {
    logger.warn(
      {
        event: "malformed_json_payload",
        requestId,
        path: req.originalUrl || req.path,
      },
      "Malformed JSON payload received",
    );
    return res.status(400).json({
      success: false,
      error: "Malformed JSON payload",
      code: "VALIDATION_ERROR",
      message: "Invalid JSON format in request body",
      requestId,
    });
  }

  // Unhandled / unexpected errors
  const message = isProduction ? "Internal server error" : (err as Error)?.message || "Internal server error";
  logger.error(
    {
      event: "unhandled_request_error",
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
      requestId,
      path: req.originalUrl || req.path,
      method: req.method,
    },
    "Unhandled request error",
  );

  return res.status(500).json({
    success: false,
    error: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
    message,
    requestId,
    ...(!isProduction && err instanceof Error ? { stack: err.stack } : {}),
  });
}

export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
