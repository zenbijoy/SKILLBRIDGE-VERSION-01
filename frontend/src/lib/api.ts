import { supabase } from "./supabase";
import Constants from "expo-constants";
import { usePreferencesStore } from "@/state/usePreferencesStore";

import { API_URL } from "./config";

const BASE = API_URL;


type ApiErrorBody = {
  error?: string;
  message?: string;
  issues?: unknown;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
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
    return await fetch(`${BASE}${normalizedPath}`, { ...init, headers });
  } catch (error) {
    throw new ApiError(
      0,
      "Cannot reach the SkillBridge API. Check your connection and EXPO_PUBLIC_API_URL.",
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
    throw new ApiError(
      res.status,
      errorBody.error ?? errorBody.message ?? `Request failed (${res.status})`,
      errorBody.issues,
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

