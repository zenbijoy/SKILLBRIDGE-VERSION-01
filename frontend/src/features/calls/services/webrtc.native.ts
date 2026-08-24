let RTCPeerConnectionClass: any = null;
let RTCIceCandidateClass: any = null;
let RTCSessionDescriptionClass: any = null;
let mediaDevicesInstance: any = null;
let RTCViewComponent: any = null;

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

export const RTCPeerConnection = RTCPeerConnectionClass;
export const RTCIceCandidate = RTCIceCandidateClass;
export const RTCSessionDescription = RTCSessionDescriptionClass;
export const mediaDevices = mediaDevicesInstance;
export const RTCView = RTCViewComponent;

export function isWebRTCSupported(): boolean {
  return Boolean(RTCPeerConnectionClass && mediaDevicesInstance);
}
