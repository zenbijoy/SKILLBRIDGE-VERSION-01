import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { SOCKET_URL } from "./config";

let socketInstance: Socket | null = null;
let activeScreenUsers = 0;
let idleDisconnectTimeout: NodeJS.Timeout | null = null;

export function getSocket(): Socket | null {
  if (typeof window === "undefined" && Platform.OS === "web") {
    return null;
  }

  if (socketInstance) {
    return socketInstance;
  }

  const url = SOCKET_URL;

  socketInstance = io(url, {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
  });

  socketInstance.on("reconnect_attempt", async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session && socketInstance) {
      socketInstance.auth = { token: data.session.access_token };
    }
  });

  return socketInstance;
}

/**
 * Connect the socket with a valid access token.
 * Must be called after the user has an active session.
 */
export function connectSocket(accessToken: string): void {
  const socket = getSocket();
  if (!socket) return;
  socket.auth = { token: accessToken };
  if (!socket.connected) {
    socket.connect();
  }
}

/**
 * Disconnect and clean up the socket instance.
 */
export function disconnectSocket(): void {
  if (idleDisconnectTimeout) {
    clearTimeout(idleDisconnectTimeout);
    idleDisconnectTimeout = null;
  }
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  activeScreenUsers = 0;
}

/**
 * Lazy Socket Lifecycle:
 * Acquire socket connection when entering real-time screens (Chat / Calling).
 */
export function acquireSocket(accessToken: string): void {
  if (idleDisconnectTimeout) {
    clearTimeout(idleDisconnectTimeout);
    idleDisconnectTimeout = null;
  }
  activeScreenUsers++;
  connectSocket(accessToken);
}

/**
 * Release socket connection when navigating away from real-time screens.
 * Waits for grace period before disconnecting to prevent re-connect thrashing.
 */
export function releaseSocket(gracePeriodMs = 45000): void {
  activeScreenUsers = Math.max(0, activeScreenUsers - 1);
  if (activeScreenUsers === 0 && !idleDisconnectTimeout) {
    idleDisconnectTimeout = setTimeout(() => {
      if (activeScreenUsers === 0) {
        disconnectSocket();
      }
      idleDisconnectTimeout = null;
    }, gracePeriodMs);
  }
}
