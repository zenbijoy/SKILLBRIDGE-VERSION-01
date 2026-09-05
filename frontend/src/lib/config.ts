import Constants from 'expo-constants';

export const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.EXPO_PUBLIC_ENV === 'production';

// 1. Guard against accidental client-side exposure of service-role keys
const exposedPrivilegedKeys = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
].filter((key) => Boolean(process.env[key]));

if (exposedPrivilegedKeys.length > 0) {
  throw new Error(
    `CRITICAL_SECURITY_VIOLATION: Privileged service role keys detected in mobile client environment: ${exposedPrivilegedKeys.join(', ')}. Remove immediately.`
  );
}

// 2. Resolve API URL
const DEFAULT_DEV_API_URL = "https://skillbridge-api-pd9c.onrender.com/api/v1";
const expoApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;

let rawApiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  (!isProduction ? expoApiUrl : '') ||
  (isProduction ? '' : DEFAULT_DEV_API_URL);

rawApiUrl = (rawApiUrl || '').trim().replace(/\/+$/, ''); // Strip trailing slashes safely

if (isProduction) {
  if (!rawApiUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is required in production.');
  }
  if (rawApiUrl.includes('localhost') || rawApiUrl.includes('127.0.0.1')) {
    throw new Error('EXPO_PUBLIC_API_URL cannot be localhost in production.');
  }
  if (rawApiUrl.includes('skillbridge-api.onrender.com')) {
    throw new Error('EXPO_PUBLIC_API_URL is using the obsolete hostname in production.');
  }
  if (!rawApiUrl.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL must use HTTPS in production.');
  }
}

export const API_URL = rawApiUrl || (!isProduction ? DEFAULT_DEV_API_URL : '');

// Derive Socket.IO origin by removing only a trailing /api/v1
export const SOCKET_URL = API_URL.replace(/\/api\/v1$/, '');

// 3. Helper to extract project ref safely from URL
export function getSupabaseProjectRef(url?: string): string {
  if (!url) return 'unknown';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const parts = host.split('.');
    return parts.length >= 3 ? parts[0] : host;
  } catch {
    return 'unknown';
  }
}

// 4. Resolve Supabase Configuration
const expoSupabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const expoSupabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

const rawSupabaseUrl = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (!isProduction ? expoSupabaseUrl : '') ??
  ''
).trim().replace(/\/+$/, '');

const rawSupabaseAnonKey = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  (!isProduction ? expoSupabaseAnonKey : '') ??
  ''
).trim();

if (isProduction) {
  if (!rawSupabaseUrl) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is required in production.');
  }
  if (!rawSupabaseUrl.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must use HTTPS in production.');
  }
  if (!rawSupabaseUrl.includes('.supabase.co')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not a valid Supabase domain.');
  }
  if (!rawSupabaseAnonKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is required in production.');
  }
  if (rawSupabaseAnonKey.length < 20 || rawSupabaseAnonKey.includes('placeholder')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is invalid or a placeholder.');
  }
}

export const SUPABASE_URL = rawSupabaseUrl || (!isProduction ? 'https://dev.supabase.co' : '');
export const SUPABASE_ANON_KEY = rawSupabaseAnonKey || (!isProduction ? 'dev-anon-key' : '');
export const SUPABASE_PROJECT_REF = getSupabaseProjectRef(SUPABASE_URL);

// 5. Resolve Google Sign-In Configuration
const expoGoogleWebClientId = Constants.expoConfig?.extra?.googleWebClientId as string | undefined;
const expoGoogleIosClientId = Constants.expoConfig?.extra?.googleIosClientId as string | undefined;

export const GOOGLE_WEB_CLIENT_ID = (
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  (!isProduction ? expoGoogleWebClientId : '') ??
  ''
).trim();

export const GOOGLE_IOS_CLIENT_ID = (
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  (!isProduction ? expoGoogleIosClientId : '') ??
  ''
).trim();
