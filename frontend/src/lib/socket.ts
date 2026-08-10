import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

let socketInstance: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === "undefined" && Platform.OS === "web") {
    return null;
  }

  if (socketInstance) {
    return socketInstance;
  }

  const url = (
    process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
  ).replace("/api/v1", "");

  socketInstance = io(url, {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socketInstance.on("reconnect_attempt", async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session && socketInstance) {
      socketInstance.auth = { token: data.session.access_token };
    }
  });

  return socketInstance;
}
