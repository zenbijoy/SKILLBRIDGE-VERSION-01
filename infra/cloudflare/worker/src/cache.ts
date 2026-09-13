import { CACHEABLE_ROUTES, STRICT_BYPASS_PATTERNS, RouteCachePolicy } from "./config.js";

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

export function shouldBypassCache(request: Request, url: URL): boolean {
  // 1. Only GET and HEAD requests can ever be cached
  if (request.method !== "GET" && request.method !== "HEAD") {
    return true;
  }

  // 2. Strict bypass on authenticated requests
  if (request.headers.has("Authorization") || request.headers.has("Proxy-Authorization")) {
    return true;
  }

  // 3. Client explicitly requests fresh content
  const cacheControl = request.headers.get("Cache-Control");
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

export function findMatchingCachePolicy(url: URL): RouteCachePolicy | null {
  const fullPath = url.pathname + (url.search || "");
  for (const policy of CACHEABLE_ROUTES) {
    if (policy.pattern.test(fullPath) || policy.pattern.test(url.pathname)) {
      return policy;
    }
  }
  return null;
}
