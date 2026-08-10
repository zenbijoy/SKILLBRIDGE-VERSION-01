import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}
export function errors(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({ error: "Validation failed", issues: err.flatten() });
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
