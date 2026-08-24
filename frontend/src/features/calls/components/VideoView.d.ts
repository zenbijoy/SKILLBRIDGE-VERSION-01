import React from "react";
import { StyleProp, ViewStyle } from "react-native";

export interface VideoViewProps {
  stream: any;
  style?: StyleProp<ViewStyle>;
  objectFit?: "cover" | "contain";
  mirror?: boolean;
  isMuted?: boolean;
}

export declare const VideoView: React.FC<VideoViewProps>;
