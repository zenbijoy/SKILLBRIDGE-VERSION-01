import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useSession } from "@/hooks/useSession";

export type RoomPresence = {
  sessionId: string | null;
  liveParticipantCount: number;
  isLive: boolean;
};

type PresencePayload = RoomPresence;

/**
 * Real-time live-classroom presence for a room.
 *
 * Three layered sources keep the header count honest:
 *  1. Seeded from the room payload fetched by GET /rooms/:id.
 *  2. A light 15s poll of GET /rooms/:id/presence as a guaranteed fallback
 *     (works even if the socket is disconnected or a webhook never fired).
 *  3. Socket `room:presence` events for instant updates when LiveKit
 *     participants join or leave.
 */
export function useRoomPresence(
  roomId?: string,
  initial?: { liveSessionId?: string | null; liveParticipantCount?: number },
) {
  const { session } = useSession();
  const enabled = Boolean(roomId) && Boolean(session?.user?.id);

  const [presence, setPresence] = useState<RoomPresence>(() => ({
    sessionId: initial?.liveSessionId ?? null,
    liveParticipantCount: initial?.liveParticipantCount ?? 0,
    isLive: Boolean(initial?.liveSessionId),
  }));

  const apply = useCallback((payload: PresencePayload | undefined) => {
    if (!payload) return;
    setPresence({
      sessionId: payload.sessionId ?? null,
      liveParticipantCount: Math.max(0, payload.liveParticipantCount ?? 0),
      isLive: Boolean(payload.isLive),
    });
  }, []);

  // Re-seed whenever the room payload changes (initial load + manual refetches).
  useEffect(() => {
    if (!initial) return;
    setPresence((prev) => {
      // Never clobber a fresher socket/polled value with a stale snapshot.
      if (prev.sessionId && initial.liveSessionId && prev.sessionId === initial.liveSessionId) {
        return prev;
      }
      return {
        sessionId: initial.liveSessionId ?? null,
        liveParticipantCount: initial.liveParticipantCount ?? 0,
        isLive: Boolean(initial.liveSessionId),
      };
    });
  }, [initial?.liveSessionId, initial?.liveParticipantCount]);

  // Fallback polling.
  const poll = useQuery({
    queryKey: ["room-presence", roomId],
    queryFn: () =>
      api<RoomPresence>(`/rooms/${roomId}/presence`),
    enabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    apply(poll.data);
  }, [poll.data, apply]);

  // Instant socket updates.
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    if (!socket) return;

    const onPresence = (payload: PresencePayload) => apply(payload);
    const subscribe = () => socket.emit("room:presence:subscribe", { roomId });

    if (socket.connected) subscribe();
    socket.on("connect", subscribe);
    socket.on("room:presence", onPresence);

    return () => {
      socket.off("connect", subscribe);
      socket.off("room:presence", onPresence);
      socket.emit("room:presence:unsubscribe", { roomId });
    };
  }, [roomId, enabled, apply]);

  return presence;
}