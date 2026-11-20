import { logger } from "../lib/logger.js";

export interface ParsedDriveLink {
  isValid: boolean;
  type: "folder" | "file";
  driveId: string;
  docType: "pdf" | "document" | "presentation" | "spreadsheet" | "generic";
  normalizedUrl: string;
}

export interface DriveResourceItem {
  driveId: string;
  name: string;
  mimeType: string;
  fileSizeBytes: number;
  downloadUrl: string;
  previewUrl: string;
  docType: "pdf" | "document" | "presentation" | "spreadsheet" | "generic";
}

export interface DriveFolderInspectionResult {
  folderId: string;
  folderName: string;
  totalFound: number;
  items: DriveResourceItem[];
}

/**
 * Parses and validates Google Drive URLs in various formats:
 * - https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs
 * - https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view
 * - https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs
 * - https://docs.google.com/document/d/... /presentation/d/... /spreadsheets/d/...
 */
export function parseGoogleDriveUrl(rawUrl: string): ParsedDriveLink {
  const url = String(rawUrl || "").trim();
  if (!url) {
    return {
      isValid: false,
      type: "file",
      driveId: "",
      docType: "generic",
      normalizedUrl: "",
    };
  }

  // 1. Google Drive Folder
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]{10,})/i);
  if (folderMatch && folderMatch[1]) {
    const driveId = folderMatch[1]!;
    return {
      isValid: true,
      type: "folder",
      driveId,
      docType: "generic",
      normalizedUrl: `https://drive.google.com/drive/folders/${driveId}`,
    };
  }

  // 2. Google Docs
  const docMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{10,})/i);
  if (docMatch && docMatch[1]) {
    const driveId = docMatch[1]!;
    return {
      isValid: true,
      type: "file",
      driveId,
      docType: "document",
      normalizedUrl: `https://docs.google.com/document/d/${driveId}`,
    };
  }

  // 3. Google Slides
  const slideMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]{10,})/i);
  if (slideMatch && slideMatch[1]) {
    const driveId = slideMatch[1]!;
    return {
      isValid: true,
      type: "file",
      driveId,
      docType: "presentation",
      normalizedUrl: `https://docs.google.com/presentation/d/${driveId}`,
    };
  }

  // 4. Google Sheets
  const sheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/i);
  if (sheetMatch && sheetMatch[1]) {
    const driveId = sheetMatch[1]!;
    return {
      isValid: true,
      type: "file",
      driveId,
      docType: "spreadsheet",
      normalizedUrl: `https://docs.google.com/spreadsheets/d/${driveId}`,
    };
  }

  // 5. Google Drive File (/file/d/...)
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/i);
  if (fileMatch && fileMatch[1]) {
    const driveId = fileMatch[1]!;
    return {
      isValid: true,
      type: "file",
      driveId,
      docType: "pdf",
      normalizedUrl: `https://drive.google.com/file/d/${driveId}/view`,
    };
  }

  // 6. Generic ID parameter (?id=... or &id=...)
  const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i);
  if (idParamMatch && idParamMatch[1]) {
    const driveId = idParamMatch[1]!;
    return {
      isValid: true,
      type: "file",
      driveId,
      docType: "pdf",
      normalizedUrl: `https://drive.google.com/uc?id=${driveId}`,
    };
  }

  return {
    isValid: false,
    type: "file",
    driveId: "",
    docType: "generic",
    normalizedUrl: url,
  };
}

/**
 * Returns the direct download / PDF export URL for a Drive item.
 */
export function getDriveDirectDownloadUrl(
  driveId: string,
  docType: "pdf" | "document" | "presentation" | "spreadsheet" | "generic" = "pdf",
): string {
  if (docType === "document") {
    return `https://docs.google.com/document/d/${driveId}/export?format=pdf`;
  }
  if (docType === "presentation") {
    return `https://docs.google.com/presentation/d/${driveId}/export/pdf`;
  }
  if (docType === "spreadsheet") {
    return `https://docs.google.com/spreadsheets/d/${driveId}/export?format=pdf`;
  }
  return `https://drive.google.com/uc?export=download&id=${driveId}&confirm=t`;
}

/**
 * Extracts filename from Content-Disposition header if available.
 */
