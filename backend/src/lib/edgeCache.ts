/**
 * Deterministic Edge Cache Key Normalizer and Request Bypass Helper.
 * Mirrored from infra/cloudflare/worker/src/cache.ts for standalone backend testing and routing.
 */

const STRICT_BYPASS_PATTERNS = [
  /^\/api\/v1\/admin(\/.*)?$/i,
  /^\/api\/v1\/auth(\/.*)?$/i,
  /^\/api\/v1\/moderation(\/.*)?$/i,
  /^\/api\/v1\/chat(\/.*)?$/i,
  /^\/api\/v1\/integrations(\/.*)?$/i,
  /^\/api\/v1\/users(\/.*)?$/i,
  /^\/api\/v1\/bookings(\/.*)?$/i,
  /^\/api\/v1\/notifications(\/.*)?$/i,
  /^\/api\/v1\/feed(\/.*)?$/i,
  /^\/api\/v1\/calls(\/.*)?$/i,
  /^\/api\/v1\/resources\/upload-ticket$/i,
  /^\/socket\.io(\/.*)?$/i,
  /^\/webhooks\//i,
  /^\/health\//i,
];

export function getDeterministicCacheKey(url: URL): string {
  const normalizedPath = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const searchParams = new URLSearchParams(url.search);
  const sortedKeys = Array.from(searchParams.keys()).sort();

  const sortedQuery = new URLSearchParams();
  for (const key of sortedKeys) {
    const values = searchParams.getAll(key).sort();
    for (const val of values) {
      sortedQuery.append(key, val);
    }
  }

  const queryStr = sortedQuery.toString();
  return queryStr ? `${normalizedPath}?${queryStr}` : normalizedPath;
}

export function shouldBypassCache(request: { method: string; headers: { has: (key: string) => boolean; get: (key: string) => string | null } }, url: URL): boolean {
  // 1. Only GET and HEAD requests can ever be cached
  if (request.method !== "GET" && request.method !== "HEAD") {
    return true;
  }

  // 2. Strict bypass on authenticated requests
  if (request.headers.has("authorization") || request.headers.has("Authorization") || request.headers.has("Proxy-Authorization")) {
    return true;
  }

  // 3. Client explicitly requests fresh content
  const cacheControl = request.headers.get("Cache-Control") || request.headers.get("cache-control");
  if (cacheControl && (cacheControl.includes("no-cache") || cacheControl.includes("no-store"))) {
    return true;
  }

  // 4. Check explicit bypass list
  const pathname = url.pathname;
  for (const pattern of STRICT_BYPASS_PATTERNS) {
    if (pattern.test(pathname)) {
      return true;
    }
  }

  return false;
}
