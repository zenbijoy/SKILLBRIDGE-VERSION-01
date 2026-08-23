import { RTCPeerConnection } from "./webrtc";
import { IceServerItem } from "./iceServers";

export function createPeerConnection(iceServers: IceServerItem[], forceTurn = false) {
  if (!RTCPeerConnection) {
    throw new Error("WebRTC RTCPeerConnection is not supported on this platform.");
  }

  const configuration = {
    iceServers,
    iceTransportPolicy: forceTurn ? "relay" : "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };

  const pc = new RTCPeerConnection(configuration);
  return pc;
}
