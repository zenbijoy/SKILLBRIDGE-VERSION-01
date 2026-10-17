import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useLocalSearchParams, router } from "expo-router";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
  useParticipants,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track, RoomEvent, Participant } from "livekit-client";
import "@livekit/components-styles";
import {
  encodeLivePacket,
  decodeLivePacket,
  LiveReactionPacket,
  LiveHandRaisePacket,
  LiveChatPacket,
} from "./liveDataPacket";
import { api } from "@/lib/api";

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

export default function LiveRoomScreenWeb() {
  const { roomId, sessionId } = useLocalSearchParams<{ roomId: string; sessionId?: string }>();
  const [creds, setCreds] = useState<LiveCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);

  // Request browser media permissions proactively
  const requestMediaPermissions = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((track) => track.stop());
        setPermGranted(true);
      } catch (err: any) {
        console.warn("Media permissions check:", err?.message || err);
        try {
          // Fallback check audio only
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStream.getTracks().forEach((track) => track.stop());
          setPermGranted(true);
        } catch {
          setPermGranted(false);
        }
      }
    }
  }, []);

  const fetchToken = useCallback(() => {
    const target = sessionId || roomId;
    if (!target) return;
    setLoading(true);
    setError(null);

    api<LiveCreds>(`/live/token/${target}`, { method: "POST" })
      .then((data: LiveCreds) => {
        setCreds(data);
        setLoading(false);
      })
      .catch((e: any) => {
        setError(e.message || "Failed to join live room");
        setLoading(false);
      });
  }, [roomId, sessionId]);

  useEffect(() => {
    void requestMediaPermissions();
    fetchToken();
  }, [fetchToken, requestMediaPermissions]);

  if (loading) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.spinner} />
        <h3 style={styles.title}>Joining Room…</h3>
        <p style={styles.subtitle}>Connecting to real-time audio and video</p>
      </div>
    );
  }

  if (error || !creds) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.card}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
          <h2 style={styles.cardHeading}>Connection Notice</h2>
          <p style={styles.cardSub}>
            {error || "Could not retrieve access token for this live session."}
          </p>
          <div style={styles.actionRow}>
            <button onClick={() => router.back()} style={styles.btnSecondary}>
              Go Back
            </button>
            <button onClick={fetchToken} style={styles.btnPrimary}>
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <LiveKitRoom
        video={true}
        audio={true}
        token={creds.token}
        serverUrl={creds.url}
        connect={true}
        data-lk-theme="default"
        options={{
          adaptiveStream: true,
          dynacast: true,
        }}
        style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}
        onDisconnected={() => {
          router.back();
        }}
      >
        <LiveMeetingView
          creds={creds}
          roomId={roomId || creds.sessionId || ""}
          permGranted={permGranted}
          onRequestPerms={requestMediaPermissions}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Meeting View (Clean layout, Zoom-style Stage + Controls)
