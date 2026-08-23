import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Props {
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
  isFrontCamera: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onToggleCameraFacing: () => void;
  onEndCall: () => void;
}

export const CallControls: React.FC<Props> = ({
  isMuted,
  isVideoEnabled,
  isSpeakerOn,
  isFrontCamera,
  onToggleMute,
  onToggleVideo,
  onToggleSpeaker,
  onToggleCameraFacing,
  onEndCall,
}) => {
  return (
    <View style={styles.container}>
      {/* Mute Toggle */}
      <TouchableOpacity
        style={[styles.button, isMuted && styles.activeButton]}
        onPress={onToggleMute}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name={isMuted ? "microphone-off" : "microphone"}
          size={26}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Video Toggle */}
      <TouchableOpacity
        style={[styles.button, !isVideoEnabled && styles.activeButton]}
        onPress={onToggleVideo}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name={isVideoEnabled ? "camera" : "camera-off"}
          size={26}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Flip Camera */}
      <TouchableOpacity
        style={styles.button}
        onPress={onToggleCameraFacing}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="camera-flip" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Speaker Toggle */}
      <TouchableOpacity
        style={[styles.button, isSpeakerOn && styles.highlightButton]}
        onPress={onToggleSpeaker}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name={isSpeakerOn ? "volume-high" : "volume-medium"}
          size={26}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* End Call Button */}
      <TouchableOpacity style={styles.endButton} onPress={onEndCall} activeOpacity={0.8}>
        <MaterialCommunityIcons name="phone-hangup" size={30} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "rgba(10, 15, 29, 0.95)",
    borderRadius: 36,
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeButton: {
    backgroundColor: "rgba(239, 68, 68, 0.4)",
  },
  highlightButton: {
    backgroundColor: "rgba(59, 130, 246, 0.4)",
  },
  endButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
});
