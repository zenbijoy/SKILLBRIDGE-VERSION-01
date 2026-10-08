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
 * Disconnect and clean up the socket instance (called on user logout).
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
 * Check if socket is currently connected.
 */
export function isSocketConnected(): boolean {
  return Boolean(socketInstance && socketInstance.connected);
}

/**
 * Register a socket event listener safely across reconnects.
 * Returns an unsubscribe function.
 */
export function onSocket<T = any>(event: string, listener: (data: T) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};
  socket.on(event, listener);
  return () => {
    socket.off(event, listener);
  };
}

/**
 * Emit a socket event safely.
 */
export function emitSocket(event: string, data?: any): void {
  const socket = getSocket();
  if (socket && socket.connected) {
    socket.emit(event, data);
  } else if (socket) {
    socket.connect();
    socket.once("connect", () => {
      socket.emit(event, data);
    });
  }
}

/**
 * Backward compatibility: keep socket alive for real-time screens.
 */
export function acquireSocket(accessToken: string): void {
  connectSocket(accessToken);
}

export function releaseSocket(_gracePeriodMs = 45000): void {
  // Maintained for backward compatibility; do not disconnect background socket
  // to ensure calls can be received at any time.
}
