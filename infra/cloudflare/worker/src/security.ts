export function validateRequestSecurity(url: URL): { valid: boolean; reason?: string } {
  // 1. Path traversal defense
  const decodedPath = decodeURIComponent(url.pathname);
  if (decodedPath.includes("..") || decodedPath.includes("//") || decodedPath.includes("\\")) {
    return { valid: false, reason: "Invalid URL path structure: traversal prohibited" };
  }

  // 2. Prohibit null byte or dangerous control characters
  if (/[\x00-\x1f\x7f]/.test(decodedPath)) {
    return { valid: false, reason: "Prohibited control characters in URI" };
  }

  return { valid: true };
}

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-App-Version, Cache-Control",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}
