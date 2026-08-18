import { supabase } from "./supabase";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshPromise: Promise<any> | null = null;

function isFormData(body: BodyInit | null | undefined) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

async function parseResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function requestWithHeaders(path: string, init: RequestInit, accessToken?: string) {
  const headers = new Headers(init.headers);
  if (init.body && !isFormData(init.body)) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(`${BASE}${path}`, { ...init, headers });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  let res = await requestWithHeaders(path, init, session?.access_token);

  if (res.status === 401 && session?.access_token) {
    if (!refreshPromise) {
      refreshPromise = supabase.auth.refreshSession().finally(() => {
        refreshPromise = null;
      });
    }
    const { data: refreshData } = await refreshPromise;
    if (refreshData?.session?.access_token) {
      res = await requestWithHeaders(path, init, refreshData.session.access_token);
    } else {
      await supabase.auth.signOut();
    }
  }

  const body = await parseResponse(res);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? body?.message ?? "Request failed");
  }
  return body as T;
}

export const qs = (obj: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString();
