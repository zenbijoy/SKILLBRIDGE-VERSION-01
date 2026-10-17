import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  triggerHaptic,
} from "@/components/ui";
import { useTheme } from "@/theme";
import { toggleMyPresence } from "@/features/presence/usePresence";

type PrivacySettings = {
  visibility: string;
  profile_visibility: string;
  who_can_message: string;
  who_can_call: string;
  presence_visibility: string;
  blocked: { id: string; full_name: string }[];
};

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
      Alert.alert("সফল", "ব্যবহারকারী অনবলক করা হয়েছে");
    },
  });

  if (q.data?.data?.length === 0) return <Muted>আপনি কারও ব্লক করেননি।</Muted>;

  return (
    <>
      {q.data?.data?.map((b) => (
        <Row key={b.blocked_id} style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Muted>{b.blocked?.full_name}</Muted>
          <Button title="অনবলক করুন" variant="secondary" compact onPress={() => unblock.mutate(b.blocked_id)} />
        </Row>
      ))}
    </>
  );
}

function PrivacyOption({
  label,
  sub,
  value,
  options,
  onChange,
}: {
  label: string;
  sub: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ gap: 6 }}>
        <H2>{label}</H2>
        <Muted>{sub}</Muted>
      </View>
      <Row style={{ gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <Pill
            key={opt.value}
            tone={value === opt.value ? "accent" : "default"}
            onPress={() => onChange(opt.value)}
          >
            {opt.label}
          </Pill>
        ))}
      </Row>
    </Card>
  );
}

function MessengerActiveStatusSetting({
  presenceVisibility,
  onChange,
}: {
  presenceVisibility: string;
  onChange: (v: string) => void;
}) {
  const { colors } = useTheme();
  const isActiveStatusOn = presenceVisibility !== "nobody";

  const handleToggle = (val: boolean) => {
    triggerHaptic();
    const nextVal = val ? "everyone" : "nobody";
    toggleMyPresence(val);
    onChange(nextVal);
  };

  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Row style={{ gap: 12, alignItems: "center", flex: 1 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isActiveStatusOn ? "rgba(34, 197, 94, 0.15)" : colors.surface2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: isActiveStatusOn ? "#22C55E" : colors.muted,
                borderWidth: 2,
                borderColor: colors.surface,
              }}
            />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <H2>সক্রিয় স্ট্যাটাস (Active Status)</H2>
            <Muted>অনলাইন থাকলে বন্ধুদের জানান</Muted>
          </View>
        </Row>
        <Switch
          value={isActiveStatusOn}
          onValueChange={handleToggle}
          trackColor={{ false: colors.border, true: "#22C55E" }}
          thumbColor="#FFFFFF"
        />
      </Row>

      <Muted style={{ fontSize: 12.5, lineHeight: 18 }}>
        {isActiveStatusOn
          ? "সক্রিয় স্ট্যাটাস চালু আছে। আপনার বন্ধুরা দেখতে পাবেন আপনি কখন অনলাইনে আছেন এবং আপনিও তাদের সক্রিয় স্ট্যাটাস দেখতে পাবেন।"
          : "সক্রিয় স্ট্যাটাস বন্ধ রয়েছে। অন্য কেউ আপনার সবুজ একটিভ ডট দেখতে পাবে না, এবং আপনিও অন্যদের সক্রিয় স্ট্যাটাস দেখতে পাবেন না।"}
      </Muted>

      {isActiveStatusOn && (
        <View style={{ gap: 8, marginTop: 4 }}>
          <Muted style={{ fontSize: 12, fontWeight: "700" }}>কারা আপনার সক্রিয় স্ট্যাটাস দেখতে পাবে:</Muted>
          <Row style={{ gap: 8, flexWrap: "wrap" }}>
            <Pill
              tone={presenceVisibility === "everyone" ? "accent" : "default"}
              onPress={() => {
                triggerHaptic();
                onChange("everyone");
              }}
            >
              সবাই (Everyone)
            </Pill>
            <Pill
              tone={presenceVisibility === "connections" ? "accent" : "default"}
              onPress={() => {
                triggerHaptic();
                onChange("connections");
              }}
            >
              শুধু সংযোগ (Connections only)
            </Pill>
          </Row>
        </View>
      )}
    </Card>
  );
}

