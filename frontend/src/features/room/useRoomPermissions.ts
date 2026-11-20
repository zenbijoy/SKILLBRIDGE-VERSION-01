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
    isAdmin: false,
    isTeacher: false,
    isModerator: false,
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
    assignableRoles: [],
    roleHierarchy: { owner: 5, admin: 4, teacher: 4, moderator: 3, member: 2, guest: 1 },
  };

  return {
    ...permissions,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
