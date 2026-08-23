import { api } from "@/lib/api";
import { CallType, CallStatus, RealtimeProvider, ProviderConfig } from "../types";

export interface CallRecord {
  id: string;
  caller_id: string;
  callee_id: string;
  type: CallType;
  status: CallStatus;
  created_at: string;
  ringing_at?: string | null;
  answered_at?: string | null;
  connected_at?: string | null;
  ended_at?: string | null;
  duration_seconds: number;
  end_reason?: string | null;
  metadata?: Record<string, any>;
  caller?: { full_name?: string; username?: string; avatar_url?: string | null };
  callee?: { full_name?: string; username?: string; avatar_url?: string | null };
}

export interface CallResponse {
  call: CallRecord;
  provider: RealtimeProvider;
  providerConfig?: ProviderConfig;
}

export async function initiateCallApi(calleeId: string, type: CallType = "video"): Promise<CallResponse> {
  const res = await api<CallResponse>("/calls", {
    method: "POST",
    body: JSON.stringify({ calleeId, type }),
  });
  return res;
}

export async function acceptCallApi(callId: string): Promise<CallResponse> {
  const res = await api<CallResponse>(`/calls/${callId}/accept`, {
    method: "POST",
  });
  return res;
}

export async function rejectCallApi(callId: string, reason: "declined" | "busy" = "declined"): Promise<CallRecord> {
  const res = await api<{ call: CallRecord }>(`/calls/${callId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return res.call;
}

export async function endCallApi(
  callId: string,
  durationSeconds = 0,
  reason = "hangup",
  telemetry?: { relayUsed?: boolean; setupTimeMs?: number; reconnectCount?: number },
): Promise<CallRecord> {
  const res = await api<{ call: CallRecord }>(`/calls/${callId}/end`, {
    method: "POST",
    body: JSON.stringify({
      durationSeconds,
      reason,
      relayUsed: telemetry?.relayUsed,
      setupTimeMs: telemetry?.setupTimeMs,
      reconnectCount: telemetry?.reconnectCount,
    }),
  });
  return res.call;
}

export async function getCallHistoryApi(limit = 30): Promise<CallRecord[]> {
  const res = await api<{ calls: CallRecord[] }>(`/calls/history?limit=${limit}`);
  return res.calls || [];
}
