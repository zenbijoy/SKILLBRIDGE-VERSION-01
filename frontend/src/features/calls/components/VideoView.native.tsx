import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { RTCView } from "../services/webrtc";

export interface VideoViewProps {
  stream: any;
  style?: StyleProp<ViewStyle>;
  objectFit?: "cover" | "contain";
  mirror?: boolean;
  isMuted?: boolean;
}

export function VideoView({
  stream,
  style,
  objectFit = "cover",
  mirror = false,
}: VideoViewProps) {
  if (!RTCView || !stream) return null;

  return (
    <RTCView
      streamURL={stream.toURL ? stream.toURL() : ""}
      style={style}
      objectFit={objectFit}
      mirror={mirror}
    />
  );
}
