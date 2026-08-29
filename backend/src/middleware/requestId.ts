import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { requestContext } from "../lib/context.js";

const REQUEST_ID_HEADER = "X-Request-ID";

function isValidRequestId(id: unknown): id is string {
  return typeof id === "string" && id.trim().length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id.trim());
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingHeader = req.header(REQUEST_ID_HEADER) || req.header("x-request-id");
  const id = isValidRequestId(incomingHeader) ? incomingHeader.trim() : randomUUID();

  req.id = id;
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);

  requestContext.run(
    {
      requestId: id,
      method: req.method,
      route: req.path,
    },
    next,
  );
}

export default requestIdMiddleware;
