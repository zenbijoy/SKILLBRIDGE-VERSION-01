import { api } from "@/lib/api";

export interface IceServerItem {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_STUN_SERVERS: IceServerItem[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

/**
 * Fetch ephemeral ICE servers (STUN + short-lived Cloudflare TURN)
 */
export async function fetchIceServers(): Promise<IceServerItem[]> {
  try {
    const res = await api<{ iceServers: IceServerItem[]; provider: string }>("/calls/ice-servers");
    if (res && res.iceServers && res.iceServers.length > 0) {
      return res.iceServers;
    }
  } catch (err) {
    console.warn("Could not fetch remote ICE servers, using fallback STUN:", err);
  }

  return DEFAULT_STUN_SERVERS;
}
