import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
  ttl?: number;
  provider: "stun-default" | "cloudflare-turn";
}

const DEFAULT_STUN_SERVERS: IceServerConfig[] = [
  {
    urls: [
      "stun:stun.cloudflare.com:3478",
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:stun3.l.google.com:19302",
      "stun:stun4.l.google.com:19302",
    ],
  },
];

let cachedIceServers: { response: IceServersResponse; expiresAt: number } | null = null;

/**
 * Generates client-safe ICE server configuration.
 * Uses public STUN by default, and Cloudflare TURN short-lived credentials if enabled.
 * Never logs or exposes root API tokens to clients.
 */
export async function generateCloudflareIceServers(): Promise<IceServersResponse> {
  if (cachedIceServers && Date.now() < cachedIceServers.expiresAt) {
    return cachedIceServers.response;
  }

  if (!env.CLOUDFLARE_TURN_ENABLED || !env.CLOUDFLARE_TURN_KEY_ID || !env.CLOUDFLARE_TURN_API_TOKEN) {
    return {
      iceServers: DEFAULT_STUN_SERVERS,
      provider: "stun-default",
    };
  }

  const keyId = env.CLOUDFLARE_TURN_KEY_ID;
  const token = env.CLOUDFLARE_TURN_API_TOKEN;
  const ttl = env.TURN_CREDENTIAL_TTL_SECONDS || 3600;

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl }),
      },
    );

    if (!response.ok) {
      logger.warn(
        {
          event: "turn_credential_generation_failed",
          status: response.status,
        },
        "Cloudflare TURN credential generation failed, falling back to STUN",
      );
      return {
        iceServers: DEFAULT_STUN_SERVERS,
        provider: "stun-default",
      };
    }

    const data = await response.json();
    const result: IceServersResponse = {
      iceServers: data.iceServers || DEFAULT_STUN_SERVERS,
      ttl,
      provider: "cloudflare-turn",
    };

    // Cache valid TURN response until 5 minutes before TTL expiry (minimum 5 minutes)
    const cacheDurationMs = Math.max(300, ttl - 300) * 1000;
    cachedIceServers = {
      response: result,
      expiresAt: Date.now() + cacheDurationMs,
    };

    return result;
  } catch (err: any) {
    logger.warn(
      {
        event: "turn_endpoint_unreachable",
        err: err?.message || err,
      },
      "Could not reach Cloudflare TURN endpoint, falling back to STUN",
    );
    return {
      iceServers: DEFAULT_STUN_SERVERS,
      provider: "stun-default",
    };
  }
}
