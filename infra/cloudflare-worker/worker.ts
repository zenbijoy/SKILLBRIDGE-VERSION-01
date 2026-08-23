/**
 * SkillBridge Cloudflare Edge Worker
 * Zero-Cold-Start lightweight layer for instant app bootstrap, feature flags, and share previews.
 * Runs on 300+ edge locations globally within free 100,000 req/day quota.
 */

export interface Env {
  ENVIRONMENT: string;
  APP_VERSION: string;
  MAINTENANCE_MODE: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Version",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Edge Healthcheck
    if (pathname === "/health" || pathname === "/api/health") {
      return new Response(
        JSON.stringify({ status: "UP", region: (request as any).cf?.colo || "EDGE", timestamp: Date.now() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Instant App Bootstrap (<15ms, Zero Render Dependency)
    if (pathname === "/api/bootstrap" || pathname === "/api/v1/bootstrap") {
      const bootstrapPayload = {
        appVersion: env.APP_VERSION || "2.0.1",
        maintenanceMode: env.MAINTENANCE_MODE === "true",
        featureFlags: {
          voice_calls: true,
          video_calls: true,
          local_recording: true,
          youtube_broadcasts: true,
          ai_ct_planner: true,
          offline_sync: true,
        },
        cdnEndpoints: {
          r2UploadBase: "https://assets.skillbridge.app",
          livekitWs: "wss://livekit.skillbridge.app",
        },
        publicFeaturedClubs: [
          { id: "club_cse", name: "DU CSE Club", membersCount: 1420 },
          { id: "club_robotics", name: "BUET Robotics Society", membersCount: 2150 },
          { id: "club_research", name: "Campus AI & Research Forum", membersCount: 980 },
        ],
      };

      return new Response(JSON.stringify(bootstrapPayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Social Share Previews (OpenGraph for Facebook / WhatsApp / Messenger)
    if (pathname.startsWith("/share/")) {
      const shareId = pathname.replace("/share/", "");
      const ogHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>SkillBridge Study Room | ${shareId}</title>
    <meta property="og:title" content="Join Live Study Session on SkillBridge">
    <meta property="og:description" content="Collaborate on class tests, peer tutoring, and club workshops.">
    <meta property="og:image" content="https://skillbridge.app/assets/og-preview.png">
    <meta property="og:url" content="https://skillbridge.app/share/${shareId}">
    <meta name="twitter:card" content="summary_large_image">
    <meta http-equiv="refresh" content="0; url=skillbridge://room/${shareId}">
  </head>
  <body>
    <p>Opening SkillBridge App…</p>
  </body>
</html>`;
      return new Response(ogHtml, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
    }

    return new Response(JSON.stringify({ error: "Not found on Edge Worker" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
