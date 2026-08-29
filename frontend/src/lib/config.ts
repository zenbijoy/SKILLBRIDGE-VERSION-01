import Constants from 'expo-constants';

export const isProduction = process.env.NODE_ENV === 'production' || process.env.EXPO_PUBLIC_ENV === 'production';

const DEFAULT_API_URL = "https://skillbridge-api-pd9c.onrender.com/api/v1";
const expoApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;

let rawApiUrl = process.env.EXPO_PUBLIC_API_URL || (!isProduction ? expoApiUrl : '') || DEFAULT_API_URL;
rawApiUrl = rawApiUrl.replace(/\/+$/, ''); // Strip trailing slashes safely

if (isProduction) {
  if (rawApiUrl.includes('localhost') || rawApiUrl.includes('127.0.0.1')) {
    throw new Error('EXPO_PUBLIC_API_URL cannot be localhost in production.');
  }
  if (rawApiUrl.includes('skillbridge-api.onrender.com')) {
    throw new Error('EXPO_PUBLIC_API_URL is using the obsolete hostname in production.');
  }
}

export const API_URL = rawApiUrl;

// Derive Socket.IO origin by removing only a trailing /api/v1
export const SOCKET_URL = rawApiUrl.replace(/\/api\/v1$/, '');

const DEFAULT_SUPABASE_URL = "https://wyqsoxkwmulhpcoslnoj.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cXNveGt3bXVsaHBjb3Nsbm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAxMzUsImV4cCI6MjEwMTg1NjEzNX0.KFiTn-UCZoL_TWHMjOTums4Fs_DoMK_iGF3v-mdv6_o";

// Supabase configuration
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || (!isProduction ? (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) : '') || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || (!isProduction ? (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) : '') || DEFAULT_SUPABASE_ANON_KEY;

if (isProduction && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  throw new Error('Supabase URL and Anon Key are required in production.');
}