// ---------------------------------------------------------------------------
function LiveMeetingView({
  creds,
  roomId,
  permGranted,
  onRequestPerms,
}: {
  creds: LiveCreds;
  roomId: string;
  permGranted: boolean | null;
  onRequestPerms: () => Promise<void>;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const participants = useParticipants();

  // All published camera and screenshare tracks
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const [copiedToast, setCopiedToast] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showHostMenu, setShowHostMenu] = useState(false);
  const [rosterSearch, setRosterSearch] = useState("");
  const [page, setPage] = useState(0);

  // Identify active screenshare track (if any participant is sharing screen)
  const screenShareTrack = useMemo(() => {
    return tracks.find((t) => t.source === Track.Source.ScreenShare);
  }, [tracks]);

  // Non-screenshare participant camera tracks
  const cameraTracks = useMemo(() => {
    const list = tracks.filter((t) => t.source === Track.Source.Camera);
    // Sort active speakers first so in 30+ participant rooms, speaking peers are front-and-center
    return [...list].sort((a, b) => {
      const aSpeaking = a.participant?.isSpeaking ? 1 : 0;
      const bSpeaking = b.participant?.isSpeaking ? 1 : 0;
      return bSpeaking - aSpeaking;
    });
  }, [tracks]);

  // Pagination for large rooms (30+ participants): 12 tiles per page
  const TILES_PER_PAGE = screenShareTrack ? 8 : 12;
  const totalPages = Math.max(1, Math.ceil(cameraTracks.length / TILES_PER_PAGE));
  const currentPageTracks = cameraTracks.slice(page * TILES_PER_PAGE, (page + 1) * TILES_PER_PAGE);

  // Invite Link generator & copy handler
  const handleCopyInviteLink = useCallback(() => {
    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/live/${roomId}`
        : `https://skillbridge.app/live/${roomId}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2500);
      });
    }
  }, [roomId]);

  // Media toggles
  const handleToggleMic = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err: any) {
      alert("Could not access microphone. Please check your browser audio permissions.");
    }
  };

  const handleToggleCam = async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (err: any) {
      alert("Could not access camera. Please check your browser video permissions.");
    }
  };

  // Screen Share Toggle (like Zoom: available to BOTH host and participants)
  const handleToggleScreenShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") {
        alert("Screen sharing cancelled or unavailable: " + (err?.message || ""));
      }
    }
  };

  // Host Control Actions
  const handleMuteAll = async () => {
    if (!creds.sessionId) return;
    try {
      await api(`/live/rooms/${creds.sessionId}/mute-all`, { method: "POST" });
      alert("All participant microphones have been muted.");
    } catch (err: any) {
      alert("Failed to mute all: " + err.message);
    }
  };

  const handleMuteParticipant = async (identity: string) => {
    if (!creds.sessionId) return;
    try {
      await api(`/live/rooms/${creds.sessionId}/mute-participant`, {
        method: "POST",
        body: JSON.stringify({ participantIdentity: identity, mute: true }),
      });
    } catch (err: any) {
      alert("Failed to mute participant: " + err.message);
    }
  };

  const handleRemoveParticipant = async (identity: string) => {
    if (!creds.sessionId) return;
    if (!confirm(`Are you sure you want to remove this participant from the room?`)) return;
    try {
      await api(`/live/rooms/${creds.sessionId}/remove-participant`, {
        method: "POST",
        body: JSON.stringify({ participantIdentity: identity }),
      });
    } catch (err: any) {
      alert("Failed to remove participant: " + err.message);
    }
  };

  const handleEndRoomForAll = async () => {
    if (!creds.sessionId) return;
    if (!confirm("Are you sure you want to end this room for all participants?")) return;
    try {
      await api(`/live/rooms/${creds.sessionId}/end`, { method: "POST" });
      room.disconnect();
      router.back();
    } catch (err: any) {
      alert("Failed to end room: " + err.message);
    }
  };

  const handleLeave = () => {
    room.disconnect();
    router.back();
  };

  // Filtered participants list for roster
  const filteredParticipants = useMemo(() => {
    const q = rosterSearch.toLowerCase().trim();
    if (!q) return participants;
    return participants.filter((p) => {
      const name = p.name || p.identity;
      return name.toLowerCase().includes(q);
    });
  }, [participants, rosterSearch]);

  return (
    <div style={styles.viewRoot}>
      {/* Permission Warning Banner if blocked */}
      {permGranted === false && (
        <div style={styles.permBanner}>
          <span>⚠️ Camera or microphone access was blocked by your browser.</span>
          <button onClick={onRequestPerms} style={styles.permBtn}>
            Allow Access
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <header style={styles.topHeader}>
        <div style={styles.headerLeft}>
          <button onClick={handleLeave} style={styles.backButton} title="Exit Call">
            ←
          </button>
          <div style={styles.roomBadge}>
            <span style={styles.liveDot} />
            <span style={styles.liveText}>LIVE</span>
          </div>
          <span style={styles.participantCountPill}>
            👥 {participants.length} {participants.length === 1 ? "participant" : "participants"}
          </span>
        </div>

        <div style={styles.headerRight}>
          {/* Invite with Link */}
          <button onClick={handleCopyInviteLink} style={styles.inviteBtn}>
            🔗 Invite Link
          </button>
          {copiedToast && <div style={styles.toast}>Link copied to clipboard!</div>}

          {/* Roster Toggle */}
          <button
            onClick={() => setShowRoster((prev) => !prev)}
            style={showRoster ? styles.activeHeaderBtn : styles.headerBtn}
            title="Participants"
          >
            👥 {participants.length}
          </button>
        </div>
      </header>

      {/* Main Video Viewport */}
      <main style={styles.stageArea}>
        {screenShareTrack ? (
          // ── Zoom-style Screen Share Stage ─────────────────────────────
          <div style={styles.screenShareStage}>
            <div style={styles.screenShareMain}>
              <VideoTrack trackRef={screenShareTrack as any} style={styles.screenVideo} />
              <div style={styles.screenShareLabel}>
                🖥️ {screenShareTrack.participant?.name || "Participant"}'s Screen
              </div>
            </div>

            {/* Strip of participants during screen share */}
            <div style={styles.screenStrip}>
              {currentPageTracks.map((tr) => (
                <div key={tr.publication?.trackSid || tr.participant?.identity} style={styles.stripTile}>
                  <ParticipantTile trackRef={tr} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          // ── Responsive Dynamic Grid (1 up to 30+ participants) ────────
          <div style={styles.gridContainer}>
            <div
              style={{
                ...styles.grid,
                gridTemplateColumns: getGridColumns(currentPageTracks.length),
              }}
            >
              {currentPageTracks.map((tr) => (
                <div key={tr.publication?.trackSid || tr.participant?.identity} style={styles.gridCell}>
                  <ParticipantTile trackRef={tr} />
                </div>
              ))}
            </div>

            {/* Pagination Controls for 30+ participants */}
            {totalPages > 1 && (
              <div style={styles.paginationBar}>
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  style={styles.pageBtn}
                >
                  ◀
                </button>
                <span style={styles.pageInfo}>
                  Page {page + 1} of {totalPages} ({participants.length} participants)
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  style={styles.pageBtn}
                >
                  ▶
                </button>
              </div>
            )}
          </div>
        )}

        {/* Side Participants Drawer */}
        {showRoster && (
          <aside style={styles.rosterDrawer}>
            <div style={styles.rosterHeader}>
              <h4 style={styles.rosterTitle}>Participants ({participants.length})</h4>
              <button onClick={() => setShowRoster(false)} style={styles.closeDrawerBtn}>
                ✕
              </button>
            </div>

            {creds.isHost && (
              <button onClick={handleMuteAll} style={styles.muteAllBtn}>
                🔇 Mute All Participants
              </button>
            )}

            <input
              type="text"
              placeholder="Search participants…"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              style={styles.rosterSearchInput}
            />

            <div style={styles.rosterList}>
              {filteredParticipants.map((p) => {
                const isLocal = p.identity === localParticipant.identity;
                const isSpeaking = p.isSpeaking;
                const isMicMuted = p.isMicrophoneEnabled === false;
                const isCamOn = p.isCameraEnabled;

                return (
                  <div key={p.identity} style={styles.rosterItem}>
                    <div style={styles.rosterAvatar}>
                      {(p.name?.[0] || p.identity[0] || "?").toUpperCase()}
                    </div>
                    <div style={styles.rosterDetails}>
                      <span style={styles.rosterName}>
                        {p.name || p.identity} {isLocal && "(You)"}
                      </span>
                      <span style={styles.rosterStatus}>
                        {isSpeaking ? "🗣️ Speaking" : isMicMuted ? "Muted" : "Active"}
                      </span>
                    </div>

                    <div style={styles.rosterActions}>
                      <span title={isMicMuted ? "Microphone Muted" : "Microphone On"}>
                        {isMicMuted ? "🔇" : "🎤"}
                      </span>
                      <span title={isCamOn ? "Camera On" : "Camera Off"}>
                        {isCamOn ? "📹" : "📷"}
                      </span>

                      {creds.isHost && !isLocal && (
                        <>
                          <button
                            onClick={() => handleMuteParticipant(p.identity)}
                            style={styles.smallActionBtn}
                            title="Mute participant"
                          >
                            Mute
                          </button>
                          <button
                            onClick={() => handleRemoveParticipant(p.identity)}
                            style={styles.removeBtn}
                            title="Remove from room"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </main>

      {/* Floating Minimal Bottom Control Bar (FaceTime / Zoom style) */}
      <footer style={styles.controlBarWrapper}>
        <div style={styles.controlBar}>
          {/* Microphone */}
          <button
            onClick={handleToggleMic}
            style={isMicrophoneEnabled ? styles.controlBtn : styles.controlBtnDanger}
            title={isMicrophoneEnabled ? "Mute Microphone" : "Unmute Microphone"}
          >
            <span style={styles.btnIcon}>{isMicrophoneEnabled ? "🎤" : "🔇"}</span>
            <span style={styles.btnLabel}>{isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
          </button>

          {/* Camera */}
          <button
            onClick={handleToggleCam}
            style={isCameraEnabled ? styles.controlBtn : styles.controlBtnDanger}
            title={isCameraEnabled ? "Stop Camera" : "Start Camera"}
          >
            <span style={styles.btnIcon}>{isCameraEnabled ? "📹" : "📷"}</span>
            <span style={styles.btnLabel}>{isCameraEnabled ? "Stop Video" : "Start Video"}</span>
          </button>

          {/* Screen Share (Host & Participant can share) */}
          <button
            onClick={handleToggleScreenShare}
            style={isScreenShareEnabled ? styles.controlBtnActive : styles.controlBtn}
            title={isScreenShareEnabled ? "Stop Sharing Screen" : "Share Screen"}
          >
            <span style={styles.btnIcon}>🖥️</span>
            <span style={styles.btnLabel}>{isScreenShareEnabled ? "Stop Share" : "Share Screen"}</span>
          </button>

          {/* Participants */}
          <button
            onClick={() => setShowRoster((prev) => !prev)}
            style={showRoster ? styles.controlBtnActive : styles.controlBtn}
            title="View participants"
          >
            <span style={styles.btnIcon}>👥</span>
            <span style={styles.btnLabel}>{participants.length}</span>
          </button>

          {/* Host Controls Menu (if Host) */}
          {creds.isHost && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowHostMenu((prev) => !prev)}
                style={showHostMenu ? styles.controlBtnActive : styles.controlBtn}
                title="Host Controls"
              >
                <span style={styles.btnIcon}>🛡️</span>
                <span style={styles.btnLabel}>Host</span>
              </button>

              {showHostMenu && (
                <div style={styles.hostDropdown}>
                  <div style={styles.hostMenuHeader}>Host Management</div>
                  <button
                    onClick={() => {
                      setShowHostMenu(false);
                      handleMuteAll();
                    }}
                    style={styles.hostMenuItem}
                  >
                    🔇 Mute All Participants
                  </button>
                  <button
                    onClick={() => {
                      setShowHostMenu(false);
                      handleCopyInviteLink();
                    }}
                    style={styles.hostMenuItem}
                  >
                    🔗 Copy Invite Link
                  </button>
                  <div style={styles.hostDivider} />
                  <button
                    onClick={() => {
                      setShowHostMenu(false);
                      handleEndRoomForAll();
                    }}
                    style={{ ...styles.hostMenuItem, color: "#EF4444" }}
                  >
                    ⏹️ End Meeting For All
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Leave / End Call */}
          <button onClick={handleLeave} style={styles.endCallBtn} title="Leave Call">
            <span style={styles.btnIcon}>📞</span>
            <span style={styles.btnLabel}>Leave</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Participant Tile with Active Speaker Highlighting
// ---------------------------------------------------------------------------
function ParticipantTile({ trackRef }: { trackRef: any }) {
  const p: Participant = trackRef.participant;
  const isVideoPublished =
    trackRef.publication &&
    !trackRef.publication.isMuted &&
    trackRef.source === Track.Source.Camera;
  const isSpeaking = p?.isSpeaking;
  const isMuted = p?.isMicrophoneEnabled === false;
  const displayName = p?.name || p?.identity || "Participant";

  return (
    <div
      style={{
        ...styles.tileWrapper,
        border: isSpeaking ? "2px solid #10B981" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isSpeaking ? "0 0 16px rgba(16, 185, 129, 0.4)" : "none",
      }}
    >
      {isVideoPublished ? (
        <VideoTrack trackRef={trackRef} style={styles.videoTrackElement} />
      ) : (
        <div style={styles.avatarTile}>
          <div style={styles.avatarCircle}>
            {(displayName[0] || "?").toUpperCase()}
          </div>
          <span style={styles.avatarLabel}>{displayName}</span>
        </div>
      )}

      {/* Name and Mic Overlay */}
      <div style={styles.nameplate}>
        <span style={styles.nameplateText}>{displayName}</span>
        {isMuted ? (
          <span style={styles.micMutedBadge} title="Microphone Muted">
            🔇
          </span>
        ) : (
          <span style={{ fontSize: "11px", color: isSpeaking ? "#10B981" : "#94A3B8" }}>
            {isSpeaking ? "🗣️" : "🎤"}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: calculate CSS grid columns dynamically for up to 30 participants
// ---------------------------------------------------------------------------
function getGridColumns(count: number): string {
  if (count <= 1) return "1fr";
  if (count === 2) return "repeat(2, 1fr)";
  if (count <= 4) return "repeat(2, 1fr)";
  if (count <= 6) return "repeat(3, 1fr)";
  if (count <= 9) return "repeat(3, 1fr)";
  if (count <= 12) return "repeat(4, 1fr)";
  return "repeat(4, 1fr)";
}

// ---------------------------------------------------------------------------
// Styling Tokens & Minimal Dark Theme
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100vh",
    width: "100vw",
    backgroundColor: "#080C16",
    color: "#FFFFFF",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    overflow: "hidden",
  },
  centerContainer: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#080C16",
    color: "#F8FAFC",
  },
  spinner: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "3px solid rgba(56, 189, 248, 0.2)",
    borderTopColor: "#38BDF8",
    animation: "spin 1s linear infinite",
    marginBottom: "16px",
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
    margin: "0 0 6px 0",
  },
  subtitle: {
    fontSize: "13px",
    color: "#94A3B8",
    margin: 0,
  },
  card: {
    backgroundColor: "#0F172A",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "16px",
    padding: "32px",
    maxWidth: "400px",
    textAlign: "center",
  },
  cardHeading: {
    fontSize: "18px",
    fontWeight: 700,
    margin: "0 0 8px 0",
  },
  cardSub: {
    fontSize: "14px",
    color: "#94A3B8",
    lineHeight: "1.5",
    marginBottom: "24px",
  },
  actionRow: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    border: "none",
    padding: "10px 18px",
    borderRadius: "10px",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#E2E8F0",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 18px",
    borderRadius: "10px",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },
  viewRoot: {
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    backgroundColor: "#080C16",
  },
  permBanner: {
    backgroundColor: "#B45309",
    color: "#FFFFFF",
    padding: "8px 16px",
    fontSize: "13px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 100,
  },
  permBtn: {
    backgroundColor: "#FFFFFF",
    color: "#78350F",
    border: "none",
    borderRadius: "6px",
    padding: "4px 10px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "12px",
  },
  topHeader: {
    height: "52px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    backgroundColor: "rgba(10, 15, 29, 0.85)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    zIndex: 50,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  backButton: {
    backgroundColor: "transparent",
    border: "none",
    color: "#94A3B8",
    fontSize: "18px",
    cursor: "pointer",
    padding: "4px 8px",
  },
  roomBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    padding: "4px 8px",
    borderRadius: "12px",
    border: "1px solid rgba(239, 68, 68, 0.3)",
  },
  liveDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#EF4444",
  },
  liveText: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#EF4444",
    letterSpacing: "0.5px",
  },
  participantCountPill: {
    fontSize: "12px",
    color: "#94A3B8",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: "4px 10px",
    borderRadius: "12px",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    position: "relative",
  },
  inviteBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    color: "#38BDF8",
    border: "1px solid rgba(56, 189, 248, 0.3)",
    padding: "6px 12px",
    borderRadius: "14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  toast: {
    position: "absolute",
    top: "42px",
    right: "0",
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    padding: "6px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 600,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    whiteSpace: "nowrap",
    zIndex: 100,
  },
  headerBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#E2E8F0",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "6px 12px",
    borderRadius: "14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  activeHeaderBtn: {
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    border: "1px solid #0284C7",
    padding: "6px 12px",
    borderRadius: "14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  stageArea: {
    flex: 1,
    display: "flex",
    position: "relative",
    overflow: "hidden",
    padding: "8px 12px 76px 12px",
  },
  gridContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  grid: {
    flex: 1,
    display: "grid",
    gap: "10px",
    alignContent: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  gridCell: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: "140px",
  },
  tileWrapper: {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: "12px",
    overflow: "hidden",
    backgroundColor: "#111827",
    transition: "border 0.2s, box-shadow 0.2s",
  },
  videoTrackElement: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  avatarTile: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },
  avatarCircle: {
    width: "56px",
    height: "56px",
    borderRadius: "28px",
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    color: "#38BDF8",
    fontSize: "22px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "8px",
    border: "1px solid rgba(56, 189, 248, 0.3)",
  },
  avatarLabel: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#94A3B8",
  },
  nameplate: {
    position: "absolute",
    bottom: "8px",
    left: "8px",
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    backdropFilter: "blur(8px)",
    padding: "3px 8px",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  nameplateText: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#F8FAFC",
  },
  micMutedBadge: {
    fontSize: "11px",
  },
  paginationBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    padding: "6px",
  },
  pageBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    border: "none",
    color: "#FFFFFF",
    borderRadius: "6px",
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: "12px",
  },
  pageInfo: {
    fontSize: "12px",
    color: "#94A3B8",
  },
  screenShareStage: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "100%",
    height: "100%",
  },
  screenShareMain: {
    flex: 1,
    position: "relative",
    backgroundColor: "#000000",
    borderRadius: "12px",
    overflow: "hidden",
  },
  screenVideo: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  screenShareLabel: {
    position: "absolute",
    top: "10px",
    left: "10px",
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    color: "#38BDF8",
    fontWeight: 600,
  },
  screenStrip: {
    height: "110px",
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "4px",
  },
  stripTile: {
    width: "150px",
    height: "100%",
    flexShrink: 0,
  },
  rosterDrawer: {
    position: "absolute",
    top: "8px",
    right: "12px",
    bottom: "76px",
    width: "300px",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    backdropFilter: "blur(16px)",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "flex",
    flexDirection: "column",
    padding: "16px",
    zIndex: 40,
    boxShadow: "-8px 0 24px rgba(0,0,0,0.5)",
  },
  rosterHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  rosterTitle: {
    fontSize: "15px",
    fontWeight: 700,
    margin: 0,
  },
  closeDrawerBtn: {
    backgroundColor: "transparent",
    border: "none",
    color: "#94A3B8",
    fontSize: "14px",
    cursor: "pointer",
  },
  muteAllBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#EF4444",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "10px",
  },
  rosterSearchInput: {
    backgroundColor: "#1E293B",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "#FFFFFF",
    fontSize: "12px",
    marginBottom: "12px",
    outline: "none",
  },
  rosterList: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  rosterItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "6px 8px",
    borderRadius: "8px",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  rosterAvatar: {
    width: "30px",
    height: "30px",
    borderRadius: "15px",
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    color: "#38BDF8",
    fontSize: "12px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rosterDetails: {
    flex: 1,
    overflow: "hidden",
  },
  rosterName: {
    fontSize: "12px",
    fontWeight: 600,
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rosterStatus: {
    fontSize: "10px",
    color: "#94A3B8",
  },
  rosterActions: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  smallActionBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#E2E8F0",
    border: "none",
    borderRadius: "4px",
    padding: "3px 6px",
    fontSize: "11px",
    cursor: "pointer",
  },
  removeBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#EF4444",
    border: "none",
    borderRadius: "4px",
    padding: "3px 6px",
    fontSize: "11px",
    cursor: "pointer",
  },
  controlBarWrapper: {
    position: "absolute",
    bottom: "16px",
    left: "0",
    right: "0",
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 60,
  },
  controlBar: {
    pointerEvents: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    backdropFilter: "blur(16px)",
    padding: "6px 12px",
    borderRadius: "28px",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
  },
  controlBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#F8FAFC",
    border: "none",
    borderRadius: "20px",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    transition: "all 0.2s",
  },
  controlBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    color: "#38BDF8",
    border: "1px solid rgba(56, 189, 248, 0.4)",
    borderRadius: "20px",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    transition: "all 0.2s",
  },
  controlBtnDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    color: "#EF4444",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "20px",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
  },
  endCallBtn: {
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "20px",
    padding: "8px 16px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 700,
    marginLeft: "4px",
  },
  btnIcon: {
    fontSize: "14px",
  },
  btnLabel: {
    fontSize: "12px",
  },
  hostDropdown: {
    position: "absolute",
    bottom: "52px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#0F172A",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    padding: "8px",
    minWidth: "200px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    zIndex: 100,
  },
  hostMenuHeader: {
    fontSize: "11px",
    color: "#94A3B8",
    textTransform: "uppercase",
    padding: "4px 8px",
    fontWeight: 700,
  },
  hostMenuItem: {
    backgroundColor: "transparent",
    color: "#F1F5F9",
    border: "none",
    borderRadius: "6px",
    padding: "8px 10px",
    fontSize: "12px",
    textAlign: "left",
    cursor: "pointer",
    fontWeight: 500,
  },
  hostDivider: {
    height: "1px",
    backgroundColor: "rgba(255,255,255,0.08)",
    margin: "4px 0",
  },
};
