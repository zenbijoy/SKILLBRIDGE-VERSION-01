import { Platform } from "react-native";
import { api } from "./api";

/**
 * Universal URI to Base64 converter for React Native (Android/iOS) and Web.
 * Safely handles local file://, content://, blob: and http(s) URIs.
 */
export async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const b64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(b64);
      };
      reader.onerror = () => reject(new Error("Failed to read file as Base64 on Web."));
      reader.readAsDataURL(blob);
    });
  }

  // Native: Android / iOS
  try {
    const FileSystem = await import("expo-file-system");
    if (FileSystem && typeof FileSystem.readAsStringAsync === "function") {
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType?.Base64 || ("base64" as any),
      });
      if (b64) return b64;
    }
  } catch (err) {
    console.warn("expo-file-system native read failed, falling back to fetch blob:", err);
  }

  // Fallback via fetch blob
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(new Error("Failed to read file as Base64."));
    reader.readAsDataURL(blob);
  });
}

export function getSafeMimeType(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType !== "application/octet-stream" && mimeType !== "*/*") {
    return mimeType;
  }
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "txt": return "text/plain";
    case "csv": return "text/csv";
    case "zip": return "application/zip";
    case "doc": return "application/msword";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "m4a": return "audio/m4a";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    default: return mimeType || "application/pdf";
  }
}

export interface UploadAttachmentResult {
  url: string;
  storagePath: string;
  provider: string;
  type: "image" | "voice" | "file";
  name: string;
  size: number;
  duration?: number;
}

/**
 * Upload an attachment directly to the conversation upload endpoint.
 * Bypasses presigned S3/R2 direct PUT CORS/signature issues and guarantees
 * server-side verification and storage.
 */
export async function uploadConversationAttachment(
  conversationId: string,
  params: {
    uri: string;
    fileName: string;
    contentType: string;
    duration?: number;
    base64?: string;
  },
): Promise<UploadAttachmentResult> {
  const safeContentType = getSafeMimeType(params.fileName, params.contentType);
  let fileBase64 = params.base64;
  if (!fileBase64) {
    fileBase64 = await uriToBase64(params.uri);
  }

  return await api<UploadAttachmentResult>(`/chat/conversations/${conversationId}/upload`, {
    method: "POST",
    body: JSON.stringify({
      fileBase64,
      contentType: safeContentType,
      fileName: params.fileName,
      duration: params.duration ? Math.round(params.duration) : undefined,
    }),
  });
}
