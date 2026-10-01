import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, Alert, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { api } from "@/lib/api";
import { optimizeImageForUpload, OPTIMIZATION_PRESETS } from "@/lib/imageOptimizer";

export interface UploadedMediaItem {
  mediaObjectId: string;
  url: string;
  mediaType: "image" | "video" | "document";
  name?: string;
  sizeBytes?: number;
}

interface MediaUploaderProps {
  attachedMedia: UploadedMediaItem[];
  onChange: (items: UploadedMediaItem[]) => void;
  onUploadingChange?: (isUploading: boolean) => void;
}

export function MediaUploader({ attachedMedia, onChange, onUploadingChange }: MediaUploaderProps) {
  const { colors } = useTheme();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState("");

  const setUploadingState = (val: boolean, text = "") => {
    setIsUploading(val);
    setUploadProgressText(text);
    onUploadingChange?.(val);
  };

  // Upload file binary to direct feed upload endpoint or presigned upload ticket
  const uploadBinary = async (
    fileUri: string,
    mimeType: string,
    fileSize: number,
    fileName: string,
    fileBase64?: string,
  ) => {
    // 1. Direct Base64 upload to server (reliable on all platforms)
    if (fileBase64) {
      setUploadingState(true, "Uploading attachment...");
      try {
        const uploadRes = await api<{
          url: string;
          mediaObjectId?: string;
          mediaType?: "image" | "video" | "document";
        }>("/feed/upload", {
          method: "POST",
          body: JSON.stringify({
            fileBase64,
            contentType: mimeType,
            fileName,
          }),
        });

        const newItem: UploadedMediaItem = {
          mediaObjectId: uploadRes.mediaObjectId || "",
          url: uploadRes.url,
          mediaType: uploadRes.mediaType || (mimeType.startsWith("image/") ? "image" : "document"),
          name: fileName,
          sizeBytes: fileSize,
        };

        onChange([...attachedMedia, newItem]);
        triggerHaptic("notificationSuccess");
        return;
      } catch {
        // Fall back to signed upload ticket if direct upload failed
      }
    }

    setUploadingState(true, "Preparing upload ticket...");

    // 2. Get presigned upload ticket
    const ticketRes = await api<{
      ticket: { url: string; mediaObjectId: string; publicUrl?: string };
    }>("/feed/upload-ticket", {
      method: "POST",
      body: JSON.stringify({ mimeType, fileSizeBytes: fileSize }),
    });

    setUploadingState(true, "Uploading attachment...");

    // 3. Fetch binary blob & PUT to signed URL
    const fileBlob = await (await fetch(fileUri)).blob();
    const uploadRes = await fetch(ticketRes.ticket.url, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: fileBlob,
    });

    if (!uploadRes.ok) {
      throw new Error("Direct upload failed to storage provider");
    }

    const mediaType: "image" | "video" | "document" = mimeType.startsWith("video/")
      ? "video"
      : mimeType.startsWith("application/")
        ? "document"
        : "image";

    const newItem: UploadedMediaItem = {
      mediaObjectId: ticketRes.ticket.mediaObjectId,
      url: ticketRes.ticket.publicUrl || fileUri,
      mediaType,
      name: fileName,
      sizeBytes: fileSize,
    };

    onChange([...attachedMedia, newItem]);
    triggerHaptic("notificationSuccess");
  };

  // Pick Photos
  const handlePickPhotos = async () => {
    if (attachedMedia.filter((m) => m.mediaType === "image").length >= 8) {
      Alert.alert("Limit Reached", "You can attach a maximum of 8 images.");
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow gallery access to attach photos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingState(true, "Optimizing & compressing photos...");
        for (const asset of result.assets) {
          const name = asset.fileName || `photo_${Date.now()}.jpg`;
          const optimized = await optimizeImageForUpload(asset.uri, OPTIMIZATION_PRESETS.POST_IMAGE, name);
          await uploadBinary(
            optimized.uri || asset.uri,
            optimized.mimeType,
            optimized.fileSizeBytes || asset.fileSize || 250 * 1024,
            optimized.fileName,
            optimized.base64 || asset.base64 || undefined
          );
        }
      }
    } catch (err: any) {
      Alert.alert("Photo Upload Error", err.message || "Failed to process photo");
    } finally {
      setUploadingState(false);
    }
  };

  // Take Photo with Camera
  const handleTakePhoto = async () => {
    if (attachedMedia.filter((m) => m.mediaType === "image").length >= 8) {
      Alert.alert("Limit Reached", "You can attach a maximum of 8 images.");
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow camera access to take a photo.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingState(true, "Optimizing camera snapshot...");
        const asset = result.assets[0]!;
        const name = `camera_${Date.now()}.jpg`;
        const optimized = await optimizeImageForUpload(asset.uri, OPTIMIZATION_PRESETS.POST_IMAGE, name);
        await uploadBinary(
          optimized.uri || asset.uri,
          optimized.mimeType,
          optimized.fileSizeBytes || 250 * 1024,
          optimized.fileName,
          optimized.base64 || asset.base64 || undefined
        );
      }
    } catch (err: any) {
      Alert.alert("Camera Error", err.message || "Failed to capture photo");
    } finally {
      setUploadingState(false);
    }
  };

  // Pick Video
  const handlePickVideo = async () => {
    if (attachedMedia.some((m) => m.mediaType === "video")) {
      Alert.alert("Limit Reached", "Only 1 video may be attached per post.");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0]!;
        const mime = asset.mimeType || "video/mp4";
        const size = asset.fileSize || 1024 * 1024 * 5;
        const name = asset.fileName || "video.mp4";
        if (size > 50 * 1024 * 1024) {
          Alert.alert("File Too Large", "Videos must be under 50MB.");
          return;
        }
        await uploadBinary(asset.uri, mime, size, name);
      }
    } catch (err: any) {
      Alert.alert("Video Upload Error", err.message || "Failed to process video");
    } finally {
      setUploadingState(false);
    }
  };

  // Pick Document / PDF
  const handlePickDocument = async () => {
    if (attachedMedia.filter((m) => m.mediaType === "document").length >= 3) {
      Alert.alert("Limit Reached", "You can attach a maximum of 3 documents.");
      return;
    }

    try {
      let docPickerModule: any = null;
      try {
        docPickerModule = await import("expo-document-picker");
      } catch {
        docPickerModule = null;
      }

      if (!docPickerModule || !docPickerModule.getDocumentAsync) {
        Alert.alert(
          "Document Picker Unavailable",
          "File picking is not supported in this client build. Please attach photos or videos instead.",
        );
        return;
      }

      const result = await docPickerModule.getDocumentAsync({
        type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0]!;
        const mime = doc.mimeType || "application/pdf";
        const size = doc.size || 1024 * 100;
        const name = doc.name || "document.pdf";
        if (size > 25 * 1024 * 1024) {
          Alert.alert("File Too Large", "Documents must be under 25MB.");
          return;
        }
        await uploadBinary(doc.uri, mime, size, name);
      }
    } catch (err: any) {
      Alert.alert("Document Error", err.message || "Failed to attach document");
    } finally {
      setUploadingState(false);
    }
  };

  const handleRemove = (index: number) => {
    triggerHaptic("selection");
    const updated = attachedMedia.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  return (
    <View style={styles.container}>
      {/* Uploading Banner */}
      {isUploading && (
        <Row style={[styles.uploadingBanner, { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.uploadingText, { color: colors.primary }]}>
            {uploadProgressText || "Processing attachment..."}
          </Text>
        </Row>
      )}

      {/* Previews Tray */}
      {attachedMedia.length > 0 && (
        <View style={styles.previewsGrid}>
          {attachedMedia.map((m, idx) => (
            <View key={m.mediaObjectId} style={[styles.previewThumb, { borderColor: colors.border }]}>
              {m.mediaType === "image" ? (
                <Image source={{ uri: m.url }} style={styles.thumbImage} />
              ) : m.mediaType === "video" ? (
                <View style={styles.videoThumbBox}>
                  <MaterialCommunityIcons name="video" size={26} color="#38BDF8" />
                  <Text style={styles.videoThumbLabel} numberOfLines={1}>Video</Text>
                </View>
              ) : (
                <View style={styles.docThumbBox}>
                  <MaterialCommunityIcons name="file-pdf-box" size={26} color="#EF4444" />
                  <Text style={styles.docThumbLabel} numberOfLines={1}>
                    {m.name || "PDF"}
                  </Text>
                </View>
              )}

              <Pressable onPress={() => handleRemove(idx)} style={styles.removeBtn}>
                <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Media Action Buttons */}
      <Row style={styles.actionsRow}>
        {/* Photo Gallery */}
        <Pressable
          disabled={isUploading}
          onPress={handlePickPhotos}
          style={[styles.mediaPill, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <MaterialCommunityIcons name="image-outline" size={18} color="#10B981" />
          <Text style={[styles.mediaPillText, { color: colors.text }]}>Photo</Text>
        </Pressable>

        {/* Camera */}
        <Pressable
          disabled={isUploading}
          onPress={handleTakePhoto}
          style={[styles.mediaPill, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <MaterialCommunityIcons name="camera-outline" size={18} color="#10B981" />
          <Text style={[styles.mediaPillText, { color: colors.text }]}>Camera</Text>
        </Pressable>

        {/* Video */}
        <Pressable
          disabled={isUploading}
          onPress={handlePickVideo}
          style={[styles.mediaPill, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <MaterialCommunityIcons name="video-outline" size={18} color="#38BDF8" />
          <Text style={[styles.mediaPillText, { color: colors.text }]}>Video</Text>
        </Pressable>

        {/* PDF / Document */}
        <Pressable
          disabled={isUploading}
          onPress={handlePickDocument}
          style={[styles.mediaPill, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <MaterialCommunityIcons name="file-document-outline" size={18} color="#F59E0B" />
          <Text style={[styles.mediaPillText, { color: colors.text }]}>File</Text>
        </Pressable>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  uploadingBanner: {
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  uploadingText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  previewsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  previewThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  videoThumbBox: {
    width: "100%",
    height: "100%",
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  videoThumbLabel: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 2,
  },
  docThumbBox: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  docThumbLabel: {
    color: "#F1F5F9",
    fontSize: 9,
    marginTop: 2,
  },
  removeBtn: {
    position: "absolute",
    top: 3,
    right: 3,
    backgroundColor: "rgba(0,0,0,0.65)",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  mediaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  mediaPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
