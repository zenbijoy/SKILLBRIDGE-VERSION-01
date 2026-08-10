import { useState } from "react";
import { Alert } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
} from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";

function BlockedUsersList() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["blocked-users"],
    queryFn: () => api<{ data: { blocked_id: string; blocked: any }[] }>("/account/blocks"),
  });
  const unblock = useMutation({
    mutationFn: (id: string) => api(`/account/blocks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blocked-users"] });
      Alert.alert("Success", "User unblocked");
    },
  });

  if (q.data?.data?.length === 0) return <Muted>You haven't blocked anyone.</Muted>;

  return (
    <>
      {q.data?.data?.map((b) => (
        <Row key={b.blocked_id} style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Muted>{b.blocked?.full_name}</Muted>
          <Button title="Unblock" variant="secondary" onPress={() => unblock.mutate(b.blocked_id)} />
        </Row>
      ))}
    </>
  );
}
export default function Privacy() {
  const q = useQuery({
    queryKey: ["privacy"],
    queryFn: () =>
      api<{ visibility: string; blocked: { id: string; full_name: string }[] }>(
        "/profiles/me/privacy",
      ),
  });
  const [visibility, setVisibility] = useState("public");
  const update = useMutation({
    mutationFn: () =>
      api("/profiles/me/privacy", {
        method: "PATCH",
        body: JSON.stringify({ profile_visibility: visibility }),
      }),
    onSuccess: () => Alert.alert("Privacy updated"),
  });
  const del = useMutation({
    mutationFn: () =>
      api("/account", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE" }),
      }),
    onSuccess: () =>
      Alert.alert(
        "Account deleted",
        "Your authentication account and cascaded profile data were deleted.",
      ),
  });
  return (
    <Screen>
      <H1>Privacy & safety</H1>
      <Card>
        <H2>Profile visibility</H2>
        <Row>
          {["public", "connections", "private"].map((x) => (
            <Pill
              key={x}
              tone={
                (q.data?.visibility ?? visibility) === x ? "accent" : "default"
              }
            >
              {x}
            </Pill>
          ))}
        </Row>
        <Button
          title="Set public"
          variant="secondary"
          onPress={() => {
            setVisibility("public");
            update.mutate();
          }}
        />
        <Button
          title="Set connections only"
          variant="secondary"
          onPress={() => {
            setVisibility("connections");
            update.mutate();
          }}
        />
        <Button
          title="Set private"
          variant="secondary"
          onPress={() => {
            setVisibility("private");
            update.mutate();
          }}
        />
      </Card>
      <Card>
        <H2>Blocked users</H2>
        <BlockedUsersList />
      </Card>
      <Card>
        <H2>Account deletion</H2>
        <Muted>
          Production app-store compliance requires an accessible
          account-deletion path. This endpoint performs server-side deletion
          after confirmation.
        </Muted>
        <Button
          title="Permanently delete account"
          variant="danger"
          onPress={() =>
            Alert.alert("Delete account?", "This is permanent.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => del.mutate(),
              },
            ])
          }
        />
      </Card>
    </Screen>
  );
}
