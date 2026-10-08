import { useEffect } from "react";
import { create } from "zustand";
import { getSocket, onSocket } from "@/lib/socket";

interface PresenceStore {
  onlineUsers: Record<string, boolean>;
  setOnline: (userId: string, isOnline: boolean) => void;
  setBatch: (map: Record<string, boolean>) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  onlineUsers: {},
  setOnline: (userId, isOnline) =>
    set((state) => ({
      onlineUsers: { ...state.onlineUsers, [userId]: isOnline },
    })),
  setBatch: (map) =>
    set((state) => ({
      onlineUsers: { ...state.onlineUsers, ...map },
    })),
}));

let isListening = false;

export function initGlobalPresenceListener(): void {
  if (isListening) return;
  isListening = true;

  onSocket("user:online", (data: { userId?: string }) => {
    if (data?.userId) {
      usePresenceStore.getState().setOnline(data.userId, true);
    }
  });

  onSocket("user:offline", (data: { userId?: string }) => {
    if (data?.userId) {
      usePresenceStore.getState().setOnline(data.userId, false);
    }
  });

  onSocket("presence:status", (data: { status?: Record<string, boolean> }) => {
    if (data?.status) {
      usePresenceStore.getState().setBatch(data.status);
    }
  });
}

/**
 * Hook to get real-time active status of a user.
 */
export function useUserPresence(userId?: string | null, initialOnline?: boolean): boolean {
  initGlobalPresenceListener();

  const isOnlineInStore = usePresenceStore((state) =>
    userId ? state.onlineUsers[userId] : undefined,
  );

  useEffect(() => {
    if (!userId) return;

    // Seed initial status if provided
    if (initialOnline !== undefined && isOnlineInStore === undefined) {
      usePresenceStore.getState().setOnline(userId, initialOnline);
    }

    // Query server for latest live status
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit("presence:check", { userIds: [userId] }, (res: any) => {
        if (res?.status?.[userId] !== undefined) {
          usePresenceStore.getState().setOnline(userId, Boolean(res.status[userId]));
        }
      });
    }
  }, [userId, initialOnline, isOnlineInStore]);

  if (isOnlineInStore !== undefined) {
    return isOnlineInStore;
  }

  return initialOnline ?? false;
}
