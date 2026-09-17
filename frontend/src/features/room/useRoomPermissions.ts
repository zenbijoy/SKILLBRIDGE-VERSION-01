import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RoomPermissions } from "@/types";

export function useRoomPermissions(roomId?: string) {
  const query = useQuery({
    queryKey: ["room-permissions", roomId],
    queryFn: () => api<RoomPermissions>(`/rooms/${roomId}/permissions`),
    enabled: Boolean(roomId),
    staleTime: 30_000,
  });

  const permissions: RoomPermissions = query.data ?? {
    role: null,
    isOwner: false,
    isMember: false,
    canPost: false,
    canAnnounce: false,
    canPin: false,
    canModerate: false,
    canStartLive: false,
    canUploadResource: false,
    canManageMembers: false,
    canManageRoles: false,
    canManageChannels: false,
  };

  return {
    ...permissions,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
