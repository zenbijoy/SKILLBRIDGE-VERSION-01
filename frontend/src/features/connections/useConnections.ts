import { useMemo } from "react";
import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { triggerHaptic } from "@/components/ui";
import type { Profile } from "@/types";

export type ConnectionStatus =
  | "self"
  | "connected"
  | "pending_outgoing"
  | "pending_incoming"
  | "none";

export interface IncomingConnectionRequest {
  id: string;
  requester_id?: string;
  requester: Profile;
  created_at?: string;
}

export interface OutgoingConnectionRequest {
  id: string;
  recipient_id: string;
  status: string;
  created_at?: string;
  recipient?: Profile;
}

export interface ConnectionsResponse {
  connections: Profile[];
  incoming: IncomingConnectionRequest[];
  outgoing: OutgoingConnectionRequest[];
  suggested: Profile[];
}

export function useConnections() {
  const qc = useQueryClient();
  const { session } = useSession();
  const myUserId = session?.user?.id;

  const connectionsQuery = useQuery<ConnectionsResponse>({
    queryKey: ["connections"],
    queryFn: () => api<ConnectionsResponse>("/connections"),
    staleTime: 15_000,
  });

  const connections = useMemo(
    () => connectionsQuery.data?.connections ?? [],
    [connectionsQuery.data?.connections]
  );
  const incoming = useMemo(
    () => connectionsQuery.data?.incoming ?? [],
    [connectionsQuery.data?.incoming]
  );
  const outgoing = useMemo(
    () => connectionsQuery.data?.outgoing ?? [],
    [connectionsQuery.data?.outgoing]
  );
  const suggested = useMemo(
    () => connectionsQuery.data?.suggested ?? [],
    [connectionsQuery.data?.suggested]
  );

  // Fast set-based lookups
  const connectedIdSet = useMemo(
    () => new Set(connections.map((c) => c.id)),
    [connections]
  );
  const outgoingIdMap = useMemo(
    () => new Map(outgoing.map((o) => [o.recipient_id, o])),
    [outgoing]
  );
  const incomingIdMap = useMemo(
    () =>
      new Map(
        incoming.map((i) => [i.requester_id || i.requester?.id, i])
      ),
    [incoming]
  );

  /**
   * Evaluates the real LinkedIn-grade relationship status with any target user.
   */
  const getConnectionStatus = (targetUserId: string): ConnectionStatus => {
    if (!targetUserId) return "none";
    if (myUserId && targetUserId === myUserId) return "self";
    if (connectedIdSet.has(targetUserId)) return "connected";
    if (outgoingIdMap.has(targetUserId)) return "pending_outgoing";
    if (incomingIdMap.has(targetUserId)) return "pending_incoming";
    return "none";
  };

  /**
   * 1. Send Connection Request (with instant optimistic UI transition)
   */
  const sendRequestMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api<any>("/connections/requests", {
        method: "POST",
        body: JSON.stringify({ recipientId }),
      }),
    onMutate: async (recipientId: string) => {
      triggerHaptic("selection");
      await qc.cancelQueries({ queryKey: ["connections"] });
      const previous = qc.getQueryData<ConnectionsResponse>(["connections"]);

      if (previous) {
        qc.setQueryData<ConnectionsResponse>(["connections"], {
          ...previous,
          outgoing: [
            ...(previous.outgoing ?? []),
            {
              id: `optimistic-${Date.now()}`,
              recipient_id: recipientId,
              status: "pending",
              created_at: new Date().toISOString(),
            },
          ],
        });
      }

      return { previous };
    },
    onSuccess: (res, recipientId) => {
      triggerHaptic("notificationSuccess");
      // If mutual auto-accept happened on the server, reload queries
      if (res?.autoAccepted || res?.alreadyConnected) {
        qc.invalidateQueries({ queryKey: ["connections"] });
      }
      qc.invalidateQueries({ queryKey: ["profile", recipientId] });
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: any, recipientId, context) => {
      if (context?.previous) {
        qc.setQueryData(["connections"], context.previous);
      }
      Alert.alert(
        "Could not connect",
        err.message || "Failed to send connection request. Please try again."
      );
    },
  });

  /**
   * 2. Withdraw / Cancel Pending Outgoing Request
   */
  const withdrawRequestMutation = useMutation({
    mutationFn: ({
      recipientId,
      requestId,
    }: {
      recipientId: string;
      requestId?: string;
    }) => {
      if (requestId && !requestId.startsWith("optimistic-")) {
        return api(`/connections/requests/${requestId}`, { method: "DELETE" });
      }
      return api(`/connections/requests/to/${recipientId}`, { method: "DELETE" });
    },
    onMutate: async ({ recipientId }) => {
      triggerHaptic();
      await qc.cancelQueries({ queryKey: ["connections"] });
      const previous = qc.getQueryData<ConnectionsResponse>(["connections"]);

      if (previous) {
        qc.setQueryData<ConnectionsResponse>(["connections"], {
          ...previous,
          outgoing: (previous.outgoing ?? []).filter(
            (o) => o.recipient_id !== recipientId
          ),
        });
      }

      return { previous };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      qc.invalidateQueries({ queryKey: ["profile", vars.recipientId] });
    },
    onError: (err: any, vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["connections"], context.previous);
      }
      Alert.alert(
        "Action Failed",
        err.message || "Could not withdraw connection request."
      );
    },
  });

  /**
   * 3. Respond to Incoming Request (Accept / Decline)
   */
  const respondMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "accepted" | "declined";
      requester?: Profile;
    }) =>
      api<any>(`/connections/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onMutate: async ({ id, status, requester }) => {
      triggerHaptic(status === "accepted" ? "notificationSuccess" : "selection");
      await qc.cancelQueries({ queryKey: ["connections"] });
      const previous = qc.getQueryData<ConnectionsResponse>(["connections"]);

      if (previous) {
        const found = previous.incoming?.find((i) => i.id === id);
        const acceptedProfile = requester || found?.requester;

        qc.setQueryData<ConnectionsResponse>(["connections"], {
          ...previous,
          incoming: (previous.incoming ?? []).filter((i) => i.id !== id),
          connections:
            status === "accepted" && acceptedProfile
              ? [...(previous.connections ?? []), acceptedProfile]
              : previous.connections ?? [],
        });
      }

      return { previous };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      if (vars.requester?.id) {
        qc.invalidateQueries({ queryKey: ["profile", vars.requester.id] });
      }
    },
    onError: (err: any, _, context) => {
      if (context?.previous) {
        qc.setQueryData(["connections"], context.previous);
      }
      Alert.alert(
        "Action Failed",
        err.message || "Could not process request."
      );
    },
  });

  /**
   * 4. Remove Existing Connection
   */
  const removeConnectionMutation = useMutation({
    mutationFn: (userId: string) =>
      api(`/connections/${userId}`, { method: "DELETE" }),
    onMutate: async (userId: string) => {
      triggerHaptic();
      await qc.cancelQueries({ queryKey: ["connections"] });
      const previous = qc.getQueryData<ConnectionsResponse>(["connections"]);

      if (previous) {
        qc.setQueryData<ConnectionsResponse>(["connections"], {
          ...previous,
          connections: (previous.connections ?? []).filter((c) => c.id !== userId),
        });
      }

      return { previous };
    },
    onSuccess: (_, userId) => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    },
    onError: (err: any, _, context) => {
      if (context?.previous) {
        qc.setQueryData(["connections"], context.previous);
      }
      Alert.alert(
        "Could not remove connection",
        err.message || "Failed to remove connection."
      );
    },
  });

  /**
   * Prompt to confirm removing a friend / connection
   */
  const promptRemoveConnection = (user: Profile) => {
    Alert.alert(
      "Remove Connection",
      `Are you sure you want to remove ${user.full_name || user.username} from your network?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeConnectionMutation.mutate(user.id),
        },
      ]
    );
  };

  /**
   * Prompt to confirm withdrawing a sent connection request
   */
  const promptWithdrawRequest = (user: Profile) => {
    const out = outgoingIdMap.get(user.id);
    Alert.alert(
      "Withdraw Invitation",
      `Withdraw your connection request to ${user.full_name || user.username}?`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Withdraw",
          style: "destructive",
          onPress: () =>
            withdrawRequestMutation.mutate({
              recipientId: user.id,
              requestId: out?.id,
            }),
        },
      ]
    );
  };

  return {
    ...connectionsQuery,
    connections,
    incoming,
    outgoing,
    suggested,
    myUserId,
    getConnectionStatus,
    getIncomingRequest: (targetUserId: string) => incomingIdMap.get(targetUserId),
    getOutgoingRequest: (targetUserId: string) => outgoingIdMap.get(targetUserId),
    sendRequest: (targetUserId: string) => sendRequestMutation.mutate(targetUserId),
    withdrawRequest: (targetUserId: string, requestId?: string) =>
      withdrawRequestMutation.mutate({ recipientId: targetUserId, requestId }),
    acceptRequest: (requestId: string, requester?: Profile) =>
      respondMutation.mutate({ id: requestId, status: "accepted", requester }),
    declineRequest: (requestId: string) =>
      respondMutation.mutate({ id: requestId, status: "declined" }),
    removeConnection: (targetUserId: string) =>
      removeConnectionMutation.mutate(targetUserId),
    promptRemoveConnection,
    promptWithdrawRequest,
    isMutating:
      sendRequestMutation.isPending ||
      withdrawRequestMutation.isPending ||
      respondMutation.isPending ||
      removeConnectionMutation.isPending,
  };
}
