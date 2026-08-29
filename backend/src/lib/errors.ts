export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_CONFLICT"
  | "RATE_LIMIT_EXCEEDED"
  | "DATABASE_ERROR"
  | "EXTERNAL_SERVICE_ERROR"
  | "INTERNAL_SERVER_ERROR"
  | "MAINTENANCE_MODE";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      statusCode?: number;
      isOperational?: boolean;
      details?: unknown;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? "INTERNAL_SERVER_ERROR";
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    if (options.cause) {
      this.cause = options.cause;
    }
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      isOperational: true,
      details,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", details?: unknown) {
    super(message, {
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
      isOperational: true,
      details,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions", details?: unknown) {
    super(message, {
      code: "FORBIDDEN",
      statusCode: 403,
      isOperational: true,
      details,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(message, {
      code: "RESOURCE_NOT_FOUND",
      statusCode: 404,
      isOperational: true,
      details,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", details?: unknown) {
    super(message, {
      code: "RESOURCE_CONFLICT",
      statusCode: 409,
      isOperational: true,
      details,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.", details?: unknown) {
    super(message, {
      code: "RATE_LIMIT_EXCEEDED",
      statusCode: 429,
      isOperational: true,
      details,
    });
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal server error", details?: unknown) {
    super(message, {
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
      isOperational: false,
      details,
    });
  }
}
