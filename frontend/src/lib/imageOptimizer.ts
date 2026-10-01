export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: "jpeg" | "webp" | "png";
  base64?: boolean;
}

export interface OptimizedImageResult {
  uri: string;
  base64?: string;
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
  fileSizeBytes: number;
  savingsPercent?: number;
}

export const OPTIMIZATION_PRESETS = {
  /** Feed Post: 1280px, ~200-280KB, crisp on all retina screens */
  POST_IMAGE: {
    maxWidth: 1280,
    quality: 0.78,
    format: "jpeg" as const,
  },
  /** Presentation / Document Slide: 1600px for crystal-clear text */
  DOCUMENT_SLIDE: {
    maxWidth: 1600,
    quality: 0.82,
    format: "jpeg" as const,
  },
  /** User Avatar / Profile Photo: 512x512, ~40-60KB */
  AVATAR: {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.8,
    format: "jpeg" as const,
  },
  /** Real-time Chat Picture: 1024px, ~120-180KB for instant send */
  CHAT_PHOTO: {
    maxWidth: 1024,
    quality: 0.75,
    format: "jpeg" as const,
  },
};

/**
 * Optimizes an image client-side via Smart Resizing & Perceptual Compression.
 * Gracefully falls back if native module is not compiled into the current dev build.
 */
export async function optimizeImageForUpload(
  uri: string,
  options: ImageOptimizationOptions = OPTIMIZATION_PRESETS.POST_IMAGE,
  originalFilename?: string,
): Promise<OptimizedImageResult> {
  const {
    maxWidth = 1280,
    maxHeight,
    quality = 0.78,
    format = "jpeg",
    base64 = true,
  } = options;

  let mimeType = "image/jpeg";
  let extension = "jpg";

  if (format === "webp") {
    mimeType = "image/webp";
    extension = "webp";
  } else if (format === "png") {
    mimeType = "image/png";
    extension = "png";
  }

  const baseName = originalFilename
    ? originalFilename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_")
    : `img_${Date.now()}`;
  const outFileName = `${baseName}.${extension}`;

  try {
    // Dynamic import to avoid top-level native module initialization crashes
    // if the installed dev build doesn't yet contain the newly added native package.
    const ImageManipulator = await import("expo-image-manipulator");
    if (!ImageManipulator || typeof ImageManipulator.manipulateAsync !== "function") {
      throw new Error("ExpoImageManipulator not available in current native build");
    }

    const saveFormat =
      format === "webp"
        ? ImageManipulator.SaveFormat.WEBP
        : format === "png"
          ? ImageManipulator.SaveFormat.PNG
          : ImageManipulator.SaveFormat.JPEG;

    const actions: any[] = [];
    if (maxWidth || maxHeight) {
      actions.push({
        resize: {
          width: maxWidth,
          height: maxHeight,
        },
      });
    }

    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      actions,
      {
        compress: quality,
        format: saveFormat,
        base64: Boolean(base64),
      },
    );

    const fileSizeBytes = manipulated.base64
      ? Math.round((manipulated.base64.length * 3) / 4)
      : 250 * 1024;

    return {
      uri: manipulated.uri,
      base64: manipulated.base64,
      width: manipulated.width,
      height: manipulated.height,
      mimeType,
      fileName: outFileName,
      fileSizeBytes,
    };
  } catch {
    // Safe graceful fallback: returns original without breaking app load or upload flow
    return {
      uri,
      mimeType,
      fileName: outFileName,
      width: 0,
      height: 0,
      fileSizeBytes: 0,
    };
  }
}
