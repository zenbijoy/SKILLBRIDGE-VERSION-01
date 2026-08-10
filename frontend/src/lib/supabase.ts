import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY"
  );
}

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
  Platform.OS === "web"
    ? webStorage
    : AsyncStorage;

const browserAvailable =
  Platform.OS !== "web" || typeof window !== "undefined";

export const supabase = createClient(url, anon, {
  auth: {
    storage,
    persistSession: browserAvailable,
    autoRefreshToken: browserAvailable,
    detectSessionInUrl:
      Platform.OS === "web" && typeof window !== "undefined",
  },
});
