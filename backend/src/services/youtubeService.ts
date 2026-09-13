import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  channelId: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
  privacyStatus: string | null;
  rawDuration?: string | null;
}

export interface YouTubeChannelProfile {
  channelId: string;
  channelTitle: string;
  customUrl?: string | null;
  avatarUrl?: string | null;
}

/**
 * Extracts YouTube 11-character video ID from varied URL formats or raw ID.
 * Handles: watch?v=, youtu.be/, /embed/, /shorts/, /live/
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // If already an 11-character alphanumeric/dash/underscore string
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const first = url.pathname.slice(1).split("/")[0];
      const id = first ? first.split("?")[0] : null;
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      // ?v=...
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      // /embed/..., /shorts/..., /live/...
      const parts = url.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") &&
        parts[1] &&
        /^[a-zA-Z0-9_-]{11}$/.test(parts[1])
      ) {
        return parts[1];
      }
    }
  } catch {
    // Regex fallback for non-standard URL strings
    const match = trimmed.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/
    );
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Parses ISO-8601 duration format (e.g. PT1H2M30S, PT45S, P1DT2H) into total seconds.
 */
export function parseISO8601Duration(durationStr?: string | null): number | null {
  if (!durationStr || typeof durationStr !== "string") return null;

  const matches = durationStr.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
  );
  if (!matches) return null;

  const days = parseInt(matches[1] || "0", 10);
  const hours = parseInt(matches[2] || "0", 10);
  const minutes = parseInt(matches[3] || "0", 10);
  const seconds = parseInt(matches[4] || "0", 10);

  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/**
 * Provides standard fallback metadata for YouTube videos when API quota is exhausted
 * or when API credentials are unconfigured.
 */
export function getYouTubeFallbackMetadata(videoId: string): YouTubeVideoMetadata {
  return {
    videoId,
    title: `YouTube Recording (${videoId})`,
    description: "",
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: null,
    channelId: null,
    channelTitle: null,
    publishedAt: null,
    privacyStatus: "unlisted",
  };
}

/**
 * Retrieves video metadata from the YouTube Data API v3 with quota protection
 * and resilient fallback if unavailable.
 */
export async function fetchYouTubeVideoMetadata(
  videoId: string,
  userAccessToken?: string
): Promise<YouTubeVideoMetadata> {
  const fallback = getYouTubeFallbackMetadata(videoId);
  const apiKey = env.YOUTUBE_API_KEY;

  if (!apiKey && !userAccessToken) {
    logger.debug(
      { videoId },
      "No YouTube API key or user token configured; returning standard fallback metadata"
    );
    return fallback;
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("id", videoId);
    if (apiKey && !userAccessToken) {
      url.searchParams.set("key", apiKey);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (userAccessToken) {
      headers.Authorization = `Bearer ${userAccessToken}`;
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.warn(
        { status: response.status, videoId, errText: errText.slice(0, 200) },
        "YouTube API returned non-OK status; utilizing quota-safe fallback"
      );
      return fallback;
    }

    const data = (await response.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          description?: string;
          channelId?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: {
            maxres?: { url: string };
            standard?: { url: string };
            high?: { url: string };
            medium?: { url: string };
            default?: { url: string };
          };
        };
        contentDetails?: {
          duration?: string;
        };
        status?: {
          privacyStatus?: string;
        };
      }>;
    };

    if (!data.items || data.items.length === 0) {
      logger.warn({ videoId }, "YouTube API returned no items for video; utilizing fallback");
      return fallback;
    }

    const item = data.items[0];
    if (!item) {
      return fallback;
    }
    const snippet = item.snippet;
    const content = item.contentDetails;
    const status = item.status;

    const thumbnailUrl =
      snippet?.thumbnails?.maxres?.url ||
      snippet?.thumbnails?.standard?.url ||
      snippet?.thumbnails?.high?.url ||
      snippet?.thumbnails?.medium?.url ||
      snippet?.thumbnails?.default?.url ||
      fallback.thumbnailUrl;

    const durationSeconds = parseISO8601Duration(content?.duration);

    return {
      videoId,
      title: snippet?.title || fallback.title,
      description: snippet?.description || "",
      thumbnailUrl,
      durationSeconds,
      channelId: snippet?.channelId || null,
      channelTitle: snippet?.channelTitle || null,
      publishedAt: snippet?.publishedAt || null,
      privacyStatus: status?.privacyStatus || "unlisted",
      rawDuration: content?.duration || null,
    };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), videoId },
      "Error contacting YouTube API; utilizing resilient fallback metadata"
    );
    return fallback;
  }
}

/**
 * Fetches authenticated channel profile via user's YouTube OAuth token.
 */
export async function fetchYouTubeChannelProfile(
  accessToken: string
): Promise<YouTubeChannelProfile | null> {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.warn(
        { status: response.status, err: errText.slice(0, 200) },
        "Failed to fetch YouTube channel profile"
      );
      return null;
    }

    const data = (await response.json()) as {
      items?: Array<{
        id: string;
        snippet?: {
          title?: string;
          customUrl?: string;
          thumbnails?: {
            default?: { url: string };
            medium?: { url: string };
            high?: { url: string };
          };
        };
      }>;
    };

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const channel = data.items[0];
    if (!channel) {
      return null;
    }
    return {
      channelId: channel.id,
      channelTitle: channel.snippet?.title || "Connected YouTube Channel",
      customUrl: channel.snippet?.customUrl || null,
      avatarUrl:
        channel.snippet?.thumbnails?.medium?.url ||
        channel.snippet?.thumbnails?.default?.url ||
        null,
    };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Error fetching YouTube channel profile"
    );
    return null;
  }
}

/**
 * Exchanges a refresh token for a fresh Google OAuth access token.
 */
export async function refreshGoogleOAuthToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
} | null> {
  const clientId = env.YOUTUBE_CLIENT_ID;
  const clientSecret = env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn("Cannot refresh Google OAuth token: credentials unconfigured");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.warn(
        { status: response.status, err: errText.slice(0, 200) },
        "Failed to refresh Google OAuth token"
      );
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
    };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Error refreshing Google OAuth token"
    );
    return null;
  }
}

/**
 * Generates privacy-enhanced YouTube embed URL.
 */
export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

/**
 * Generates canonical YouTube watch URL.
 */
export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
