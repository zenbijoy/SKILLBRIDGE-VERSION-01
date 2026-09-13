export interface RouteCachePolicy {
  pattern: RegExp;
  maxAge: number; // in seconds
  staleWhileRevalidate: number; // in seconds
  description: string;
}

export interface WorkerEnv {
  ENVIRONMENT?: string;
  ORIGIN_URL?: string;
  APP_VERSION?: string;
  CACHE_PURGE_ENABLED?: string;
  PURGE_SECRET?: string;
}

export const CACHEABLE_ROUTES: RouteCachePolicy[] = [
  {
    pattern: /^\/api\/v1\/health(\/live)?$/,
    maxAge: 10,
    staleWhileRevalidate: 0,
    description: "API Health Liveness",
  },
  {
    pattern: /^\/api\/v1\/rooms\/?(\?.*)?$/,
    maxAge: 60,
    staleWhileRevalidate: 120,
    description: "Public Study Rooms Catalog",
  },
  {
    pattern: /^\/api\/v1\/rooms\/[a-f0-9-]+\/recordings\/?$/,
    maxAge: 120,
    staleWhileRevalidate: 300,
    description: "Study Room Recordings Catalog",
  },
  {
    pattern: /^\/api\/v1\/clubs\/?(\?.*)?$/,
    maxAge: 120,
    staleWhileRevalidate: 300,
    description: "Clubs Directory",
  },
  {
    pattern: /^\/api\/v1\/clubs\/[a-f0-9-]+\/?$/,
    maxAge: 120,
    staleWhileRevalidate: 300,
    description: "Club Profile & Public Metadata",
  },
  {
    pattern: /^\/api\/v1\/calendar\/?(\?.*)?$/,
    maxAge: 60,
    staleWhileRevalidate: 180,
    description: "Campus Events & Schedules",
  },
  {
    pattern: /^\/api\/v1\/catalog\/?(\?.*)?$/,
    maxAge: 300,
    staleWhileRevalidate: 600,
    description: "Skill & Subject Catalog",
  },
  {
    pattern: /^\/api\/v1\/achievements\/public\/?(\?.*)?$/,
    maxAge: 300,
    staleWhileRevalidate: 600,
    description: "Public Badge & Achievement Catalog",
  },
];

export const STRICT_BYPASS_PATTERNS: RegExp[] = [
  /^\/api\/v1\/auth(\/.*)?$/,
  /^\/api\/v1\/users(\/.*)?$/,
  /^\/api\/v1\/admin(\/.*)?$/,
  /^\/api\/v1\/moderation(\/.*)?$/,
  /^\/api\/v1\/bookings(\/.*)?$/,
  /^\/api\/v1\/notifications(\/.*)?$/,
  /^\/api\/v1\/feed(\/.*)?$/,
  /^\/api\/v1\/calls(\/.*)?$/,
  /^\/api\/v1\/resources\/upload-ticket$/,
  /^\/socket\.io(\/.*)?$/,
];
