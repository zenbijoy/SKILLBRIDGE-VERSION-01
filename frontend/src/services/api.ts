import { api as coreApi } from "@/lib/api";

export interface ApiResponse<T = any> {
  data: T;
}

export const api = {
  get: async <T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> => {
    const data = await coreApi<T>(path, { ...options, method: "GET" });
    return { data };
  },

  post: async <T = any>(path: string, body?: any, options: RequestInit = {}): Promise<ApiResponse<T>> => {
    const data = await coreApi<T>(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  },

  patch: async <T = any>(path: string, body?: any, options: RequestInit = {}): Promise<ApiResponse<T>> => {
    const data = await coreApi<T>(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  },

  put: async <T = any>(path: string, body?: any, options: RequestInit = {}): Promise<ApiResponse<T>> => {
    const data = await coreApi<T>(path, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  },

  delete: async <T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> => {
    const data = await coreApi<T>(path, { ...options, method: "DELETE" });
    return { data };
  },
};

export default api;
