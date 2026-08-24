import React, { useEffect, useRef } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";

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
  isMuted = false,
}: VideoViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <View style={[styles.container, style]}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          transform: mirror ? "scaleX(-1)" : "none",
          backgroundColor: "#000000",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#000000",
  },
});
