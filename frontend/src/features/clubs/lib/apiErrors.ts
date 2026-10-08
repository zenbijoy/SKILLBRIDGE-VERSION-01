import { ApiError } from "@/lib/api";

export function clubErrorMessage(e: unknown, t: (key: string, fallback?: string) => string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return t("common.sessionExpired", "Session expired. Please log in again.");
    if (e.status === 403) return t("clubs.errors.forbidden", "You do not have permission for this action — club officers only.");
    if (e.status === 404) return t("clubs.errors.notFound", "Club or resource not found.");
    if (e.status === 429) return t("common.tooManyRequests", "Too many requests. Please wait a moment.");
    if (e.status === 400) return e.message || t("common.validation", "Invalid request input.");
    if (e.status === 0) return t("common.offline", "Network connection lost. Please check your internet.");
    if (e.message) return e.message;
  }
  if (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  return t("common.genericError", "Something went wrong. Please try again.");
}
