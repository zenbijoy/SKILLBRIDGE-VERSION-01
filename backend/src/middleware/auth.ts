import type { NextFunction, Request, Response } from "express";
import { admin } from "../lib/db.js";
export async function auth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer "))
    return res.status(401).json({ error: "Authentication required" });
  const token = h.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user)
    return res.status(401).json({ error: "Invalid session" });
  req.userId = data.user.id;
  req.accessToken = token;
  const { data: p } = await admin
    .from("profiles")
    .select("roles, account_status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (p) {
    if (p.account_status === "suspended" || p.account_status === "banned") {
      return res.status(403).json({ error: `Account is ${p.account_status}` });
    }
    if (p.account_status === "deactivated") {
      if (!req.originalUrl.endsWith("/account/reactivate")) {
        return res.status(403).json({ error: "Account is deactivated. Reactivation required." });
      }
    }
  }

  req.userRoles = p?.roles ?? ["student"];
  next();
}
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) =>
    req.userRoles?.some((r) => roles.includes(r))
      ? next()
      : res.status(403).json({ error: "Insufficient role" });
}
