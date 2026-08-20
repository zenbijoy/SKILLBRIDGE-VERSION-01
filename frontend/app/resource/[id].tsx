import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type ResourceDetail = {
  id: string;
  room_id?: string;
  title: string;
  kind: "file" | "link";
  url: string;
  created_at: string;
  created_by?: string;
  uploader?: {
    id: string;
    username: string;
    full_name: string;
  };
  room?: {
    id: string;
    title: string;
    topic: string;
  };
};

export default function ResourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [downloading, setDownloading] = useState(false);

  const resourceQuery = useQuery({
    queryKey: ["resource", id],
    queryFn: () => api<ResourceDetail>(`/resources/${id}`),
    enabled: Boolean(id),
  });

  const handleDownload = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      const res = await api<{ url: string }>(`/resources/${id}/download`);
      await Linking.openURL(res.url);
    } catch (err: any) {
      if (resourceQuery.data?.url) {
        await Linking.openURL(resourceQuery.data.url);
      } else {
        Alert.alert("Download Failed", err.message || "Could not generate download link.");
      }
    } finally {
      setDownloading(false);
    }
  };

  const d = resourceQuery.data;

  if (resourceQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={120} />
        <Skeleton height={100} />
      </Screen>
    );
  }

  if (resourceQuery.isError) {
    return (
      <Screen>
        <ErrorState
          detail={(resourceQuery.error as Error).message}
          onRetry={() => resourceQuery.refetch()}
        />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen>
        <Empty title="Resource Not Found" detail="This resource may have been deleted." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <Row style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <H1 style={styles.title}>{d.title}</H1>
          </View>
        </Row>

        {/* Badges */}
        <Row style={styles.badgeRow}>
          <Pill tone={d.kind === "file" ? "primary" : "accent"}>
            {d.kind === "file" ? "DOCUMENT / FILE" : "WEB LINK"}
          </Pill>
          <Pill tone="default">{new Date(d.created_at).toLocaleDateString()}</Pill>
        </Row>

        {/* Resource Main Card */}
        <Card style={styles.card}>
          <Row style={{ alignItems: "center", gap: 14 }}>
            <View style={[styles.iconBox, { backgroundColor: colors.primary + "18" }]}>
              <MaterialCommunityIcons
                name={d.kind === "file" ? "file-document-outline" : "link-variant"}
                size={32}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.resTitle, { color: colors.text }]}>{d.title}</Text>
              {d.uploader && (
                <Muted>Uploaded by @{d.uploader.username}</Muted>
              )}
            </View>
          </Row>

          <View style={{ marginTop: 16 }}>
            <Button
              title={
                downloading
                  ? "Accessing Resource..."
                  : d.kind === "file"
                  ? "Download Secure File ⬇️"
                  : "Open External Link ↗️"
              }
              onPress={handleDownload}
              disabled={downloading}
            />
          </View>
        </Card>

        {/* Room Context */}
        {d.room && (
          <Pressable onPress={() => router.push(`/room/${d.room!.id}` as any)}>
            <Card style={styles.card}>
              <H2 style={styles.sectionTitle}>Shared in Study Room</H2>
              <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ gap: 2 }}>
                  <Text style={[styles.roomName, { color: colors.text }]}>{d.room.title}</Text>
                  <Muted>Topic: {d.room.topic}</Muted>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
              </Row>
            </Card>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    alignItems: "flex-start",
    marginBottom: 8,
  },
  backButton: {
    marginRight: 12,
    marginTop: 4,
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  badgeRow: {
    gap: 8,
    marginBottom: 16,
  },
  card: {
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  resTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  roomName: {
    fontSize: 15,
    fontWeight: "700",
  },
});
