import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Platform } from "react-native";
import Constants from "expo-constants";

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
