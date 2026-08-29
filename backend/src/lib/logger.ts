import pino, { type Logger, type LoggerOptions } from "pino";
import { env } from "../config/env.js";
import { requestContext } from "./context.js";

const isProduction = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";

const defaultLogLevel = isTest ? "silent" : isProduction ? "info" : "debug";
const logLevel = env.LOG_LEVEL || defaultLogLevel;

export const REDACTED_KEYS = [
  "authorization",
  "cookie",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "serviceRoleKey",
  "secret",
  "otp",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.serviceRoleKey",
  "*.secret",
  "*.otp",
  "*.newPassword",
  "*.currentPassword",
  "*.confirmPassword",
];

const pinoOptions: LoggerOptions = {
  level: logLevel,
  redact: {
    paths: REDACTED_KEYS,
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const store = requestContext.getStore();
    if (!store) return {};
    return {
      requestId: store.requestId,
      ...(store.userId ? { userId: store.userId } : {}),
      ...(store.route ? { route: store.route } : {}),
    };
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
};

export const logger: Logger = pino(pinoOptions);

export default logger;
