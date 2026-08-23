import { useState, useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { api } from "@/lib/api";

export type RecordingStatus = "none" | "recording" | "uploading" | "ready" | "failed";

export interface UseLocalRecorderReturn {
  isRecording: boolean;
  recordingStatus: RecordingStatus;
  durationSeconds: number;
  recordedBlob: Blob | null;
  startRecording: (stream?: MediaStream | null) => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  saveRecordingToSession: (sessionId: string, videoId: string, provider?: "youtube" | "google_drive" | "r2") => Promise<boolean>;
  resetRecorder: () => void;
}

export function useLocalRecorder(): UseLocalRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("none");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async (stream?: MediaStream | null): Promise<boolean> => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      console.warn("Local MediaRecorder is web-optimized. Native screen capture fallback active.");
      return false;
    }

    try {
      let captureStream = stream;

      // If no stream passed, request display media + audio
      if (!captureStream && navigator.mediaDevices?.getDisplayMedia) {
        captureStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      }

      if (!captureStream) {
        throw new Error("No media stream available to record.");
      }

      chunksRef.current = [];
      const options: MediaRecorderOptions = {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : "video/webm",
      };

      const recorder = new MediaRecorder(captureStream, options);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstart = () => {
        setIsRecording(true);
        setRecordingStatus("recording");
        setDurationSeconds(0);
        timerRef.current = setInterval(() => {
          setDurationSeconds((prev) => prev + 1);
        }, 1000);
      };

      recorder.start(5000); // 5s timeslices
      mediaRecorderRef.current = recorder;
      return true;
    } catch (err) {
      console.error("Failed to start local recording:", err);
      setRecordingStatus("failed");
      return false;
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        setIsRecording(false);
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const completeBlob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordedBlob(completeBlob);
        setIsRecording(false);
        setRecordingStatus("ready");
        resolve(completeBlob);
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  const saveRecordingToSession = useCallback(
    async (
      sessionId: string,
      videoId: string,
      provider: "youtube" | "google_drive" | "r2" = "youtube",
    ): Promise<boolean> => {
      setRecordingStatus("uploading");
      try {
        await api(`/sessions/${sessionId}/recording`, {
          method: "PATCH",
          body: JSON.stringify({
            videoId,
            provider,
            status: "ready",
            durationSeconds,
          }),
        });
        setRecordingStatus("ready");
        return true;
      } catch (e) {
        console.error("Failed to save recording to session:", e);
        setRecordingStatus("failed");
        return false;
      }
    },
    [durationSeconds],
  );

  const resetRecorder = useCallback(() => {
    setIsRecording(false);
    setRecordingStatus("none");
    setDurationSeconds(0);
    setRecordedBlob(null);
    chunksRef.current = [];
  }, []);

  return {
    isRecording,
    recordingStatus,
    durationSeconds,
    recordedBlob,
    startRecording,
    stopRecording,
    saveRecordingToSession,
    resetRecorder,
  };
}
