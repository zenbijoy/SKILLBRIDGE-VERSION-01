import { supabase } from "./supabase";
import Constants from "expo-constants";
import { usePreferencesStore } from "@/state/usePreferencesStore";

import { API_URL } from "./config";

const BASE = API_URL;


type ApiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  requestId?: string;
  issues?: unknown;
};

export class ApiError extends Error {
  public code?: string;
  public requestId?: string;

  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    code?: string,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.requestId = requestId;
  }
}

let refreshPromise: ReturnType<typeof supabase.auth.refreshSession> | null = null;

function isFormData(body: BodyInit | null | undefined) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

async function parseResponse(res: Response): Promise<ApiErrorBody | unknown | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text } satisfies ApiErrorBody;
  }
}

function asErrorBody(value: unknown): ApiErrorBody {
  return value && typeof value === "object" ? (value as ApiErrorBody) : {};
}

const MAX_COLD_START_RETRIES = 2;

async function fetchWithColdStartRetry(url: string, init: RequestInit): Promise<Response> {
  let attempt = 0;
  while (attempt <= MAX_COLD_START_RETRIES) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s cold-start budget for free tier
    const effectiveSignal = init.signal || controller.signal;

    try {
      const res = await fetch(url, { ...init, signal: effectiveSignal });
      clearTimeout(timeoutId);

      // If Render returns transient 502/503 during cold start boot, retry with backoff
      if ((res.status === 502 || res.status === 503) && attempt <= MAX_COLD_START_RETRIES) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      return res;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const isAbort = error?.name === "AbortError";
      if (!isAbort && attempt <= MAX_COLD_START_RETRIES) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unable to connect to SkillBridge server after multiple attempts.");
}

async function requestWithHeaders(path: string, init: RequestInit, accessToken?: string) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-App-Version", Constants.expoConfig?.version ?? "2.0.0");
  headers.set("X-App-Locale", usePreferencesStore.getState().language);
  headers.set("X-Data-Saver", usePreferencesStore.getState().dataSaver);
  if (init.body && !isFormData(init.body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  try {
    return await fetchWithColdStartRetry(`${BASE}${normalizedPath}`, { ...init, headers });
  } catch (error) {
    throw new ApiError(
      0,
      "Cannot reach the SkillBridge API. The server may be waking up. Please retry in a moment.",
      error,
    );
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  let res = await requestWithHeaders(path, init, token);

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
    const errorBody = asErrorBody(body);
    const headerRequestId = res.headers.get("x-request-id") || undefined;
    throw new ApiError(
      res.status,
      errorBody.error ?? errorBody.message ?? `Request failed (${res.status})`,
      errorBody.issues,
      errorBody.code,
      errorBody.requestId ?? headerRequestId,
    );
  }
  return body as T;
}

export const qs = (obj: Record<string, string | number | boolean | null | undefined>) =>
  new URLSearchParams(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();

