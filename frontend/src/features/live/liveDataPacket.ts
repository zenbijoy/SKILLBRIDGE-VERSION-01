/**
 * LiveKit Realtime Data Packet Protocol (Version 1)
 * Supports transient live room communications without database bloat:
 * - In-flight classroom chat messages
 * - Transient reactions & emojis
 * - Student hand raises
 */

export type LiveHandRaisePacket = {
  version: 1;
  type: "hand_raise";
  timestamp: number;
  senderId?: string;
  senderName?: string;
};

export type LiveChatPacket = {
  version: 1;
  type: "chat";
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
};

export type LiveReactionPacket = {
  version: 1;
  type: "reaction";
  emoji: string;
  senderId: string;
  senderName: string;
  timestamp: number;
};

export type LiveDataPacket = LiveHandRaisePacket | LiveChatPacket | LiveReactionPacket;

export function encodeLivePacket(packet: LiveDataPacket): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(packet));
}

export function decodeLivePacket(payload: Uint8Array): LiveDataPacket | null {
  try {
    const raw = new TextDecoder().decode(payload);
    const parsed = JSON.parse(raw);

    // Support legacy RAISE_HAND format seamlessly
    if (parsed?.type === "RAISE_HAND") {
      return {
        version: 1,
        type: "hand_raise",
        timestamp: parsed.timestamp || Date.now(),
        senderId: parsed.senderId,
        senderName: parsed.senderName,
      };
    }

    if (
      parsed?.version === 1 &&
      (parsed?.type === "chat" || parsed?.type === "reaction" || parsed?.type === "hand_raise")
    ) {
      return parsed as LiveDataPacket;
    }

    return null;
  } catch {
    return null;
  }
}
