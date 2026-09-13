import { WorkerEnv } from "./config.js";
import { validateRequestSecurity, buildCorsHeaders } from "./security.js";
import { getDeterministicCacheKey, shouldBypassCache, findMatchingCachePolicy } from "./cache.js";

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const corsHeaders = buildCorsHeaders(origin);

    // 1. Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 2. Security validation
    const securityCheck = validateRequestSecurity(url);
    if (!securityCheck.valid) {
      return new Response(
        JSON.stringify({ error: "Forbidden", details: securityCheck.reason }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Cache Purge API (Protected)
    if (url.pathname === "/api/edge/purge" && request.method === "POST") {
      const purgeKey = request.headers.get("X-Purge-Key");
      if (!env.PURGE_SECRET || purgeKey !== env.PURGE_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized purge attempt" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Purging specific path or global
      const body = await request.json().catch(() => ({})) as { path?: string };
      const cache = (caches as any).default;
      if (body.path) {
        const targetUrl = new URL(body.path, url.origin);
        await cache.delete(targetUrl.toString());
        return new Response(JSON.stringify({ success: true, purgedPath: body.path }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Selective purge executed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Instant Edge Bootstrap (<15ms, Zero Render Cold-Start)
    if (url.pathname === "/api/bootstrap" || url.pathname === "/api/v1/bootstrap") {
      const bootstrapPayload = {
        appVersion: env.APP_VERSION || "2.0.1",
        edgeGateway: "active",
        region: (request as any).cf?.colo || "EDGE",
        timestamp: new Date().toISOString(),
        featureFlags: {
          voice_calls: true,
          video_calls: true,
          nextgen_feed: true,
          nextgen_qna: true,
          nextgen_recordings: true,
          nextgen_materials: true,
          nextgen_clash_engine: true,
        },
      };

      return new Response(JSON.stringify(bootstrapPayload), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60, s-maxage=120",
          "X-Edge-Cache": "EDGE_LOCAL",
        },
      });
    }

    // 5. Evaluate Edge Caching
    const bypass = shouldBypassCache(request, url);
    const policy = !bypass ? findMatchingCachePolicy(url) : null;
    const cache = (caches as any).default;

    const cacheKeyUrl = new URL(request.url);
    cacheKeyUrl.search = getDeterministicCacheKey(url).split("?")[1] || "";
    const cacheKey = new Request(cacheKeyUrl.toString(), {
      method: "GET",
      headers: request.headers,
    });

    if (policy && !bypass) {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const responseWithHeaders = new Response(cachedResponse.body, cachedResponse);
        responseWithHeaders.headers.set("X-Edge-Cache", "HIT");
        responseWithHeaders.headers.set("X-Edge-Region", (request as any).cf?.colo || "EDGE");
        return responseWithHeaders;
      }
    }

    // 6. Forward to Origin (Render)
    const originBase = env.ORIGIN_URL || "https://skillbridge-api.onrender.com";
    const originUrl = new URL(url.pathname + url.search, originBase);

    const originHeaders = new Headers(request.headers);
    originHeaders.set("X-Forwarded-Host", url.host);
    originHeaders.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
    originHeaders.set("X-Edge-Gateway", "cloudflare-worker");
    const cfIp = request.headers.get("CF-Connecting-IP");
    if (cfIp) {
      originHeaders.set("X-Real-IP", cfIp);
    }

    try {
      const originResponse = await fetch(originUrl.toString(), {
        method: request.method,
        headers: originHeaders,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "follow",
      });

      // Handle Origin 5xx with Stale Fallback for cached routes
      if (originResponse.status >= 500 && policy) {
        const staleResponse = await cache.match(cacheKey);
        if (staleResponse) {
          const fallback = new Response(staleResponse.body, staleResponse);
          fallback.headers.set("X-Edge-Cache", "STALE_ORIGIN_ERROR");
          fallback.headers.set("X-Edge-Fallback-Status", String(originResponse.status));
          return fallback;
        }
      }

      const clientResponse = new Response(originResponse.body, originResponse);

      // Apply CORS headers
      for (const [key, val] of Object.entries(corsHeaders)) {
        if (!clientResponse.headers.has(key)) {
          clientResponse.headers.set(key, val);
        }
      }

      clientResponse.headers.set("X-Edge-Cache", bypass ? "BYPASS" : policy ? "MISS" : "PASS");
      clientResponse.headers.set("X-Edge-Region", (request as any).cf?.colo || "EDGE");

      // Store in Cache if eligible
      if (policy && !bypass && originResponse.status === 200) {
        clientResponse.headers.set(
          "Cache-Control",
          `public, max-age=${policy.maxAge}, stale-while-revalidate=${policy.staleWhileRevalidate}`,
        );
        // Put cloned response into Cloudflare edge cache asynchronously
        ctx.waitUntil(cache.put(cacheKey, clientResponse.clone()));
      }

      return clientResponse;
    } catch (fetchErr: any) {
      // In case origin is completely down/unreachable, try stale cache
      if (policy) {
        const staleResponse = await cache.match(cacheKey);
        if (staleResponse) {
          const fallback = new Response(staleResponse.body, staleResponse);
          fallback.headers.set("X-Edge-Cache", "STALE_NETWORK_ERROR");
          return fallback;
        }
      }

      return new Response(
        JSON.stringify({
          error: "Origin Gateway Error",
          message: "The backend server is currently unreachable. Please try again in a moment.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  },
};
