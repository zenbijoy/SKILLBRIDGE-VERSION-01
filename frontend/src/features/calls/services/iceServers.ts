import { api } from "@/lib/api";

export interface IceServerItem {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_STUN_SERVERS: IceServerItem[] = [
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

let cachedClientIceServers: { servers: IceServerItem[]; expiresAt: number } | null = null;

/**
 * Fetch ephemeral ICE servers (STUN + short-lived Cloudflare TURN)
 */
export async function fetchIceServers(): Promise<IceServerItem[]> {
  if (cachedClientIceServers && Date.now() < cachedClientIceServers.expiresAt) {
    return cachedClientIceServers.servers;
  }

  try {
    const res = await api<{ iceServers: IceServerItem[]; provider: string }>("/calls/ice-servers");
    if (res && res.iceServers && res.iceServers.length > 0) {
      cachedClientIceServers = {
        servers: res.iceServers,
        expiresAt: Date.now() + 10 * 60 * 1000, // Cache for 10 minutes
      };
      return res.iceServers;
    }
  } catch (err) {
    console.warn("Could not fetch remote ICE servers, using fallback STUN:", err);
  }

  return DEFAULT_STUN_SERVERS;
}
