import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export interface RoomLiveParticipantPreview {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface RoomLiveStatusPayload {
  openSession: {
    id: string;
    media: "audio" | "video";
    startedAt: string;
    hostId: string;
    participantCount: number;
    participants: RoomLiveParticipantPreview[];
  } | null;
  studySession: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: string;
    hostId: string;
    isLive: boolean;
    participantCount: number;
    participants: RoomLiveParticipantPreview[];
  } | null;
  participantCount: number;
  participants: RoomLiveParticipantPreview[];
  hostId: string | null;
  media: "audio" | "video" | null;
  studyWindow: {
    active: boolean;
    startsAt: string | null;
    endsAt: string | null;
  };
  me: {
    canStartOpen: boolean;
    canStartStudy: boolean;
    canJoin: boolean;
    reason?: string;
    role?: string | null;
    isOwner?: boolean;
    isMember?: boolean;
  };
}

export function useRoomLiveStatus(roomId: string | undefined | null) {
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => ["room-live-status", roomId] as const, [roomId]);

  const query = useQuery<RoomLiveStatusPayload>({
    queryKey,
    queryFn: async () => {
      if (!roomId) throw new Error("No room ID");
      return api<RoomLiveStatusPayload>(`/rooms/${roomId}/live/status`);
    },
    enabled: Boolean(roomId),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    if (!socket) return;

    // Subscribe to room presence / live channel
    socket.emit("room:presence:subscribe", { roomId });

    const handleLiveStatus = (payload: any) => {
      if (payload && payload.roomId === roomId) {
        queryClient.setQueryData(queryKey, payload.status || payload);
      } else if (payload && (payload.openSession !== undefined || payload.studySession !== undefined)) {
        queryClient.setQueryData(queryKey, payload);
      }
    };

    const handleLiveStarted = (event: any) => {
      if (event?.roomId === roomId) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    const handleLiveEnded = (event: any) => {
      if (event?.roomId === roomId) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    const handleLiveParticipants = (event: any) => {
      if (event?.roomId === roomId) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    socket.on("room:live:status", handleLiveStatus);
    socket.on("room:live:started", handleLiveStarted);
    socket.on("room:live:ended", handleLiveEnded);
    socket.on("room:live:participants", handleLiveParticipants);

    return () => {
      socket.off("room:live:status", handleLiveStatus);
      socket.off("room:live:started", handleLiveStarted);
      socket.off("room:live:ended", handleLiveEnded);
      socket.off("room:live:participants", handleLiveParticipants);
      socket.emit("room:presence:unsubscribe", { roomId });
    };
  }, [roomId, queryClient, queryKey]);

  return query;
}
