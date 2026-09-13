import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, Linking, Image } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Card, Pill, Row } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import { nextGenEmptyStates } from "@/assets/nextgen";

export type MaterialResource = {
  id: string;
  room_id: string;
  title: string;
  description?: string;
  url: string;
  storage_path?: string;
  kind: "note" | "slide" | "link" | "file" | "image";
  created_at: string;
};

export function RoomMaterialsHub({
  roomId,
  isMember,
  resources = [],
}: {
  roomId: string;
  isMember: boolean;
  resources?: { id: string; title: string; url: string }[];
}) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"note" | "slide" | "file" | "link">("slide");

  const storageStatusQuery = useQuery({
    queryKey: ["storage-status"],
    queryFn: () => api<{ provider: string; available: boolean }>("/resources/storage-status"),
    staleTime: 60000,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api(`/resources`, {
        method: "POST",
        body: JSON.stringify({ room_id: roomId, title, url, kind }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      setShowAddModal(false);
      setTitle("");
      setUrl("");
    },
    onError: (err: Error) => Alert.alert("Could not add material", err.message),
  });

  const getKindIcon = (k: string) => {
    switch (k) {
      case "slide":
        return "file-powerpoint";
      case "note":
        return "notebook";
      case "image":
        return "file-image";
      default:
        return "file-document";
    }
  };

  return (
    <View style={styles.container}>
      <Row style={styles.headerRow}>
        <Row style={{ alignItems: "center", gap: 8 }}>
          <Text style={[styles.title, { color: colors.text }]}>Study Materials & Handouts</Text>
          {storageStatusQuery.data && (
            <Pill tone="accent">
              {storageStatusQuery.data.provider === "cloudflare-r2" ? "R2 Cloud Vault" : "Storage Vault"}
            </Pill>
          )}
        </Row>
        {isMember && (
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="plus-circle" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Share Material</Text>
          </Pressable>
        )}
      </Row>

      {showAddModal && (
        <Card style={styles.addCard}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Share Learning Resource</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Document Title (e.g. Midterm Review Slides)"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Link / Cloud URL (PDF, Google Drive, or R2 Link)"
            placeholderTextColor={colors.muted}
            value={url}
            onChangeText={setUrl}
          />

          <Text style={[styles.kindLabel, { color: colors.muted }]}>Category / Type:</Text>
          <Row style={{ gap: 8, marginBottom: 12 }}>
            {(["slide", "note", "file", "link"] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[
                  styles.kindPill,
                  {
                    borderColor: kind === k ? colors.primary : colors.border,
                    backgroundColor: kind === k ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: kind === k ? "#FFFFFF" : colors.text, fontWeight: "600", fontSize: 12 }}>
                  {k.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </Row>

          <Row style={styles.actionRow}>
            <Pressable onPress={() => setShowAddModal(false)} style={styles.cancelBtn}>
              <Text style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => addMutation.mutate()}
              disabled={addMutation.isPending || !title.trim() || !url.trim()}
              style={[
                styles.submitBtn,
                { backgroundColor: colors.primary, opacity: title.trim() && url.trim() ? 1 : 0.6 },
              ]}
            >
              {addMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Add to Vault</Text>
              )}
            </Pressable>
          </Row>
        </Card>
      )}

      {resources.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Image
            source={nextGenEmptyStates.noMaterials}
            style={{ width: 90, height: 90 }}
            resizeMode="contain"
          />
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No study materials shared yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Upload past exam papers, lecture notes, or reference links for members.
          </Text>
        </Card>
      ) : (
        resources.map((item) => (
          <Card key={item.id} style={styles.resourceCard}>
            <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
              <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                <View style={[styles.iconCircle, { backgroundColor: colors.surface }]}>
                  <MaterialCommunityIcons name={getKindIcon("file")} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resourceTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.resourceUrl, { color: colors.muted }]}>
                    {item.url}
                  </Text>
                </View>
              </Row>

              <Pressable
                onPress={() => Linking.openURL(item.url).catch(() => Alert.alert("Cannot open link", item.url))}
                style={[styles.downloadBtn, { borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="download" size={16} color={colors.primary} />
                <Text style={[styles.downloadText, { color: colors.primary }]}>Access</Text>
              </Pressable>
            </Row>
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  headerRow: { alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 18, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md },
  addBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  addCard: { padding: 14, marginBottom: 14, borderRadius: radius.lg },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  kindLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  kindPill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  actionRow: { justifyContent: "flex-end", gap: 10 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md },
  submitBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  emptyCard: { padding: 28, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 15, fontWeight: "600", marginTop: 8 },
  emptySubtext: { fontSize: 13, marginTop: 4, textAlign: "center" },
  resourceCard: { padding: 12, marginBottom: 10, borderRadius: radius.md },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  resourceTitle: { fontSize: 14, fontWeight: "700" },
  resourceUrl: { fontSize: 12, marginTop: 2 },
  downloadBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md },
  downloadText: { fontSize: 12, fontWeight: "700" },
});
