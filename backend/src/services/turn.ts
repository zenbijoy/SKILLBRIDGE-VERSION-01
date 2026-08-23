import { env } from "../config/env.js";

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
    ],
  },
];

/**
 * Generates client-safe ICE server configuration.
 * Uses public STUN by default, and Cloudflare TURN short-lived credentials if enabled.
 * Never logs or exposes root API tokens to clients.
 */
export async function generateCloudflareIceServers(): Promise<IceServersResponse> {
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
      console.warn(`[TURN_WARN] Cloudflare TURN credential generation failed (${response.status}). Falling back to STUN.`);
      return {
        iceServers: DEFAULT_STUN_SERVERS,
        provider: "stun-default",
      };
    }

    const data = await response.json();
    return {
      iceServers: data.iceServers || DEFAULT_STUN_SERVERS,
      ttl,
      provider: "cloudflare-turn",
    };
  } catch (err: any) {
    console.warn(`[TURN_WARN] Could not reach Cloudflare TURN endpoint (${err?.message}). Falling back to STUN.`);
    return {
      iceServers: DEFAULT_STUN_SERVERS,
      provider: "stun-default",
    };
  }
}
