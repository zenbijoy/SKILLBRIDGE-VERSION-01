import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { wrap } from "../middleware/error.js";
import { encryptToken } from "../lib/encryption.js";
import { fetchYouTubeChannelProfile } from "../services/youtubeService.js";

export const integrations = Router();

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function getStateSecret(): string {
  return (
    env.OAUTH_TOKEN_ENCRYPTION_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    "skillbridge-oauth-state-secret"
  );
}

/**
 * Creates an HMAC-signed CSRF state token bound to the userId.
 */
export function createOAuthState(userId: string): string {
  const nonce = crypto.randomBytes(12).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${userId}:${nonce}:${timestamp}`;
  const sig = crypto
    .createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Validates the HMAC signature and expiration of an OAuth state token.
 */
export function verifyOAuthState(stateString: string): { valid: boolean; userId?: string } {
  if (!stateString || typeof stateString !== "string") return { valid: false };

  const parts = stateString.split(".");
  if (parts.length !== 2) return { valid: false };

  const [payload, sig] = parts;
  if (!payload || !sig) return { valid: false };

  const expectedSig = crypto
    .createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("hex");

  if (sig.length !== expectedSig.length) {
    return { valid: false };
  }

  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) {
      return { valid: false };
    }
  } catch {
    return { valid: false };
  }

  const payloadParts = payload.split(":");
  if (payloadParts.length !== 3) return { valid: false };

  const [userId, , timestampStr] = payloadParts;
  if (!userId || !timestampStr) return { valid: false };

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > STATE_MAX_AGE_MS) {
    return { valid: false };
  }

  return { valid: true, userId };
}

// -----------------------------------------------------------------------------
// GET /api/v1/integrations/youtube/connect (Initiate OAuth)
// -----------------------------------------------------------------------------
integrations.get(
  "/youtube/connect",
  wrap(async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const clientId = env.YOUTUBE_CLIENT_ID;
    const redirectUri = env.YOUTUBE_REDIRECT_URI;

    if (!env.YOUTUBE_OAUTH_ENABLED || !clientId || !redirectUri) {
      return res.status(400).json({
        error: "YouTube OAuth integration is currently disabled or unconfigured.",
        configured: false,
      });
    }

    const state = createOAuthState(req.userId);
    const scope = "https://www.googleapis.com/auth/youtube.readonly";

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return res.json({
      authUrl: authUrl.toString(),
      state,
      expiresInSeconds: 600,
    });
  })
);

// -----------------------------------------------------------------------------
// GET /api/v1/integrations/youtube/callback (OAuth exchange)
// -----------------------------------------------------------------------------
export async function handleYouTubeCallback(req: Request, res: Response) {
  const { code, state, error: oauthError } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  const frontendUrl =
    env.WEB_ORIGINS?.split(",")[0]?.trim() || "http://localhost:3000";

  if (oauthError) {
    logger.warn({ oauthError }, "User or provider denied YouTube OAuth consent");
    return res.redirect(`${frontendUrl}/settings/integrations?error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    return res.status(400).json({ error: "Missing required OAuth authorization code or state" });
  }

  const { valid, userId } = verifyOAuthState(state);
  if (!valid || !userId) {
    return res.status(400).json({ error: "Invalid or expired OAuth state parameter" });
  }

  const clientId = env.YOUTUBE_CLIENT_ID;
  const clientSecret = env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = env.YOUTUBE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({ error: "YouTube credentials not configured on server" });
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text().catch(() => "");
      logger.error({ status: tokenResponse.status, errBody }, "Google OAuth token exchange failed");
      return res.redirect(`${frontendUrl}/settings/integrations?error=token_exchange_failed`);
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    // Fetch Channel Profile
    const channelProfile = await fetchYouTubeChannelProfile(tokens.access_token);

    const channelId = channelProfile?.channelId || `ch_${Date.now()}`;
    const channelTitle = channelProfile?.channelTitle || "Connected YouTube Channel";
    const customUrl = channelProfile?.customUrl || null;
    const avatarUrl = channelProfile?.avatarUrl || null;

    const accessTokenEncrypted = encryptToken(tokens.access_token);
    const refreshTokenEncrypted = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : undefined;

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Upsert into youtube_connections
    const { error: upsertErr } = await admin.from("youtube_connections").upsert(
      {
        user_id: userId,
        channel_id: channelId,
        channel_title: channelTitle,
        channel_custom_url: customUrl,
        channel_thumbnail_url: avatarUrl,
        access_token_encrypted: accessTokenEncrypted,
        ...(refreshTokenEncrypted ? { refresh_token_encrypted: refreshTokenEncrypted } : {}),
        token_expires_at: tokenExpiresAt,
        scopes: tokens.scope ? tokens.scope.split(" ") : ["https://www.googleapis.com/auth/youtube.readonly"],
        status: "active",
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel_id" }
    );

    if (upsertErr) {
      logger.error({ err: upsertErr.message }, "Failed saving youtube_connections to DB");
      return res.redirect(`${frontendUrl}/settings/integrations?error=db_save_failed`);
    }

    logger.info({ userId, channelId, channelTitle }, "Successfully connected YouTube channel");
    return res.redirect(
      `${frontendUrl}/settings/integrations?status=success&channel=${encodeURIComponent(channelTitle)}`
    );
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Exception handling YouTube callback");
    return res.redirect(`${frontendUrl}/settings/integrations?error=server_error`);
  }
}

integrations.get("/youtube/callback", wrap(handleYouTubeCallback));

// -----------------------------------------------------------------------------
// GET /api/v1/integrations/youtube/status
// -----------------------------------------------------------------------------
integrations.get(
  "/youtube/status",
  wrap(async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { data: connection, error } = await admin
      .from("youtube_connections")
      .select("id, channel_id, channel_title, channel_custom_url, channel_thumbnail_url, status, created_at, last_synced_at")
      .eq("user_id", req.userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error) {
      logger.warn({ err: error.message }, "Error checking YouTube integration status");
      return res.status(500).json({ error: "Failed querying integration status" });
    }

    return res.json({
      configured: Boolean(env.YOUTUBE_OAUTH_ENABLED && env.YOUTUBE_CLIENT_ID),
      connected: Boolean(connection),
      connection: connection || null,
    });
  })
);

// -----------------------------------------------------------------------------
// DELETE /api/v1/integrations/youtube/disconnect
// -----------------------------------------------------------------------------
integrations.delete(
  "/youtube/disconnect",
  wrap(async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { error } = await admin
      .from("youtube_connections")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("user_id", req.userId)
      .eq("status", "active");

    if (error) {
      logger.warn({ err: error.message }, "Error disconnecting YouTube integration");
      return res.status(500).json({ error: "Failed to disconnect YouTube channel" });
    }

    return res.json({
      success: true,
      message: "YouTube integration disconnected successfully.",
    });
  })
);
