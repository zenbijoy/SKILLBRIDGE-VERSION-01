import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";

interface UseClubRealtimeOptions {
  clubId?: string | null;
  enabled?: boolean;
  onEvent?: () => void;
}

export function useClubRealtime({ clubId, enabled = true, onEvent }: UseClubRealtimeOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !clubId) return;

    const socket = getSocket();
    if (!socket) return;

    // Join club real-time broadcast room
    socket.emit("club:join", { clubId });
    socket.emit("room:join", { room: `club:${clubId}` });

    const handlePostCreated = () => {
      queryClient.invalidateQueries({ queryKey: ["club-posts", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      onEvent?.();
    };

    const handlePostLiked = () => {
      queryClient.invalidateQueries({ queryKey: ["club-posts", clubId] });
      onEvent?.();
    };

    const handleCommentCreated = () => {
      queryClient.invalidateQueries({ queryKey: ["club-posts", clubId] });
      onEvent?.();
    };

    const handleEventCreated = () => {
      queryClient.invalidateQueries({ queryKey: ["club-events", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      onEvent?.();
    };

    const handleMemberUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      onEvent?.();
    };

    const handleRecruitmentCreated = () => {
      queryClient.invalidateQueries({ queryKey: ["club-recruitments", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      onEvent?.();
    };

    const handleAchievementAdded = () => {
      queryClient.invalidateQueries({ queryKey: ["club-achievements", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      onEvent?.();
    };

    socket.on("club:post:new", handlePostCreated);
    socket.on("club:post_created", handlePostCreated);
    socket.on("club:announcement_created", handlePostCreated);
    socket.on("club:post_liked", handlePostLiked);
    socket.on("club:comment_created", handleCommentCreated);
    socket.on("club:event_created", handleEventCreated);
    socket.on("club:event:registration_updated", handleEventCreated);
    socket.on("club:event_registered", handleEventCreated);
    socket.on("club:member_joined", handleMemberUpdate);
    socket.on("club:member_left", handleMemberUpdate);
    socket.on("club:recruitment_created", handleRecruitmentCreated);
    socket.on("club:application:updated", handleRecruitmentCreated);
    socket.on("club:application_status_changed", handleRecruitmentCreated);
    socket.on("club:achievement_added", handleAchievementAdded);

    return () => {
      socket.off("club:post:new", handlePostCreated);
      socket.off("club:post_created", handlePostCreated);
      socket.off("club:announcement_created", handlePostCreated);
      socket.off("club:post_liked", handlePostLiked);
      socket.off("club:comment_created", handleCommentCreated);
      socket.off("club:event_created", handleEventCreated);
      socket.off("club:event:registration_updated", handleEventCreated);
      socket.off("club:event_registered", handleEventCreated);
      socket.off("club:member_joined", handleMemberUpdate);
      socket.off("club:member_left", handleMemberUpdate);
      socket.off("club:recruitment_created", handleRecruitmentCreated);
      socket.off("club:application:updated", handleRecruitmentCreated);
      socket.off("club:application_status_changed", handleRecruitmentCreated);
      socket.off("club:achievement_added", handleAchievementAdded);

      socket.emit("club:leave", { clubId });
      socket.emit("room:leave", { room: `club:${clubId}` });
    };
  }, [clubId, enabled, onEvent, queryClient]);
}
