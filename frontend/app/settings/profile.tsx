/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { Button, Card, ErrorState, Field, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

export default function EditProfile() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["me-edit"],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
  });
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    const p = profile.data?.profile;
    if (!p) return;
    setName(p.full_name ?? "");
    setUsername(p.username ?? "");
    setBio(p.bio ?? "");
    setUniversity(p.university ?? "");
    setDepartment(p.department ?? "");
    setBatch(p.batch ?? "");
    setAvatarUrl(p.avatar_url ?? null);
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      api("/profiles/me", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: name.trim(),
          username: username.trim(),
          bio: bio.trim(),
          university: university.trim(),
          department: department.trim(),
          batch: batch.trim(),
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["me-edit"] });
      Alert.alert("Profile updated", "Your public SkillBridge profile has been saved.");
    },
    onError: (error) => Alert.alert("Could not save profile", error.message),
  });

  const pickAndUploadAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Please allow photo library access to change your avatar.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets[0]?.base64) return;

      triggerHaptic();
      setUploadingAvatar(true);

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      const contentType = mimeType === "image/png" ? "image/png" : mimeType === "image/webp" ? "image/webp" : "image/jpeg";

      const res = await api<{ avatar_url: string; profile: Profile }>("/profiles/me/avatar", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: asset.base64,
          contentType,
        }),
      });

      setAvatarUrl(res.avatar_url);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["me-edit"] });
      Alert.alert("Avatar updated", "Your new profile photo has been saved.");
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message || "Could not upload profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <Screen>
      <H1>Edit Profile</H1>
      <Muted>Keep your academic identity and skill profile clear so recommendations and collaboration matches improve.</Muted>

      {profile.isLoading ? <Skeleton height={260} /> : null}
      {profile.isError ? (
        <ErrorState detail={(profile.error as Error).message} onRetry={() => profile.refetch()} />
      ) : null}

      {profile.data ? (
        <>
          {/* Avatar Header & Upload Tile */}
          <Card tone="glow" style={{ alignItems: "center", paddingVertical: 20, gap: 12 }}>
            <View style={s.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
              ) : (
                <View style={[s.avatarImage, s.avatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={s.initials}>
                    {name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((x) => x[0]?.toUpperCase())
                      .join("") || "SB"}
                  </Text>
                </View>
              )}
              <Pressable
                onPress={pickAndUploadAvatar}
                disabled={uploadingAvatar}
                style={[s.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}
              >
                <MaterialCommunityIcons name="camera" size={16} color={colors.white} />
              </Pressable>
            </View>

            <Button
              title={uploadingAvatar ? "Uploading photo…" : "Change profile photo"}
              variant="secondary"
              icon="image-outline"
              compact
              loading={uploadingAvatar}
              disabled={uploadingAvatar}
              onPress={pickAndUploadAvatar}
            />
          </Card>

          {/* Form Fields */}
          <Card>
            <H2>Academic Identity</H2>
            <Field placeholder="Full name" value={name} onChangeText={setName} />
            <Field autoCapitalize="none" placeholder="Username" value={username} onChangeText={setUsername} />
            <Field placeholder="University / institution" value={university} onChangeText={setUniversity} />
            <Field placeholder="Department (e.g. Computer Science)" value={department} onChangeText={setDepartment} />
            <Field placeholder="Batch / graduation year" value={batch} onChangeText={setBatch} />
            <Field multiline numberOfLines={4} placeholder="Short bio / academic interests" value={bio} onChangeText={setBio} />
          </Card>
        </>
      ) : null}

      <Button
        title={save.isPending ? "Saving changes…" : "Save changes"}
        disabled={save.isPending || name.trim().length < 2 || username.trim().length < 3}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  avatarWrapper: { position: "relative" },
  avatarImage: { width: 92, height: 92, borderRadius: 46 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
});
