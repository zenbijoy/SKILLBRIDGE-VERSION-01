import { useEffect, useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { api } from "@/lib/api";
import { useLocalRecorder } from "./useLocalRecorder";

interface LiveCreds {
  url: string;
  token: string;
  canPublish: boolean;
  sessionId?: string;
  roomName?: string;
  participantName?: string;
}

export default function LiveRoomScreenWeb() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [creds, setCreds] = useState<LiveCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local Recording Hook
  const {
    isRecording,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    recordingStatus: _recordingStatus,
    durationSeconds,
    recordedBlob,
    startRecording,
    stopRecording,
    saveRecordingToSession,
    resetRecorder,
  } = useLocalRecorder();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [inputVideoId, setInputVideoId] = useState("");
  const [savingSession, setSavingSession] = useState(false);

  const fetchToken = useCallback(() => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    api<LiveCreds>(`/live/token/${roomId}`, { method: "POST" })
      .then((data) => {
        setCreds(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Failed to join live classroom");
        setLoading(false);
      });
  }, [roomId]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const handleStartRecord = async () => {
    await startRecording();
  };

  const handleStopRecord = async () => {
    const blob = await stopRecording();
    if (blob) {
      setShowSaveModal(true);
    }
  };

  const handleSaveRecording = async () => {
    if (!creds?.sessionId) return;
    setSavingSession(true);
    try {
      const vid = inputVideoId.trim() || `rec_${Date.now()}`;
      await saveRecordingToSession(creds.sessionId, vid, "youtube");
      setShowSaveModal(false);
      resetRecorder();
      alert("Session recording successfully saved and attached to this class!");
    } catch (err: any) {
      alert("Failed to save recording: " + err.message);
    } finally {
      setSavingSession(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.spinner} />
        <h3 style={styles.title}>Connecting to Live Classroom…</h3>
        <p style={styles.subtitle}>Negotiating WebRTC audio and video stream</p>
      </div>
    );
  }

  if (error || !creds) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.errorCard}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.errorHeading}>Live Session Notice</h2>
          <p style={styles.errorMessage}>
            {error || "Could not retrieve access token for this live session."}
          </p>
          <div style={styles.actionRow}>
            <button onClick={() => router.back()} style={styles.btnSecondary}>
              ← Back to Room
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
      {/* Top Floating Recording Bar for Teachers/Hosts */}
      {creds.canPublish ? (
        <div style={styles.recordingBar}>
          {!isRecording ? (
            <button onClick={handleStartRecord} style={styles.recordStartBtn}>
              🔴 Record Session (Local HD)
            </button>
          ) : (
            <div style={styles.recordingActiveGroup}>
              <div style={styles.recordingPulse}>
                <span style={styles.recordingDot} />
                <span style={styles.recordingTimer}>REC {formatTimer(durationSeconds)}</span>
              </div>
              <button onClick={handleStopRecord} style={styles.recordStopBtn}>
                ⏹️ End & Save Recording
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Main LiveKit Classroom Conference */}
      <LiveKitRoom
        video={creds.canPublish}
        audio={creds.canPublish}
        token={creds.token}
        serverUrl={creds.url}
        connect={true}
        data-lk-theme="default"
        style={{ height: "100vh", flex: 1 }}
        onDisconnected={() => {
          router.back();
        }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>

      {/* Recording Save & YouTube Upload Modal */}
      {showSaveModal ? (
        <div style={styles.modalOverlay}>
          <div style={styles.saveModalCard}>
            <h3 style={styles.modalHeading}>📹 Session Recording Ready</h3>
            <p style={styles.modalSub}>
              Your live class was captured locally in HD ({recordedBlob ? Math.round(recordedBlob.size / 1024 / 1024) : 0} MB).
            </p>

            <div style={{ margin: "16px 0", textAlign: "left" }}>
              <label style={styles.fieldLabel}>YouTube Video ID or Unlisted Link:</label>
              <input
                type="text"
                placeholder="e.g. dQw4w9WgXcQ or paste YouTube URL"
                value={inputVideoId}
                onChange={(e) => setInputVideoId(e.target.value)}
                style={styles.textInput}
              />
              <span style={styles.fieldHint}>
                Attach the YouTube unlisted video ID so students can replay this session.
              </span>
            </div>

            <div style={styles.actionRow}>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  resetRecorder();
                }}
                style={styles.btnSecondary}
              >
                Discard
              </button>
              <button
                onClick={handleSaveRecording}
                disabled={savingSession}
                style={styles.btnPrimary}
              >
                {savingSession ? "Saving…" : "Save Recording Reference"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#08101E",
    overflow: "hidden",
    position: "relative",
  },
  recordingBar: {
    position: "absolute",
    top: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    backdropFilter: "blur(10px)",
    padding: "6px 14px",
    borderRadius: "24px",
    border: "1px solid rgba(56, 189, 248, 0.3)",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.6)",
  },
  recordStartBtn: {
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    border: "none",
    padding: "6px 14px",
    borderRadius: "16px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  recordingActiveGroup: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  recordingPulse: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  recordingDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#EF4444",
  },
  recordingTimer: {
    color: "#F8FAFC",
    fontSize: "13px",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  recordStopBtn: {
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    border: "1px solid #334155",
    padding: "5px 12px",
    borderRadius: "14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  centerContainer: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#08101E",
    color: "#F0F6FC",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "24px",
    boxSizing: "border-box",
  },
  spinner: {
    width: "44px",
    height: "44px",
    border: "3px solid rgba(59, 130, 246, 0.2)",
    borderTopColor: "#3B82F6",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "18px",
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
    margin: "0 0 6px 0",
    color: "#F8FAFC",
  },
  subtitle: {
    fontSize: "14px",
    color: "#94A3B8",
    margin: 0,
  },
  errorCard: {
    maxWidth: "460px",
    width: "100%",
    backgroundColor: "#0D1829",
    padding: "32px",
    borderRadius: "16px",
    border: "1px solid #1E293B",
    textAlign: "center",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
  },
  errorIcon: {
    fontSize: "36px",
    marginBottom: "12px",
  },
  errorHeading: {
    fontSize: "20px",
    fontWeight: 600,
    margin: "0 0 10px 0",
    color: "#F1F5F9",
  },
  errorMessage: {
    fontSize: "14px",
    color: "#94A3B8",
    lineHeight: 1.6,
    marginBottom: "24px",
  },
  actionRow: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
  },
  btnPrimary: {
    padding: "10px 20px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#2563EB",
    color: "#FFFFFF",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s ease",
  },
  btnSecondary: {
    padding: "10px 20px",
    borderRadius: "8px",
    border: "1px solid #334155",
    backgroundColor: "#1E293B",
    color: "#E2E8F0",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    backdropFilter: "blur(6px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
    padding: "20px",
    boxSizing: "border-box",
  },
  saveModalCard: {
    width: "100%",
    maxWidth: "480px",
    backgroundColor: "#0F172A",
    borderRadius: "16px",
    padding: "24px",
    border: "1px solid #1E293B",
    textAlign: "center",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
  },
  modalHeading: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#FFFFFF",
    margin: "0 0 8px 0",
  },
  modalSub: {
    fontSize: "13px",
    color: "#94A3B8",
    margin: "0 0 16px 0",
  },
  fieldLabel: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#E2E8F0",
    marginBottom: "6px",
  },
  textInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    color: "#FFFFFF",
    fontSize: "14px",
    boxSizing: "border-box",
    outline: "none",
  },
  fieldHint: {
    display: "block",
    fontSize: "11px",
    color: "#64748B",
    marginTop: "4px",
  },
};
