import { pinoHttp } from "pino-http";
import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

const isTest = env.NODE_ENV === "test";

export const httpLogger = pinoHttp({
  logger,
  autoLogging: !isTest,
  genReqId: (req: Request) => req.id || req.requestId,
  customLogLevel: (req: Request, res: Response, err?: Error) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    const path = req.path || req.url || "";
    if (path === "/health" || path === "/api/v1/health" || path.startsWith("/socket.io")) {
      return "debug";
    }
    return "info";
  },
  customSuccessMessage: (req: Request, res: Response, responseTime: number) => {
    return `${req.method} ${req.originalUrl || req.url} completed with ${res.statusCode} in ${responseTime}ms`;
  },
  customErrorMessage: (req: Request, res: Response, err: Error) => {
    return `${req.method} ${req.originalUrl || req.url} failed with ${res.statusCode}: ${err.message}`;
  },
  customAttributeKeys: {
    req: "req",
    res: "res",
    err: "err",
    responseTime: "responseTime",
  },
  serializers: {
    req: (req: any) => ({
      id: req.id || req.requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      userId: req.raw?.userId,
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
    }),
  },
});

export default httpLogger;
