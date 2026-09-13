import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Card, H1, H2, Muted, Screen, Button, Row, Pill } from "@/components/ui";
import { useTheme, radius } from "@/theme";

interface YouTubeStatusResponse {
  configured: boolean;
  connected: boolean;
  connection?: {
    id: string;
    channel_id: string;
    channel_title: string;
    channel_custom_url?: string | null;
    channel_thumbnail_url?: string | null;
    status: string;
    created_at: string;
    last_synced_at?: string | null;
  } | null;
}

export default function IntegrationsSettingsScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<YouTubeStatusResponse>({
    queryKey: ["youtube-integration-status"],
    queryFn: () => api("/integrations/youtube/status"),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api("/integrations/youtube/disconnect", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["youtube-integration-status"] });
      Alert.alert("Disconnected", "Your YouTube channel integration has been disconnected.");
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message || "Failed to disconnect channel.");
    },
  });

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const res = await api<{ authUrl?: string; error?: string }>("/integrations/youtube/connect");
      if (res.authUrl) {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.location.href = res.authUrl;
        } else {
          await Linking.openURL(res.authUrl);
        }
      } else {
        Alert.alert(
          "Integration Unavailable",
          res.error || "YouTube OAuth integration is currently not enabled on this server."
        );
      }
    } catch (err: unknown) {
      Alert.alert(
        "Connection Error",
        err instanceof Error ? err.message : "Failed to initiate YouTube connection"
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect YouTube Channel",
      "Are you sure you want to disconnect your YouTube channel? Existing archived recordings will remain in your study rooms.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => disconnectMutation.mutate(),
        },
      ]
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <H1>External Integrations</H1>
        <Muted>Connect third-party platforms to automate recording workflows and sync resources.</Muted>
      </View>

      {isLoading ? (
        <Card style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Checking connection status…</Text>
        </Card>
      ) : isError ? (
        <Card style={styles.errorCard}>
          <Text style={{ color: colors.danger, fontWeight: "600" }}>Unable to load integration status.</Text>
          <View style={{ marginTop: 8 }}>
            <Button title="Retry" onPress={() => void refetch()} />
          </View>
        </Card>
      ) : (
        <>
          {/* YouTube Channel Card */}
          <Card style={styles.serviceCard}>
            <View style={styles.serviceHeader}>
              <View style={[styles.iconBadge, { backgroundColor: "#fee2e2" }]}>
                <MaterialCommunityIcons name="youtube" size={32} color="#dc2626" />
              </View>
              <View style={styles.serviceMeta}>
                <Row style={{ alignItems: "center", gap: 8 }}>
                  <H2 style={{ margin: 0 }}>YouTube Channel</H2>
                  <Pill tone={data?.connected ? "primary" : "default"}>
                    {data?.connected ? "Connected" : "Not Linked"}
                  </Pill>
                </Row>
                <Muted style={{ fontSize: 13, marginTop: 2 }}>
                  Sync classroom recordings, video archives, and public/unlisted lectures.
                </Muted>
              </View>
            </View>

            {data?.connected && data.connection ? (
              <View style={[styles.connectionDetails, { borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 12 }}>
                  {data.connection.channel_thumbnail_url ? (
                    <Image
                      source={{ uri: data.connection.channel_thumbnail_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: colors.surface }]}>
                      <MaterialCommunityIcons name="television-play" size={24} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.channelTitle, { color: colors.text }]}>
                      {data.connection.channel_title}
                    </Text>
                    {data.connection.channel_custom_url ? (
                      <Text style={[styles.customUrl, { color: colors.muted }]}>
                        {data.connection.channel_custom_url}
                      </Text>
                    ) : null}
                    <Text style={[styles.channelId, { color: colors.muted }]}>
                      ID: {data.connection.channel_id}
                    </Text>
                  </View>
                </Row>

                <View style={[styles.metaRow, { borderColor: colors.border }]}>
                  <Text style={[styles.metaText, { color: colors.muted }]}>
                    Connected: {new Date(data.connection.created_at).toLocaleDateString()}
                  </Text>
                  {data.connection.last_synced_at ? (
                    <Text style={[styles.metaText, { color: colors.muted }]}>
                      Last Synced: {new Date(data.connection.last_synced_at).toLocaleDateString()}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.actionRow}>
                  <Button
                    title="Disconnect Channel"
                    variant="danger"
                    onPress={handleDisconnect}
                    loading={disconnectMutation.isPending}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.connectPrompt}>
                <View style={[styles.benefitBox, { backgroundColor: colors.surface }]}>
                  <Row style={{ gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                    <MaterialCommunityIcons name="check-circle" size={16} color="#16a34a" style={{ marginTop: 2 }} />
                    <Text style={[styles.benefitText, { color: colors.text }]}>
                      Auto-extract video titles, thumbnails, and durations for study room recordings.
                    </Text>
                  </Row>
                  <Row style={{ gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                    <MaterialCommunityIcons name="check-circle" size={16} color="#16a34a" style={{ marginTop: 2 }} />
                    <Text style={[styles.benefitText, { color: colors.text }]}>
                      Requires minimum read-only permissions (<Text style={{ fontFamily: "monospace" }}>youtube.readonly</Text>).
                    </Text>
                  </Row>
                  <Row style={{ gap: 8, alignItems: "flex-start" }}>
                    <MaterialCommunityIcons name="shield-lock-outline" size={16} color="#2563eb" style={{ marginTop: 2 }} />
                    <Text style={[styles.benefitText, { color: colors.text }]}>
                      Tokens are encrypted with AES-256-GCM. We never access your Google account password.
                    </Text>
                  </Row>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Button
                    title={connecting ? "Redirecting to Google…" : "Connect YouTube Channel"}
                    onPress={handleConnect}
                    loading={connecting}
                    disabled={connecting}
                  />
                </View>
              </View>
            )}
          </Card>

          {/* LiveKit Classroom Streaming Note */}
          <Card style={{ marginTop: 16 }}>
            <Row style={{ alignItems: "center", gap: 10 }}>
              <MaterialCommunityIcons name="broadcast" size={24} color="#6366f1" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: colors.text }}>LiveKit Audio & Video</Text>
                <Muted style={{ fontSize: 12 }}>
                  Live peer-to-peer room collaboration is active. Server-side egress recording is held in manual mode to prevent non-free cloud costs.
                </Muted>
              </View>
            </Row>
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  loadingCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorCard: {
    padding: 16,
  },
  serviceCard: {
    padding: 16,
  },
  serviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceMeta: {
    flex: 1,
  },
  connectionDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  channelTitle: {
    fontWeight: "700",
    fontSize: 16,
  },
  customUrl: {
    fontSize: 13,
  },
  channelId: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaText: {
    fontSize: 12,
  },
  actionRow: {
    marginTop: 14,
  },
  connectPrompt: {
    marginTop: 16,
  },
  benefitBox: {
    padding: 12,
    borderRadius: radius.md,
  },
  benefitText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
});
