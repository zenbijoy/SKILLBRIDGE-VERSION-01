import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const DEFAULT_SUPABASE_URL = "https://wyqsoxkwmulhpcoslnoj.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cXNveGt3bXVsaHBjb3Nsbm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAxMzUsImV4cCI6MjEwMTg1NjEzNX0.KFiTn-UCZoL_TWHMjOTums4Fs_DoMK_iGF3v-mdv6_o";

const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ||
  DEFAULT_SUPABASE_URL;

const anon =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ||
  DEFAULT_SUPABASE_ANON_KEY;

if (!url || !anon) {
  const msg =
    "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in your .env file or app.json extra config.";
  console.error(msg);
  throw new Error(msg);
}

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
