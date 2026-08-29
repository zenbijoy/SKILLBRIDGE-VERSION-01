import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import { SUPABASE_URL as url, SUPABASE_ANON_KEY as anon } from "./config";

// Custom SecureStore wrapper for Native
const ExpoSecureStoreAdapter: SupportedStorage = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

const webStorage: SupportedStorage = {
  getItem: async (key) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key, value) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};

const storage: SupportedStorage =
  Platform.OS === "web" ? webStorage : ExpoSecureStoreAdapter;

export const supabase = createClient(url, anon, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web", // For PKCE flow in web
  },
});
