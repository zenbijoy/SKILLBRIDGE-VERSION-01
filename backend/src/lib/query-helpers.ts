/**
 * query-helpers.ts — Safe Supabase query builder utilities
 *
 * Prevents PostgREST filter injection by strictly validating values
 * before interpolating them into `.or()` filter strings.
 */

import { admin } from "./db.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Assert that a value is a valid UUID v4 string.
 * Throws if the format is wrong — this is a defense-in-depth guard
 * against accidentally interpolating user input into PostgREST filters.
 */
export function assertUuid(value: string, label = "value"): string {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} is not a valid UUID`);
  }
  return value;
}

/**
 * Check whether a bidirectional block exists between two users.
 * Returns true if either user has blocked the other.
 */
export async function isBlocked(userA: string, userB: string): Promise<boolean> {
  assertUuid(userA, "userA");
  assertUuid(userB, "userB");

  const { data } = await admin
    .from("blocks")
    .select("id")
    .or(
      `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`,
    )
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/**
 * Build a safe `.or()` filter string for "either direction" lookups
 * on two UUID columns (e.g. user_a/user_b or blocker_id/blocked_id).
 */
export function bidirectionalFilter(
  colA: string,
  colB: string,
  valA: string,
  valB: string,
): string {
  assertUuid(valA, colA);
  assertUuid(valB, colB);
  return `and(${colA}.eq.${valA},${colB}.eq.${valB}),and(${colA}.eq.${valB},${colB}.eq.${valA})`;
}

/**
 * Build a safe `.or()` filter for a single user appearing in either of two columns.
 */
export function eitherColumnFilter(colA: string, colB: string, userId: string): string {
  assertUuid(userId, "userId");
  return `${colA}.eq.${userId},${colB}.eq.${userId}`;
}

/**
 * Sanitize a user-supplied string for safe use in Supabase `.ilike()` filters.
 * Strips PostgREST-special characters that could alter filter semantics.
 */
export function sanitizeIlike(input: string): string {
  return input.replace(/[%_\\,()]/g, "").trim();
}
