import { useEffect, useRef } from "react";
import { create } from "zustand";
import { getSocket, onSocket } from "@/lib/socket";

interface PresenceStore {
  onlineUsers: Record<string, boolean>;
  trackedUserIds: Set<string>;
  setOnline: (userId: string, isOnline: boolean) => void;
  setBatch: (map: Record<string, boolean>) => void;
  trackUsers: (ids: string[]) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  onlineUsers: {},
  trackedUserIds: new Set(),
  setOnline: (userId, isOnline) =>
    set((state) => ({
      onlineUsers: { ...state.onlineUsers, [userId]: isOnline },
    })),
  setBatch: (map) =>
    set((state) => ({
      onlineUsers: { ...state.onlineUsers, ...map },
    })),
  trackUsers: (ids) =>
    set((state) => {
      const next = new Set(state.trackedUserIds);
      let changed = false;
      for (const id of ids) {
        if (id && !next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? { trackedUserIds: next } : {};
    }),
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

  // When socket connects or reconnects, re-check status for all tracked users
  const refreshAllTracked = () => {
    const tracked = Array.from(usePresenceStore.getState().trackedUserIds);
    if (tracked.length === 0) return;
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit("presence:check", { userIds: tracked }, (res: any) => {
        if (res?.status) {
          usePresenceStore.getState().setBatch(res.status);
        }
      });
    }
  };

  onSocket("connect", refreshAllTracked);
  const socket = getSocket();
  if (socket?.io) {
    socket.io.on("reconnect", refreshAllTracked);
  }
}

/**
 * Hook to get real-time active status of a single user.
 */
export function useUserPresence(userId?: string | null, initialOnline?: boolean): boolean {
  initGlobalPresenceListener();

  const isOnlineInStore = usePresenceStore((state) =>
    userId ? state.onlineUsers[userId] : undefined,
  );

  useEffect(() => {
    if (!userId) return;

    usePresenceStore.getState().trackUsers([userId]);

    // Seed initial status if provided and not yet tracked
    if (initialOnline !== undefined && isOnlineInStore === undefined) {
      usePresenceStore.getState().setOnline(userId, initialOnline);
    }

    // Query server for latest live status
    const queryStatus = () => {
      const socket = getSocket();
      if (!socket) return;
      if (socket.connected) {
        socket.emit("presence:check", { userIds: [userId] }, (res: any) => {
          if (res?.status?.[userId] !== undefined) {
            usePresenceStore.getState().setOnline(userId, Boolean(res.status[userId]));
          }
        });
      } else {
        socket.once("connect", () => {
          socket.emit("presence:check", { userIds: [userId] }, (res: any) => {
            if (res?.status?.[userId] !== undefined) {
              usePresenceStore.getState().setOnline(userId, Boolean(res.status[userId]));
            }
          });
        });
      }
    };

    queryStatus();
  }, [userId, initialOnline]);

  if (isOnlineInStore !== undefined) {
    return isOnlineInStore;
  }

  return initialOnline ?? false;
}

/**
 * Hook to batch-query and monitor real-time presence of multiple users (e.g. for inbox or lists).
 */
export function useBatchPresence(userIds: string[]): Record<string, boolean> {
  initGlobalPresenceListener();
  const validIds = userIds.filter(Boolean);
  const idsKey = validIds.sort().join(",");

  useEffect(() => {
    if (validIds.length === 0) return;

    usePresenceStore.getState().trackUsers(validIds);

    const queryBatch = () => {
      const socket = getSocket();
      if (!socket) return;
      if (socket.connected) {
        socket.emit("presence:check", { userIds: validIds }, (res: any) => {
          if (res?.status) {
            usePresenceStore.getState().setBatch(res.status);
          }
        });
      } else {
        socket.once("connect", () => {
          socket.emit("presence:check", { userIds: validIds }, (res: any) => {
            if (res?.status) {
              usePresenceStore.getState().setBatch(res.status);
            }
          });
        });
      }
    };

    queryBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return usePresenceStore((state) => state.onlineUsers);
}

export function toggleMyPresence(isOnlineVisible: boolean): void {
  const socket = getSocket();
  if (socket && socket.connected) {
    socket.emit("presence:toggle", { isOnlineVisible });
  }
}

