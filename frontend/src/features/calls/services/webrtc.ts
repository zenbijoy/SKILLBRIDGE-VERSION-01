import { Platform } from "react-native";

let RTCPeerConnectionClass: any = typeof window !== "undefined" ? (window as any).RTCPeerConnection : null;
let RTCIceCandidateClass: any = typeof window !== "undefined" ? (window as any).RTCIceCandidate : null;
let RTCSessionDescriptionClass: any = typeof window !== "undefined" ? (window as any).RTCSessionDescription : null;
let mediaDevicesInstance: any = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
let RTCViewComponent: any = null;

if (Platform.OS !== "web") {
  try {
    // Native React Native WebRTC bindings via @livekit/react-native-webrtc
    const nativeWebRTC = require("@livekit/react-native-webrtc");
    RTCPeerConnectionClass = nativeWebRTC.RTCPeerConnection;
    RTCIceCandidateClass = nativeWebRTC.RTCIceCandidate;
    RTCSessionDescriptionClass = nativeWebRTC.RTCSessionDescription;
    mediaDevicesInstance = nativeWebRTC.mediaDevices;
    RTCViewComponent = nativeWebRTC.RTCView;
  } catch (err) {
    console.warn("Could not load native WebRTC modules:", err);
  }
}

export const RTCPeerConnection = RTCPeerConnectionClass;
export const RTCIceCandidate = RTCIceCandidateClass;
export const RTCSessionDescription = RTCSessionDescriptionClass;
export const mediaDevices = mediaDevicesInstance;
export const RTCView = RTCViewComponent;

export function isWebRTCSupported(): boolean {
  return Boolean(RTCPeerConnectionClass && mediaDevicesInstance);
}
