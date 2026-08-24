let RTCPeerConnectionClass: any = typeof window !== "undefined" ? (window as any).RTCPeerConnection : null;
let RTCIceCandidateClass: any = typeof window !== "undefined" ? (window as any).RTCIceCandidate : null;
let RTCSessionDescriptionClass: any = typeof window !== "undefined" ? (window as any).RTCSessionDescription : null;
let mediaDevicesInstance: any = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
let RTCViewComponent: any = null;

export const RTCPeerConnection = RTCPeerConnectionClass;
export const RTCIceCandidate = RTCIceCandidateClass;
export const RTCSessionDescription = RTCSessionDescriptionClass;
export const mediaDevices = mediaDevicesInstance;
export const RTCView = RTCViewComponent;

export function isWebRTCSupported(): boolean {
  return Boolean(RTCPeerConnectionClass && mediaDevicesInstance);
}