export default function Privacy() {
  const qc = useQueryClient();
  const q = useQuery<PrivacySettings>({
    queryKey: ["privacy"],
    queryFn: () => api("/profiles/me/privacy"),
  });

  const p = q.data;

  const updateVisibility = useMutation({
    mutationFn: (nextVisibility: string) =>
      api("/profiles/me/privacy", {
        method: "PATCH",
        body: JSON.stringify({ profile_visibility: nextVisibility }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["privacy"] });
      Alert.alert("সফল", "প্রোফাইল দৃশ্যমানতা আপডেট করা হয়েছে");
    },
    onError: (error) => Alert.alert("সমস্যা", error.message),
  });

  const updateWhoCanMessage = useMutation({
    mutationFn: (v: string) =>
      api("/profiles/me/privacy", {
        method: "PATCH",
        body: JSON.stringify({ who_can_message: v }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["privacy"] });
      Alert.alert("সফল", "মেসেজিং সেটিংস আপডেট করা হয়েছে");
    },
  });

  const updateWhoCanCall = useMutation({
    mutationFn: (v: string) =>
      api("/profiles/me/privacy", {
        method: "PATCH",
        body: JSON.stringify({ who_can_call: v }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["privacy"] });
      Alert.alert("সফল", "কল সেটিংস আপডেট করা হয়েছে");
    },
  });

  const updatePresence = useMutation({
    mutationFn: (v: string) =>
      api("/profiles/me/privacy", {
        method: "PATCH",
        body: JSON.stringify({ presence_visibility: v }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["privacy"] });
      Alert.alert("সফল", "অনলাইন স্ট্যাটাস সেটিংস আপডেট করা হয়েছে");
    },
  });

  const del = useMutation({
    mutationFn: () =>
      api("/account", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE" }),
      }),
    onSuccess: () =>
      Alert.alert(
        "অ্যাকাউন্ট মুছে ফেলা হয়েছে",
        "আপনার অথেন্টিকেশন অ্যাকাউন্ট এবং কাসকেডেড প্রোফাইল ডেটা মুছে ফেলা হয়েছে।",
      ),
  });

  return (
    <Screen>
      <H1>গোপনীয়তা ও নিরাপত্তা</H1>

      <PrivacyOption
        label="প্রোফাইল দৃশ্যমানতা"
        sub="কスト আপনার প্রোফাইল দেখতে পাবে"
        value={p?.profile_visibility ?? "public"}
        options={[
          { label: "সর্বজনীন", value: "public" },
          { label: "শুধু সংযোগ", value: "connections" },
          { label: "ব্যক্তিগত", value: "private" },
        ]}
        onChange={(v) => updateVisibility.mutate(v)}
      />

      <PrivacyOption
        label="মেসেজ পাঠাতে পারে কে"
        sub="কisko আপনাকে মেসেজ পাঠাতে পারবে"
        value={p?.who_can_message ?? "everyone"}
        options={[
          { label: "সবাই", value: "everyone" },
          { label: "শুধু সংযোগ", value: "connections" },
          { label: "কাউকেই না", value: "nobody" },
        ]}
        onChange={(v) => updateWhoCanMessage.mutate(v)}
      />

      <PrivacyOption
        label="কল করতে পারে কে"
        sub="কisko আপনাকে কল করতে পারবে"
        value={p?.who_can_call ?? "everyone"}
        options={[
          { label: "সবাই", value: "everyone" },
          { label: "শুধু সংযোগ", value: "connections" },
          { label: "কাউকেই না", value: "nobody" },
        ]}
        onChange={(v) => updateWhoCanCall.mutate(v)}
      />

      <MessengerActiveStatusSetting
        presenceVisibility={p?.presence_visibility ?? "everyone"}
        onChange={(v) => updatePresence.mutate(v)}
      />

      <Card>
        <H2>ব্লক করা ব্যবহারকারী</H2>
        <BlockedUsersList />
      </Card>

      <Card style={{ gap: 8 }}>
        <H2>অ্যাকাউন্ট মুছে ফেলুন</H2>
        <Muted>
          প্রোডাকশন অ্যাপ-স্টোর মেনে চলার জন্য অ্যাকাউন্ট-ডিলিশন পথ প্রয়োজন। এই এন্ডপয়েন্টটি নিশ্চিতকরণের পর সার্ভার-সাইড ডিলিশন করে।
        </Muted>
        <Button
          title="অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলুন"
          variant="danger"
          onPress={() =>
            Alert.alert("অ্যাকাউন্ট মুছবেন?", "এটি স্থায়ী।", [
              { text: "বাতিল", style: "cancel" },
              { text: "মুছুন", style: "destructive", onPress: () => del.mutate() },
            ])
          }
        />
      </Card>
    </Screen>
  );
}
