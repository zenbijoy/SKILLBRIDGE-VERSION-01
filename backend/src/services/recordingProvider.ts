import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import {
  extractYouTubeVideoId,
  fetchYouTubeVideoMetadata,
  refreshGoogleOAuthToken,
  getYouTubeWatchUrl,
} from "./youtubeService.js";
import { decryptToken, encryptToken } from "../lib/encryption.js";
import { admin } from "../lib/db.js";

export interface RecordingResult {
  sourceType: "youtube" | "livekit_egress" | "upload";
  videoId?: string;
  title: string;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  playbackUrl: string;
  providerMetadata?: Record<string, any>;
  status: "pending" | "processing" | "ready" | "failed";
}

export interface RecordingProvider {
  readonly name: "manual_youtube" | "youtube_oauth" | "livekit_egress";
  isConfigured(): boolean;
  startRecording?(roomId: string, options?: any): Promise<{ egressId: string }>;
  stopRecording?(egressId: string): Promise<void>;
  syncMetadata(videoIdOrUrl: string, context?: { userId?: string; connectionId?: string }): Promise<RecordingResult>;
}

/**
 * Provider 1: Manual YouTube (Always configured, zero cost, fallback safe)
 */
export class ManualYouTubeProvider implements RecordingProvider {
  readonly name = "manual_youtube" as const;

  isConfigured(): boolean {
    return true;
  }

  async syncMetadata(videoIdOrUrl: string): Promise<RecordingResult> {
    const videoId = extractYouTubeVideoId(videoIdOrUrl);
    if (!videoId) {
      throw new Error(`Invalid YouTube video ID or URL: ${videoIdOrUrl}`);
    }

    const meta = await fetchYouTubeVideoMetadata(videoId);
    return {
      sourceType: "youtube",
      videoId,
      title: meta.title,
      durationSeconds: meta.durationSeconds,
      thumbnailUrl: meta.thumbnailUrl,
      playbackUrl: getYouTubeWatchUrl(videoId),
      providerMetadata: {
        channelId: meta.channelId,
        channelTitle: meta.channelTitle,
        publishedAt: meta.publishedAt,
        privacyStatus: meta.privacyStatus,
      },
      status: "ready",
    };
  }
}

/**
 * Provider 2: YouTube OAuth (Syncs via connected teacher/channel credentials)
 */
export class YouTubeOAuthProvider implements RecordingProvider {
  readonly name = "youtube_oauth" as const;

  isConfigured(): boolean {
    return Boolean(env.YOUTUBE_OAUTH_ENABLED && env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET);
  }

  async syncMetadata(
    videoIdOrUrl: string,
    context?: { userId?: string; connectionId?: string }
  ): Promise<RecordingResult> {
    const videoId = extractYouTubeVideoId(videoIdOrUrl);
    if (!videoId) {
      throw new Error(`Invalid YouTube video ID or URL: ${videoIdOrUrl}`);
    }

    let accessToken: string | undefined;

    if (context?.userId || context?.connectionId) {
      try {
        let query = admin.from("youtube_connections").select("*");
        if (context.connectionId) {
          query = query.eq("id", context.connectionId);
        } else if (context.userId) {
          query = query.eq("user_id", context.userId);
        }

        const { data: connection } = await query.maybeSingle();

        if (connection && connection.access_token_encrypted) {
          const isExpired =
            connection.token_expires_at &&
            new Date(connection.token_expires_at).getTime() < Date.now() + 60000;

          if (isExpired && connection.refresh_token_encrypted) {
            // Decrypt refresh token and renew
            const decryptedRefresh = decryptToken(connection.refresh_token_encrypted);
            const refreshed = await refreshGoogleOAuthToken(decryptedRefresh);
            if (refreshed) {
              accessToken = refreshed.accessToken;
              const encryptedNewAccess = encryptToken(refreshed.accessToken);
              const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();

              await admin
                .from("youtube_connections")
                .update({
                  access_token_encrypted: encryptedNewAccess,
                  token_expires_at: newExpiresAt,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", connection.id);
            }
          } else {
            accessToken = decryptToken(connection.access_token_encrypted);
          }
        }
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Failed resolving OAuth token; continuing with public API/fallback");
      }
    }

    const meta = await fetchYouTubeVideoMetadata(videoId, accessToken);
    return {
      sourceType: "youtube",
      videoId,
      title: meta.title,
      durationSeconds: meta.durationSeconds,
      thumbnailUrl: meta.thumbnailUrl,
      playbackUrl: getYouTubeWatchUrl(videoId),
      providerMetadata: {
        channelId: meta.channelId,
        channelTitle: meta.channelTitle,
        publishedAt: meta.publishedAt,
        privacyStatus: meta.privacyStatus,
      },
      status: "ready",
    };
  }
}

/**
 * Provider 3: LiveKit Egress (Guarded strictly behind feature flag LIVEKIT_RECORDING_AUTOMATION)
 */
export class LiveKitEgressProvider implements RecordingProvider {
  readonly name = "livekit_egress" as const;

  isConfigured(): boolean {
    return Boolean(
      env.LIVEKIT_RECORDING_AUTOMATION &&
      env.LIVEKIT_API_KEY &&
      env.LIVEKIT_API_SECRET &&
      env.LIVEKIT_URL
    );
  }

  async startRecording(roomId: string): Promise<{ egressId: string }> {
    if (!this.isConfigured()) {
      throw new Error(
        "LiveKit recording automation is disabled (LIVEKIT_RECORDING_AUTOMATION=false) to protect from billable egress."
      );
    }
    // Stubbed integration points for future dedicated egress instances
    logger.info({ roomId }, "LiveKit Egress recording triggered (stubbed)");
    return { egressId: `egress-${Date.now()}` };
  }

  async stopRecording(egressId: string): Promise<void> {
    logger.info({ egressId }, "LiveKit Egress recording stopped (stubbed)");
  }

  async syncMetadata(): Promise<RecordingResult> {
    throw new Error("LiveKit Egress metadata sync not implemented");
  }
}

/**
 * Factory for resolving recording provider instances.
 */
export function getRecordingProvider(
  preferredType?: "manual_youtube" | "youtube_oauth" | "livekit_egress"
): RecordingProvider {
  if (preferredType === "livekit_egress") {
    const livekit = new LiveKitEgressProvider();
    if (livekit.isConfigured()) return livekit;
  }

  if (preferredType === "youtube_oauth") {
    const oauth = new YouTubeOAuthProvider();
    if (oauth.isConfigured()) return oauth;
  }

  return new ManualYouTubeProvider();
}
