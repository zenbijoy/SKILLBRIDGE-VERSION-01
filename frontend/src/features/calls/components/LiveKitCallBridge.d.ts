import React from "react";

export interface LiveKitCallBridgeProps {
  url: string;
  token: string;
  type: "audio" | "video";
  isMuted: boolean;
  isVideoEnabled: boolean;
  isFrontCamera?: boolean;
  peerName: string;
  peerAvatar?: string | null;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (err: any) => void;
}

export declare const LiveKitCallBridge: React.FC<LiveKitCallBridgeProps>;
