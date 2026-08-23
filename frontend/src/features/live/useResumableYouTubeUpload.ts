import { useState, useCallback, useRef } from "react";

export interface ResumableUploadOptions {
  file: Blob;
  accessToken: string;
  title: string;
  description?: string;
  privacyStatus?: "unlisted" | "private" | "public";
  chunkSize?: number; // default 5MB (5 * 1024 * 1024)
  onProgress?: (percent: number, uploadedBytes: number, totalBytes: number) => void;
}

export interface UseResumableYouTubeUploadReturn {
  isUploading: boolean;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  error: string | null;
  videoId: string | null;
  uploadVideo: (options: ResumableUploadOptions) => Promise<string>;
  cancelUpload: () => void;
}

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB minimum recommended for Google Resumable Upload

export function useResumableYouTubeUpload(): UseResumableYouTubeUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setError("Upload cancelled by user");
  }, []);

  const uploadVideo = useCallback(
    async ({
      file,
      accessToken,
      title,
      description = "Recorded live class session via SkillBridge",
      privacyStatus = "unlisted",
      chunkSize = DEFAULT_CHUNK_SIZE,
      onProgress,
    }: ResumableUploadOptions): Promise<string> => {
      setIsUploading(true);
      setProgress(0);
      setUploadedBytes(0);
      setTotalBytes(file.size);
      setError(null);
      setVideoId(null);

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        // Step 1: Initiate Resumable Upload Session
        const metadata = {
          snippet: {
            title,
            description,
            categoryId: "27", // Education category
          },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: false,
            embeddable: true,
          },
        };

        const initResponse = await fetch(
          "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json; charset=UTF-8",
              "X-Upload-Content-Length": `${file.size}`,
              "X-Upload-Content-Type": file.type || "video/webm",
            },
            body: JSON.stringify(metadata),
            signal,
          },
        );

        if (!initResponse.ok) {
          const errText = await initResponse.text();
          throw new Error(`Failed to initiate YouTube upload session: ${initResponse.status} ${errText}`);
        }

        const locationUrl = initResponse.headers.get("Location");
        if (!locationUrl) {
          throw new Error("No resumable upload location header received from YouTube API");
        }

        // Step 2: Upload in Chunks with Resumption Support
        let currentByte = 0;
        const total = file.size;

        while (currentByte < total) {
          if (signal.aborted) {
            throw new Error("Upload aborted");
          }

          const nextByte = Math.min(currentByte + chunkSize, total);
          const chunkBlob = file.slice(currentByte, nextByte);

          const contentRange = `bytes ${currentByte}-${nextByte - 1}/${total}`;

          const chunkResponse = await fetch(locationUrl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type || "video/webm",
              "Content-Range": contentRange,
            },
            body: chunkBlob,
            signal,
          });

          if (chunkResponse.status === 308) {
            // Resume Incomplete - query range or advance pointer
            currentByte = nextByte;
            const pct = Math.round((currentByte / total) * 100);
            setProgress(pct);
            setUploadedBytes(currentByte);
            if (onProgress) onProgress(pct, currentByte, total);
          } else if (chunkResponse.status === 200 || chunkResponse.status === 201) {
            // Complete!
            const responseData = await chunkResponse.json();
            const createdVideoId = responseData.id;
            if (!createdVideoId) {
              throw new Error("YouTube upload succeeded but no video ID returned");
            }
            setProgress(100);
            setUploadedBytes(total);
            setVideoId(createdVideoId);
            setIsUploading(false);
            if (onProgress) onProgress(100, total, total);
            return createdVideoId;
          } else {
            const errText = await chunkResponse.text();
            throw new Error(`Upload chunk error (${chunkResponse.status}): ${errText}`);
          }
        }

        throw new Error("Upload completed loop without receiving finalized video ID");
      } catch (err: any) {
        const errorMsg = err?.message || "Failed to upload video to YouTube";
        setError(errorMsg);
        setIsUploading(false);
        throw err;
      }
    },
    [],
  );

  return {
    isUploading,
    progress,
    uploadedBytes,
    totalBytes,
    error,
    videoId,
    uploadVideo,
    cancelUpload,
  };
}
