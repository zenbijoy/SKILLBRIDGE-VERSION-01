import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useLocalSearchParams, router } from "expo-router";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Platform,
  PermissionsAndroid,
  TextInput,
  Modal,
  Animated,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useRoomContext,
  useTracks,
  useParticipant,
  useParticipants,
} from "@livekit/react-native";
import { Track, ConnectionQuality, RoomEvent, Participant } from "livekit-client";
import {
  encodeLivePacket,
  decodeLivePacket,
  LiveReactionPacket,
  LiveHandRaisePacket,
  LiveChatPacket,
} from "./liveDataPacket";
import { api } from "@/lib/api";
import { darkColors as colors } from "@/theme";

interface LiveCreds {
  url: string;
  token: string;
  canPublish: boolean;
  isHost?: boolean;
  role?: string;
  sessionId?: string;
  roomName?: string;
  participantName?: string;
}

function getParticipantDisplayName(participant: any): string {
  if (participant?.name && participant.name.trim() !== "") {
    return participant.name;
  }
  try {
    const meta = JSON.parse(participant?.metadata || "{}");
    if (meta.fullName) return meta.fullName;
    if (meta.username) return `@${meta.username}`;
  } catch {}
  return participant?.identity || "Participant";
}

export default function LiveRoomScreen() {
  const { roomId, sessionId } = useLocalSearchParams<{ roomId: string; sessionId?: string }>();
  const [creds, setCreds] = useState<LiveCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningRoom, setJoiningRoom] = useState(false);

  const requestNativePermissions = useCallback(async () => {
    if (Platform.OS === "android") {
      try {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA,
        ]);
      } catch (e) {
        console.warn("Permission request error:", e);
      }
    }
  }, []);

  const fetchToken = useCallback(() => {
    const target = sessionId || roomId;
    if (!target) return;
    setLoading(true);
    setError(null);
    api<LiveCreds>(`/live/token/${target}`, { method: "POST" })
      .then((data) => {
        setCreds(data);
        setLoading(false);
      })
      .catch((e) => {
        const msg = e.message || "Failed to join live room.";
        // If membership is required in an open room, attempt auto-join once
        if (msg.includes("Join the learning room first") && roomId) {
          api(`/rooms/${roomId}/join`, { method: "POST" })
            .then(() => {
              // Re-fetch token after auto-join
              return api<LiveCreds>(`/live/token/${target}`, { method: "POST" });
            })
            .then((data) => {
              setCreds(data);
              setLoading(false);
            })
            .catch((retryErr) => {
              setError(retryErr.message || msg);
              setLoading(false);
            });
          return;
        }

        setError(msg);
        setLoading(false);
      });
  }, [roomId, sessionId]);

  const joinAndRetry = useCallback(async () => {
    const targetRoom = roomId || (sessionId ? creds?.sessionId : null);
    if (!targetRoom) {
      fetchToken();
      return;
    }
    setJoiningRoom(true);
    try {
      await api(`/rooms/${targetRoom}/join`, { method: "POST" });
      setJoiningRoom(false);
      fetchToken();
    } catch (joinErr: any) {
      setJoiningRoom(false);
      const msg = joinErr?.message || "";
      if (
        msg.toLowerCase().includes("approval") ||
        msg.toLowerCase().includes("knock") ||
        msg.toLowerCase().includes("private") ||
        msg.toLowerCase().includes("invit")
      ) {
        Alert.alert(
          "Host Approval Required",
          "This room requires approval from the host before entering. Please request entry in the room lobby.",
          [
            {
              text: "Go to Lobby",
              onPress: () => router.replace(`/room/${targetRoom}` as any),
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
      } else {
        setError(msg || "Could not join room.");
      }
    }
  }, [roomId, sessionId, creds?.sessionId, fetchToken]);

  useEffect(() => {
    void requestNativePermissions();
    AudioSession.startAudioSession();
    fetchToken();

    return () => {
      AudioSession.stopAudioSession();
    };
  }, [fetchToken, requestNativePermissions]);

  if (loading) {
    return (
      <View style={s.centerScreen}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={s.connectingTitle}>Joining Room…</Text>
        <Text style={s.connectingSub}>Connecting to real-time audio and video</Text>
      </View>
    );
  }

  if (error || !creds) {
    const isMembershipError =
      error?.toLowerCase().includes("join") ||
      error?.toLowerCase().includes("learning room") ||
      error?.toLowerCase().includes("membership");

    return (
      <View style={s.centerScreen}>
        <View style={s.errorBox}>
          <Text style={{ fontSize: 32, marginBottom: 8, textAlign: "center" }}>⚠️</Text>
          <Text style={s.errorTitle}>Notice</Text>
          <Text style={s.errorSub}>{error || "Could not retrieve live room credentials."}</Text>
          <View style={s.errorBtnRow}>
            <Pressable onPress={() => router.back()} style={s.btnSecondary}>
              <Text style={s.btnSecondaryText}>Go Back</Text>
            </Pressable>
            {isMembershipError && roomId ? (
              <Pressable
                onPress={joinAndRetry}
                disabled={joiningRoom}
                style={[s.btnPrimary, { backgroundColor: "#10B981" }]}
              >
                {joiningRoom ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.btnPrimaryText}>Join Room & Enter</Text>
                )}
              </Pressable>
            ) : (
              <Pressable onPress={fetchToken} style={s.btnPrimary}>
                <Text style={s.btnPrimaryText}>Retry</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LiveKitRoom
        serverUrl={creds.url}
        token={creds.token}
        connect={true}
        audio={true}
        video={true}
        options={{ adaptiveStream: true, dynacast: true }}
      >
        <NativeMeetingView
          creds={creds}
          roomId={roomId || creds.sessionId || ""}
        />
      </LiveKitRoom>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Native Meeting View
// ---------------------------------------------------------------------------
function NativeMeetingView({
  creds,
  roomId,
}: {
  creds: LiveCreds;
  roomId: string;
}) {
  const insets = useSafeAreaInsets();
  const room = useRoomContext();
  const participants = useParticipants();

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const [copiedToast, setCopiedToast] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showHostModal, setShowHostModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showReactionsBar, setShowReactionsBar] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
  const [page, setPage] = useState(0);

  // WhatsApp-style LiveKit Realtime States
  const [reactions, setReactions] = useState<
    { id: string; emoji: string; senderName: string; anim: Animated.Value; xPercent: number }[]
  >([]);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<
    { id: string; senderName: string; text: string; timestamp: number; isMe: boolean }[]
  >([]);

  // Floating Reaction Animator
  const triggerReaction = useCallback((emoji: string, senderName: string) => {
    const anim = new Animated.Value(0);
    const id = `${Date.now()}-${Math.random()}`;
    const xPercent = 15 + Math.random() * 65;
    const item = { id, emoji, senderName, anim, xPercent };

    setReactions((prev) => [...prev.slice(-12), item]);

    Animated.timing(anim, {
      toValue: 1,
      duration: 2200,
      useNativeDriver: true,
    }).start(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    });
  }, []);

  // Listen to LiveKit Data Channel Events (Reactions, Hand Raises, Chat)
  useEffect(() => {
    if (!room) return;

    const onDataReceived = (payload: Uint8Array, participant?: Participant) => {
      const packet = decodeLivePacket(payload);
      if (!packet) return;

      if (packet.type === "reaction") {
        triggerReaction(packet.emoji, packet.senderName || participant?.name || "Participant");
      } else if (packet.type === "hand_raise") {
        const id = packet.senderId || participant?.identity;
        if (id) {
          setRaisedHands((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }
      } else if (packet.type === "chat") {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `${packet.timestamp}-${Math.random()}`,
            senderName: packet.senderName,
            text: packet.text,
            timestamp: packet.timestamp,
            isMe: packet.senderId === room.localParticipant?.identity,
          },
        ]);
      }
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room, triggerReaction]);

  // Publish Reaction via LiveKit Data Channel
  const sendReaction = (emoji: string) => {
    if (!room?.localParticipant) return;
    const senderName = getParticipantDisplayName(room.localParticipant);
    const packet: LiveReactionPacket = {
      version: 1,
      type: "reaction",
      emoji,
      senderId: room.localParticipant.identity,
      senderName,
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}
    triggerReaction(emoji, "You");
  };

  // Toggle Hand Raise via LiveKit Data Channel
  const toggleHandRaise = () => {
    if (!room?.localParticipant) return;
    const myId = room.localParticipant.identity;
    const isCurrentlyRaised = raisedHands.has(myId);
    const nextState = !isCurrentlyRaised;
    setRaisedHands((prev) => {
      const next = new Set(prev);
      if (nextState) next.add(myId);
      else next.delete(myId);
      return next;
    });

    const packet: LiveHandRaisePacket = {
      version: 1,
      type: "hand_raise",
      senderId: myId,
      senderName: getParticipantDisplayName(room.localParticipant),
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}
  };

  // Send In-Call Message via LiveKit Data Channel
  const sendChatMessage = () => {
    if (!room?.localParticipant || !chatInput.trim()) return;
    const text = chatInput.trim();
    const senderName = getParticipantDisplayName(room.localParticipant);
    const packet: LiveChatPacket = {
      version: 1,
      type: "chat",
      text,
      senderId: room.localParticipant.identity,
      senderName,
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${packet.timestamp}-${Math.random()}`,
        senderName: "You",
        text,
        timestamp: packet.timestamp,
        isMe: true,
      },
    ]);
    setChatInput("");
  };

  // Screen share priority detection
  const screenShareTrack = useMemo(() => {
    return allTracks.find((t) => t.source === Track.Source.ScreenShare);
  }, [allTracks]);

  // Camera tracks sorted by active speaker
  const cameraTracks = useMemo(() => {
    const list = allTracks.filter((t) => t.source === Track.Source.Camera);
    return [...list].sort((a, b) => {
      const aSpeaking = a.participant?.isSpeaking ? 1 : 0;
      const bSpeaking = b.participant?.isSpeaking ? 1 : 0;
      return bSpeaking - aSpeaking;
    });
  }, [allTracks]);

  // 8 per page for mobile grid view
  const TILES_PER_PAGE = screenShareTrack ? 6 : 8;
  const totalPages = Math.max(1, Math.ceil(cameraTracks.length / TILES_PER_PAGE));
  const currentPageTracks = cameraTracks.slice(page * TILES_PER_PAGE, (page + 1) * TILES_PER_PAGE);

  // Invite Link
  const handleCopyInviteLink = async () => {
    const inviteUrl = `https://skillbridge.app/live/${roomId}`;
    await Clipboard.setStringAsync(inviteUrl);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  const handleLeave = async () => {
    try {
      if (room) await room.disconnect();
    } catch {}
    router.back();
  };

  return (
    <View style={[s.viewContainer, { paddingTop: Math.max(insets.top, 10) }]}>
      {/* Sleek Top Header */}
      <View style={s.topHeader}>
        <View style={s.headerLeft}>
          <Pressable onPress={handleLeave} style={s.backBtn}>
            <Text style={s.backBtnText}>←</Text>
          </Pressable>
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveBadgeText}>LIVE</Text>
          </View>
          <View style={s.countPill}>
            <Text style={s.countPillText}>👥 {participants.length}</Text>
          </View>
        </View>

        <View style={s.headerRight}>
          <Pressable onPress={handleCopyInviteLink} style={s.inviteBtn}>
            <Text style={s.inviteBtnText}>🔗 Invite</Text>
          </Pressable>
          {copiedToast && (
            <View style={s.toastPill}>
              <Text style={s.toastPillText}>Link copied!</Text>
            </View>
          )}

          <Pressable onPress={() => setShowRoster(true)} style={s.rosterBtn}>
            <Text style={s.rosterBtnText}>👥 {participants.length}</Text>
          </Pressable>
        </View>
      </View>

      {/* Main Video Viewport */}
      <View style={s.stage}>
        {screenShareTrack ? (
          // ── Zoom-Style Screen Share Stage ─────────────────────────────
          <View style={s.screenShareContainer}>
            <View style={s.screenShareMain}>
              <VideoTrack trackRef={screenShareTrack as any} style={StyleSheet.absoluteFill} />
              <View style={s.screenShareTag}>
                <Text style={s.screenShareTagText}>
                  🖥️ {getParticipantDisplayName(screenShareTrack.participant)}'s Screen
                </Text>
              </View>
            </View>

            {/* Strip of participants */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.screenStripScroll}
              contentContainerStyle={s.screenStripContent}
            >
              {currentPageTracks.map((tr, i) => (
                <View
                  key={`${tr.participant?.identity || i}-${tr.source}-${i}`}
                  style={s.stripTile}
                >
                  <NativeParticipantTile
                    trackRef={tr}
                    isHandRaised={raisedHands.has(tr.participant?.identity || "")}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          // ── Adaptive Grid (1 up to 30+ participants) ───────────────────
          <View style={s.gridContainer}>
            <View style={s.gridRowWrap}>
              {currentPageTracks.map((tr, i) => (
                <View
                  key={`${tr.participant?.identity || i}-${tr.source}-${i}`}
                  style={[
                    s.gridCell,
                    currentPageTracks.length <= 1
                      ? s.gridCellFull
                      : currentPageTracks.length <= 2
                      ? s.gridCellHalf
                      : s.gridCellQuarter,
                  ]}
                >
                  <NativeParticipantTile
                    trackRef={tr}
                    isHandRaised={raisedHands.has(tr.participant?.identity || "")}
                  />
                </View>
              ))}
            </View>

            {/* Pagination Controls for 30+ participants */}
            {totalPages > 1 && (
              <View style={s.paginationBar}>
                <Pressable
                  disabled={page === 0}
                  onPress={() => setPage((p) => Math.max(0, p - 1))}
                  style={s.pageNavBtn}
                >
                  <Text style={s.pageNavBtnText}>◀</Text>
                </Pressable>
                <Text style={s.pageIndicatorText}>
                  Page {page + 1} of {totalPages} ({participants.length} peers)
                </Text>
                <Pressable
                  disabled={page >= totalPages - 1}
                  onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  style={s.pageNavBtn}
                >
                  <Text style={s.pageNavBtnText}>▶</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Floating WhatsApp Realtime Emojis Layer */}
        {reactions.map((r) => {
          const translateY = r.anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -320],
          });
          const opacity = r.anim.interpolate({
            inputRange: [0, 0.15, 0.8, 1],
            outputRange: [0, 1, 1, 0],
          });
          const scale = r.anim.interpolate({
            inputRange: [0, 0.2, 0.85, 1],
            outputRange: [0.5, 1.25, 1.1, 0.8],
          });

          return (
            <Animated.View
              key={r.id}
              pointerEvents="none"
              style={[
                s.floatingReaction,
                {
                  left: `${r.xPercent}%`,
                  opacity,
                  transform: [{ translateY }, { scale }],
                },
              ]}
            >
              <Text style={s.floatingEmoji}>{r.emoji}</Text>
              <Text style={s.floatingSender} numberOfLines={1}>
                {r.senderName}
              </Text>
            </Animated.View>
          );
        })}
      </View>

      {/* WhatsApp Style Floating Bottom Toolbar */}
      <NativeControls
        isHost={Boolean(creds.isHost)}
        isHandRaised={Boolean(
          room?.localParticipant && raisedHands.has(room.localParticipant.identity),
        )}
        onToggleHand={toggleHandRaise}
        showReactionsBar={showReactionsBar}
        onToggleReactionsBar={() => setShowReactionsBar((prev) => !prev)}
        onSendReaction={sendReaction}
        onOpenChat={() => setShowChat(true)}
        unreadChatCount={chatMessages.length}
        onOpenRoster={() => setShowRoster(true)}
        onOpenHostMenu={() => setShowHostModal(true)}
        onLeave={handleLeave}
      />

      {/* WhatsApp-Style In-Call Realtime Chat Sheet */}
      <Modal
        visible={showChat}
        animationType="slide"
        transparent
        onRequestClose={() => setShowChat(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.modalBackdrop}
        >
          <View
            style={[
              s.modalSheet,
              { maxHeight: "78%", paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>In-Call Messages</Text>
              <Pressable onPress={() => setShowChat(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>
            <Text style={s.chatInfoSub}>
              Messages are delivered live to everyone in this call.
            </Text>

            <ScrollView style={s.chatList} contentContainerStyle={{ paddingVertical: 12 }}>
              {chatMessages.length === 0 ? (
                <View style={s.emptyChatBox}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>💬</Text>
                  <Text style={s.emptyChatTitle}>No messages yet</Text>
                  <Text style={s.emptyChatSub}>
                    Send a note or question to everyone in the room
                  </Text>
                </View>
              ) : (
                chatMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[s.chatBubble, msg.isMe ? s.chatBubbleMe : s.chatBubbleOther]}
                  >
                    <Text style={s.chatSender}>{msg.senderName}</Text>
                    <Text style={s.chatText}>{msg.text}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={s.chatInputRow}>
              <TextInput
                placeholder="Message in call…"
                placeholderTextColor="#64748B"
                value={chatInput}
                onChangeText={setChatInput}
                style={s.chatInput}
                onSubmitEditing={sendChatMessage}
                returnKeyType="send"
              />
              <Pressable onPress={sendChatMessage} style={s.chatSendBtn}>
                <Text style={s.chatSendBtnText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Participants Roster Modal */}
      <Modal visible={showRoster} animationType="slide" transparent onRequestClose={() => setShowRoster(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Participants ({participants.length})</Text>
              <Pressable onPress={() => setShowRoster(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            {creds.isHost && (
              <Pressable
                onPress={async () => {
                  try {
                    await api(`/live/rooms/${creds.sessionId}/mute-all`, { method: "POST" });
                    Alert.alert("Host Action", "All participants muted.");
                  } catch (e: any) {
                    Alert.alert("Error", e.message);
                  }
                }}
                style={s.muteAllBanner}
              >
                <Text style={s.muteAllBannerText}>🔇 Mute All Participants</Text>
              </Pressable>
            )}

            <TextInput
              placeholder="Search peers…"
              placeholderTextColor="#64748B"
              value={rosterSearch}
              onChangeText={setRosterSearch}
              style={s.searchBar}
            />

            <ScrollView style={{ flex: 1 }}>
              {participants
                .filter((p) =>
                  rosterSearch
                    ? getParticipantDisplayName(p).toLowerCase().includes(rosterSearch.toLowerCase())
                    : true,
                )
                .map((p) => {
                  const isLocal = p.identity === room?.localParticipant?.identity;
                  const name = getParticipantDisplayName(p);
                  const isMicMuted = p.isMicrophoneEnabled === false;

                  return (
                    <View key={p.identity} style={s.peerRow}>
                      <View style={s.peerAvatar}>
                        <Text style={s.peerAvatarText}>{(name[0] || "?").toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.peerName} numberOfLines={1}>
                          {name} {isLocal && "(You)"}
                        </Text>
                        <Text style={s.peerStatus}>
                          {p.isSpeaking ? "🗣️ Speaking" : isMicMuted ? "Muted" : "Active"}
                        </Text>
                      </View>

                      <Text style={{ marginRight: 6 }}>{isMicMuted ? "🔇" : "🎤"}</Text>

                      {creds.isHost && !isLocal && (
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <Pressable
                            onPress={async () => {
                              try {
                                await api(`/live/rooms/${creds.sessionId}/mute-participant`, {
                                  method: "POST",
                                  body: JSON.stringify({ participantIdentity: p.identity, mute: true }),
                                });
                              } catch {}
                            }}
                            style={s.tinyActionBtn}
                          >
                            <Text style={s.tinyActionText}>Mute</Text>
                          </Pressable>
                          <Pressable
                            onPress={async () => {
                              Alert.alert("Remove Participant", `Remove ${name}?`, [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Remove",
                                  style: "destructive",
                                  onPress: async () => {
                                    try {
                                      await api(`/live/rooms/${creds.sessionId}/remove-participant`, {
                                        method: "POST",
                                        body: JSON.stringify({ participantIdentity: p.identity }),
                                      });
                                    } catch {}
                                  },
                                },
                              ]);
                            }}
                            style={s.tinyDangerBtn}
                          >
                            <Text style={s.tinyDangerText}>Remove</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Host Controls Modal */}
      <Modal visible={showHostModal} animationType="fade" transparent onRequestClose={() => setShowHostModal(false)}>
        <View style={s.modalBackdropCenter}>
          <View style={s.hostModalCard}>
            <Text style={s.hostModalTitle}>🛡️ Host Management</Text>
            <Pressable
              onPress={async () => {
                setShowHostModal(false);
                try {
                  await api(`/live/rooms/${creds.sessionId}/mute-all`, { method: "POST" });
                  Alert.alert("Host Action", "All participants muted.");
                } catch (e: any) {
                  Alert.alert("Error", e.message);
                }
              }}
              style={s.hostMenuBtn}
            >
              <Text style={s.hostMenuBtnText}>🔇 Mute All Participants</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowHostModal(false);
                handleCopyInviteLink();
              }}
              style={s.hostMenuBtn}
            >
              <Text style={s.hostMenuBtnText}>🔗 Copy Invite Link</Text>
            </Pressable>

            <View style={s.modalDivider} />

            <Pressable
              onPress={() => {
                setShowHostModal(false);
                Alert.alert("End Meeting", "Are you sure you want to end this session for everyone?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "End Meeting For All",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await api(`/live/rooms/${creds.sessionId}/end`, { method: "POST" });
                        if (room) await room.disconnect();
                        router.back();
                      } catch {}
                    },
                  },
                ]);
              }}
              style={[s.hostMenuBtn, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}
            >
              <Text style={[s.hostMenuBtnText, { color: "#EF4444" }]}>⏹️ End Meeting For All</Text>
            </Pressable>

            <Pressable onPress={() => setShowHostModal(false)} style={s.cancelModalBtn}>
              <Text style={s.cancelModalBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Native Participant Tile
// ---------------------------------------------------------------------------
function NativeParticipantTile({
  trackRef,
  isHandRaised,
}: {
  trackRef: any;
  isHandRaised?: boolean;
}) {
  const p = trackRef?.participant;
  const isVideoPublished =
    trackRef?.publication &&
    !trackRef.publication.isMuted &&
    trackRef.source === Track.Source.Camera;
  const isSpeaking = p?.isSpeaking;
  const isMicMuted = p?.isMicrophoneEnabled === false;
  const name = getParticipantDisplayName(p);

  return (
    <View
      style={[
        s.tileContainer,
        isSpeaking && { borderColor: "#10B981", borderWidth: 2 },
      ]}
    >
      {isVideoPublished ? (
        <VideoTrack trackRef={trackRef} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={s.avatarBox}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarLetter}>{(name[0] || "?").toUpperCase()}</Text>
          </View>
          <Text style={s.avatarName} numberOfLines={1}>
            {name}
          </Text>
        </View>
      )}

      {/* WhatsApp Hand Raise Floating Badge */}
      {isHandRaised && (
        <View style={s.handRaisedBadge}>
          <Text style={{ fontSize: 18 }}>✋</Text>
        </View>
      )}

      {/* Discreet bottom badge */}
      <View style={s.tileBadge}>
        <Text style={s.tileBadgeName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ fontSize: 10 }}>{isMicMuted ? "🔇" : isSpeaking ? "🗣️" : "🎤"}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Native Controls Toolbar
// ---------------------------------------------------------------------------
function NativeControls({
  isHost,
  isHandRaised,
  onToggleHand,
  showReactionsBar,
  onToggleReactionsBar,
  onSendReaction,
  onOpenChat,
  unreadChatCount,
  onOpenRoster,
  onOpenHostMenu,
  onLeave,
}: {
  isHost: boolean;
  isHandRaised: boolean;
  onToggleHand: () => void;
  showReactionsBar: boolean;
  onToggleReactionsBar: () => void;
  onSendReaction: (emoji: string) => void;
  onOpenChat: () => void;
  unreadChatCount: number;
  onOpenRoster: () => void;
  onOpenHostMenu: () => void;
  onLeave: () => void;
}) {
  const insets = useSafeAreaInsets();
  const room = useRoomContext();
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);

  const toggleMic = async () => {
    try {
      const next = !mic;
      await room?.localParticipant?.setMicrophoneEnabled(next);
      setMic(next);
    } catch {}
  };

  const toggleCam = async () => {
    try {
      const next = !cam;
      await room?.localParticipant?.setCameraEnabled(next);
      setCam(next);
    } catch {}
  };

  const flipCam = async () => {
    try {
      const camTrack = room?.localParticipant?.getTrackPublication(Track.Source.Camera)?.videoTrack;
      if (camTrack && typeof (camTrack as any).switchCamera === "function") {
        await (camTrack as any).switchCamera();
      }
    } catch {}
  };

  const toggleShare = async () => {
    try {
      const next = !sharing;
      await room?.localParticipant?.setScreenShareEnabled(next);
      setSharing(next);
    } catch (e: any) {
      Alert.alert("Screen Share", e.message || "Could not toggle screen share.");
    }
  };

  return (
    <View style={[s.controlsWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {/* WhatsApp Floating Reactions Picker Bar */}
      {showReactionsBar && (
        <View style={s.reactionsBarPill}>
          {["👍", "❤️", "😂", "😮", "👏", "🔥", "🎉", "💡"].map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                onSendReaction(emoji);
                onToggleReactionsBar();
              }}
              style={s.reactionEmojiBtn}
            >
              <Text style={s.reactionEmojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.controlsPill}
      >
        <Pressable onPress={toggleMic} style={mic ? s.ctrlBtn : s.ctrlBtnMuted}>
          <Text style={s.ctrlIcon}>{mic ? "🎤" : "🔇"}</Text>
          <Text style={mic ? s.ctrlLabel : s.ctrlLabelMuted}>{mic ? "Mute" : "Unmute"}</Text>
        </Pressable>

        <Pressable onPress={toggleCam} style={cam ? s.ctrlBtn : s.ctrlBtnMuted}>
          <Text style={s.ctrlIcon}>{cam ? "📹" : "📷"}</Text>
          <Text style={cam ? s.ctrlLabel : s.ctrlLabelMuted}>{cam ? "Stop" : "Start"}</Text>
        </Pressable>

        {cam && (
          <Pressable onPress={flipCam} style={s.ctrlBtn}>
            <Text style={s.ctrlIcon}>🔄</Text>
            <Text style={s.ctrlLabel}>Flip</Text>
          </Pressable>
        )}

        {/* WhatsApp Raise Hand */}
        <Pressable onPress={onToggleHand} style={isHandRaised ? s.ctrlBtnRaised : s.ctrlBtn}>
          <Text style={s.ctrlIcon}>✋</Text>
          <Text style={isHandRaised ? s.ctrlLabelRaised : s.ctrlLabel}>
            {isHandRaised ? "Lower" : "Raise"}
          </Text>
        </Pressable>

        {/* WhatsApp Reactions */}
        <Pressable onPress={onToggleReactionsBar} style={showReactionsBar ? s.ctrlBtnActive : s.ctrlBtn}>
          <Text style={s.ctrlIcon}>😊</Text>
          <Text style={showReactionsBar ? s.ctrlLabelActive : s.ctrlLabel}>React</Text>
        </Pressable>

        {/* In-Call Live Chat */}
        <Pressable onPress={onOpenChat} style={s.ctrlBtn}>
          <View>
            <Text style={s.ctrlIcon}>💬</Text>
            {unreadChatCount > 0 && (
              <View style={s.chatCountBadge}>
                <Text style={s.chatCountBadgeText}>
                  {unreadChatCount > 9 ? "9+" : unreadChatCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={s.ctrlLabel}>Chat</Text>
        </Pressable>

        <Pressable onPress={toggleShare} style={sharing ? s.ctrlBtnActive : s.ctrlBtn}>
          <Text style={s.ctrlIcon}>🖥️</Text>
          <Text style={sharing ? s.ctrlLabelActive : s.ctrlLabel}>{sharing ? "Stop" : "Share"}</Text>
        </Pressable>

        <Pressable onPress={onOpenRoster} style={s.ctrlBtn}>
          <Text style={s.ctrlIcon}>👥</Text>
          <Text style={s.ctrlLabel}>Peers</Text>
        </Pressable>

        {isHost && (
          <Pressable onPress={onOpenHostMenu} style={s.ctrlBtn}>
            <Text style={s.ctrlIcon}>🛡️</Text>
            <Text style={s.ctrlLabel}>Host</Text>
          </Pressable>
        )}

        <Pressable onPress={onLeave} style={s.leaveBtn}>
          <Text style={s.leaveBtnText}>Leave</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080C16" },
  centerScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#080C16",
    padding: 24,
  },
  connectingTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 14,
  },
  connectingSub: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  errorSub: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  errorBtnRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: "#0284C7",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  btnSecondaryText: {
    color: "#E2E8F0",
    fontWeight: "600",
    fontSize: 13,
  },
  viewContainer: {
    flex: 1,
    backgroundColor: "#080C16",
  },
  topHeader: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    padding: 6,
  },
  backBtnText: {
    color: "#94A3B8",
    fontSize: 18,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  liveBadgeText: {
    color: "#EF4444",
    fontSize: 10,
    fontWeight: "700",
  },
  countPill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  countPillText: {
    color: "#94A3B8",
    fontSize: 11,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  inviteBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  inviteBtnText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "600",
  },
  toastPill: {
    position: "absolute",
    top: 36,
    right: 0,
    backgroundColor: "#0284C7",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    zIndex: 100,
  },
  toastPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  rosterBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  rosterBtnText: {
    color: "#E2E8F0",
    fontSize: 11,
  },
  stage: {
    flex: 1,
    padding: 6,
  },
  screenShareContainer: {
    flex: 1,
  },
  screenShareMain: {
    flex: 1,
    backgroundColor: "#000000",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  screenShareTag: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  screenShareTagText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "600",
  },
  screenStripScroll: {
    height: 100,
    marginTop: 6,
  },
  screenStripContent: {
    gap: 6,
  },
  stripTile: {
    width: 120,
    height: "100%",
  },
  gridContainer: {
    flex: 1,
  },
  gridRowWrap: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  gridCell: {
    borderRadius: 10,
    overflow: "hidden",
  },
  gridCellFull: {
    width: "100%",
    height: "100%",
  },
  gridCellHalf: {
    width: "100%",
    height: "48%",
  },
  gridCellQuarter: {
    width: "48%",
    height: "31%",
  },
  tileContainer: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  avatarBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111827",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
    marginBottom: 6,
  },
  avatarLetter: {
    color: "#38BDF8",
    fontSize: 18,
    fontWeight: "700",
  },
  avatarName: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "500",
  },
  tileBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileBadgeName: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
    maxWidth: 90,
  },
  paginationBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 4,
  },
  pageNavBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  pageNavBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
  },
  pageIndicatorText: {
    color: "#94A3B8",
    fontSize: 11,
  },
  controlsWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  controlsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctrlBtn: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  ctrlBtnMuted: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
  },
  ctrlBtnActive: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(56, 189, 248, 0.2)",
  },
  ctrlIcon: {
    fontSize: 14,
  },
  ctrlLabel: {
    color: "#E2E8F0",
    fontSize: 9,
    marginTop: 2,
  },
  ctrlLabelMuted: {
    color: "#EF4444",
    fontSize: 9,
    marginTop: 2,
  },
  ctrlLabelActive: {
    color: "#38BDF8",
    fontSize: 9,
    marginTop: 2,
  },
  leaveBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginLeft: 4,
  },
  leaveBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "75%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseBtnText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  muteAllBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  muteAllBannerText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "600",
  },
  searchBar: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 12,
    marginBottom: 12,
  },
  peerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  peerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  peerAvatarText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
  },
  peerName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  peerStatus: {
    color: "#94A3B8",
    fontSize: 10,
  },
  tinyActionBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tinyActionText: {
    color: "#E2E8F0",
    fontSize: 10,
  },
  tinyDangerBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tinyDangerText: {
    color: "#EF4444",
    fontSize: 10,
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  hostModalCard: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  hostModalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
    textAlign: "center",
  },
  hostMenuBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 8,
  },
  hostMenuBtnText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "500",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 6,
  },
  cancelModalBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 6,
  },
  cancelModalBtnText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  // WhatsApp-Style Additions
  floatingReaction: {
    position: "absolute",
    bottom: 30,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
  },
  floatingEmoji: {
    fontSize: 40,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  floatingSender: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  handRaisedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(234, 179, 8, 0.9)",
    borderRadius: 14,
    padding: 4,
    zIndex: 10,
    elevation: 4,
    shadowColor: "#EAB308",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  reactionsBarPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  reactionEmojiBtn: {
    padding: 6,
    borderRadius: 16,
  },
  reactionEmojiText: {
    fontSize: 24,
  },
  ctrlBtnRaised: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(234, 179, 8, 0.25)",
    borderWidth: 1,
    borderColor: "#EAB308",
  },
  ctrlLabelRaised: {
    color: "#EAB308",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
  },
  chatCountBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: "#10B981",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  chatCountBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  chatInfoSub: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 8,
  },
  chatList: {
    flex: 1,
    width: "100%",
  },
  emptyChatBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
  },
  emptyChatTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptyChatSub: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
  },
  chatBubble: {
    maxWidth: "82%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    marginBottom: 8,
  },
  chatBubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: "#0284C7",
    borderBottomRightRadius: 2,
  },
  chatBubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderBottomLeftRadius: 2,
  },
  chatSender: {
    color: "#93C5FD",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 2,
  },
  chatText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 13,
  },
  chatSendBtn: {
    backgroundColor: "#10B981",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  chatSendBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