export function parseFilenameFromDisposition(disposition?: string | null): string | null {
  if (!disposition) return null;
  const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1].trim());
    } catch {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Fetches single file metadata from Google Drive.
 */
export async function fetchDriveFileMetadata(
  driveId: string,
  docType: "pdf" | "document" | "presentation" | "spreadsheet" | "generic" = "pdf",
  fallbackTitle = "Academic Document",
): Promise<DriveResourceItem> {
  const downloadUrl = getDriveDirectDownloadUrl(driveId, docType);
  const previewUrl = `https://drive.google.com/file/d/${driveId}/preview`;

  let name = fallbackTitle;
  let fileSizeBytes = 0;
  let mimeType = "application/pdf";

  try {
    const res = await fetch(downloadUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": "SkillBridge-Vault-Sync/2.1",
      },
    });

    if (res.ok) {
      const dispName = parseFilenameFromDisposition(res.headers.get("content-disposition"));
      if (dispName) name = dispName;

      const cl = res.headers.get("content-length");
      if (cl && !isNaN(Number(cl))) {
        fileSizeBytes = Number(cl);
      }

      const ct = res.headers.get("content-type");
      if (ct && !ct.includes("text/html")) {
        mimeType = ct.split(";")[0]?.trim() || mimeType;
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, driveId }, "[GoogleDriveService] Failed to fetch HEAD metadata, using defaults");
  }

  // Ensure reasonable name
  if (!name.endsWith(".pdf") && docType !== "generic") {
    if (name === fallbackTitle) {
      name = `${fallbackTitle}.pdf`;
    }
  }

  return {
    driveId,
    name,
    mimeType,
    fileSizeBytes: fileSizeBytes || 1024 * 1024,
    downloadUrl,
    previewUrl,
    docType,
  };
}

/**
 * Crawls and extracts resource metadata from a public Google Drive folder.
 */
export async function crawlGoogleDriveFolder(
  folderId: string,
  folderTitle = "Shared Academic Folder",
): Promise<DriveFolderInspectionResult> {
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  const embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`;

  const foundItems: DriveResourceItem[] = [];
  const seenIds = new Set<string>();

  try {
    // Attempt scraping the embedded folder view which provides a lightweight HTML list
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (res.ok) {
      const html = await res.text();

      // Extract file entries: patterns like /file/d/{id}/ or ?id={id}
      const fileRegex = /href="[^"]*(?:\/file\/d\/|[?&]id=)([a-zA-Z0-9_-]{15,})[^"]*"[^>]*>(.*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = fileRegex.exec(html)) !== null) {
        const fileId = match[1];
        if (!fileId || seenIds.has(fileId)) continue;
        seenIds.add(fileId);

        // Extract title from inner text or title attribute
        const rawTitle = (match[2] || "").replace(/<[^>]+>/g, "").trim();
        const cleanName = rawTitle || `Study_Document_${foundItems.length + 1}.pdf`;

        foundItems.push({
          driveId: fileId,
          name: cleanName,
          mimeType: cleanName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
          fileSizeBytes: 1024 * 512, // Estimated baseline
          downloadUrl: getDriveDirectDownloadUrl(fileId, "pdf"),
          previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
          docType: "pdf",
        });
      }

      // Also parse JSON data blobs embedded in folder view (e.g. data-id, doc names)
      const dataIdRegex = /data-id="([a-zA-Z0-9_-]{15,})"[^>]*data-name="([^"]+)"/gi;
      while ((match = dataIdRegex.exec(html)) !== null) {
        const fileId = match[1];
        if (!fileId || seenIds.has(fileId)) continue;
        seenIds.add(fileId);

        const cleanName = (match[2] || "").trim() || `Material_${foundItems.length + 1}.pdf`;
        foundItems.push({
          driveId: fileId,
          name: cleanName,
          mimeType: cleanName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
          fileSizeBytes: 1024 * 768,
          downloadUrl: getDriveDirectDownloadUrl(fileId, "pdf"),
          previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
          docType: "pdf",
        });
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, folderId }, "[GoogleDriveService] Embed folder view scraping encountered an issue");
  }

  // Fallback: If no individual items could be parsed from embed view,
  // register the folder bundle as a primary resource so students still get instant 1-click access
  if (foundItems.length === 0) {
    foundItems.push({
      driveId: folderId,
      name: `${folderTitle} (Google Drive Collection)`,
      mimeType: "application/vnd.google-apps.folder",
      fileSizeBytes: 0,
      downloadUrl: folderUrl,
      previewUrl: folderUrl,
      docType: "generic",
    });
  }

  return {
    folderId,
    folderName: folderTitle,
    totalFound: foundItems.length,
    items: foundItems,
  };
}

/**
 * Downloads a file from Google Drive into a Buffer for on-demand R2 caching.
 */
export async function downloadDriveFileBuffer(
  driveId: string,
  docType: "pdf" | "document" | "presentation" | "spreadsheet" | "generic" = "pdf",
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const downloadUrl = getDriveDirectDownloadUrl(driveId, docType);

  const res = await fetch(downloadUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "SkillBridge-Vault-Sync/2.1",
    },
  });

  if (!res.ok) {
    throw new Error(`Google Drive download failed with HTTP status ${res.status}`);
  }

  const dispName = parseFilenameFromDisposition(res.headers.get("content-disposition"));
  const filename = dispName || `drive_file_${driveId}.pdf`;
  const contentType = res.headers.get("content-type") || "application/pdf";

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  return { buffer, contentType, filename };
}
