import { supabase } from "./supabase";
const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let refreshPromise: Promise<any> | null = null;
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token)
    headers.set("Authorization", `Bearer ${session.access_token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  
  if (res.status === 401 && session?.access_token) {
    if (!refreshPromise) {
      refreshPromise = supabase.auth.refreshSession().finally(() => {
        refreshPromise = null;
      });
    }
    const { data: refreshData, error: refreshError } = await refreshPromise;
    
    if (refreshData?.session?.access_token) {
      // Retry request with new token
      headers.set("Authorization", `Bearer ${refreshData.session.access_token}`);
      const retryRes = await fetch(`${BASE}${path}`, { ...init, headers });
      const retryText = await retryRes.text();
      const retryBody = retryText ? JSON.parse(retryText) : null;
      if (!retryRes.ok) throw new ApiError(retryRes.status, retryBody?.error ?? retryBody?.message ?? "Request failed");
      return retryBody as T;
    } else {
      // If refresh fails, sign out to clear state
      await supabase.auth.signOut();
    }
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      body?.error ?? body?.message ?? "Request failed",
    );
  return body as T;
}
export const qs = (
  obj: Record<string, string | number | boolean | undefined>,
) =>
  new URLSearchParams(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
