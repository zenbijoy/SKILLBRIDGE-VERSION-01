import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { multiBucketManager } from "./multiBucketStorage.js";
import { registerMediaObject } from "./storage.js";
import { optimizePdf } from "./storageOptimizer.js";
import {
  crawlGoogleDriveFolder,
  downloadDriveFileBuffer,
  fetchDriveFileMetadata,
  parseGoogleDriveUrl,
  type DriveResourceItem,
} from "./googleDriveService.js";

/**
 * Executes the asynchronous Google Drive crawl and indexing job on the VPS.
 */
export async function executeDriveImportJob(jobId: string): Promise<void> {
  logger.info({ jobId }, "[DriveVaultWorker] Starting background import task on VPS");

  // 1. Fetch job details
  const { data: job, error: jobErr } = await admin
    .from("vault_sync_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !job) {
    logger.error({ jobId, err: jobErr?.message }, "[DriveVaultWorker] Job not found or DB error");
    return;
  }

  try {
    // Update status to processing
    await admin
      .from("vault_sync_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    const parsed = parseGoogleDriveUrl(job.drive_url);
    if (!parsed.isValid) {
      throw new Error("Invalid or unparseable Google Drive link provided.");
    }

    let itemsToCatalog: DriveResourceItem[] = [];

    if (parsed.type === "folder") {
      const crawlResult = await crawlGoogleDriveFolder(parsed.driveId, job.course_code || "Shared Academic Folder");
      itemsToCatalog = crawlResult.items;
    } else {
      const fileMeta = await fetchDriveFileMetadata(parsed.driveId, parsed.docType, job.course_code || "Academic Document");
      itemsToCatalog = [fileMeta];
    }

    // 2. Persist Full Manifest to Cloudflare R2
    let manifestR2Key: string | null = null;
    let manifestR2Url: string | null = null;

    try {
      const manifestBuffer = Buffer.from(
        JSON.stringify(
          {
            jobId,
            driveUrl: job.drive_url,
            driveId: parsed.driveId,
            driveType: parsed.type,
            catalogedCount: itemsToCatalog.length,
            scannedAt: new Date().toISOString(),
            resources: itemsToCatalog,
          },
          null,
          2,
        ),
        "utf-8",
      );

      manifestR2Key = `vault/manifests/${job.user_id}/${Date.now()}_${jobId}.json`;
      const uploadRes = await multiBucketManager.uploadToPool({
        buffer: manifestBuffer,
        contentType: "application/json",
        objectKey: manifestR2Key,
      });

      manifestR2Url = uploadRes.publicUrl;
    } catch (r2Err) {
      logger.warn({ err: (r2Err as Error).message }, "[DriveVaultWorker] Could not archive manifest to R2, continuing DB insert");
    }

    // 3. Insert cataloged resources into vault_notes (with fallback to resources)
    let processedCount = 0;

    for (const item of itemsToCatalog) {
      const title = item.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");

      // Try inserting into vault_notes
      const { error: vaultErr } = await admin.from("vault_notes").insert({
        title,
        description: `Imported from Google Drive (${job.drive_url}). Cached on-demand to Cloudflare R2.`,
        file_url: item.downloadUrl,
        file_key: `drive/${parsed.driveId}/${item.driveId}`,
        file_size_bytes: item.fileSizeBytes || 0,
        mime_type: item.mimeType || "application/pdf",
        uploader_id: job.user_id,
        department: job.department || null,
        semester: job.semester || null,
        course_code: job.course_code || null,
        tags: Array.from(new Set([...(job.tags || []), "GoogleDrive", "Academic"])),
        visibility: job.visibility || "public",
        storage_bucket: "google_drive",
        storage_provider: "google_drive",
        source_type: "google_drive",
        source_drive_id: item.driveId,
        source_drive_url: item.downloadUrl,
        sync_status: "cataloged",
        drive_parent_folder_id: parsed.type === "folder" ? parsed.driveId : null,
      });

      if (vaultErr) {
        // Fallback: insert into resources table
        const metadataPayload = JSON.stringify({
          source_type: "google_drive",
          source_drive_id: item.driveId,
          source_drive_url: item.downloadUrl,
          sync_status: "cataloged",
          department: job.department,
          semester: job.semester,
          course_code: job.course_code,
          tags: ["GoogleDrive", "Academic"],
          file_size_bytes: item.fileSizeBytes || 0,
          mime_type: item.mimeType || "application/pdf",
        });

        await admin.from("resources").insert({
          uploader_id: job.user_id,
          title,
          description: metadataPayload,
          url: item.downloadUrl,
          storage_path: `drive/${parsed.driveId}/${item.driveId}`,
          kind: "file",
        });
      }

      processedCount++;
    }

    // 4. Mark Job Completed
    await admin
      .from("vault_sync_jobs")
      .update({
        status: "completed",
        total_files: itemsToCatalog.length,
        processed_files: processedCount,
        manifest_r2_key: manifestR2Key,
        manifest_r2_url: manifestR2Url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    logger.info(
      { jobId, total: itemsToCatalog.length, processed: processedCount },
      "[DriveVaultWorker] Successfully completed Google Drive ingestion task on VPS",
    );
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, "[DriveVaultWorker] Background job failed");
    await admin
      .from("vault_sync_jobs")
      .update({
        status: "failed",
        error_message: err.message || "Failed to crawl Google Drive resources.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

/**
 * On-demand background cache: transfers a Google Drive resource into Cloudflare R2.
 */
export async function cacheDriveNoteToR2(noteId: string): Promise<{
  success: boolean;
  r2Url?: string;
  isCached: boolean;
}> {
  // Check if note exists in vault_notes
  const { data: note } = await admin
    .from("vault_notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();

  if (note && note.sync_status === "synced" && note.storage_provider === "r2") {
    return { success: true, r2Url: note.file_url, isCached: true };
  }

  const driveId = note?.source_drive_id || (note?.file_key?.startsWith("drive/") ? note.file_key.split("/").pop() : null);
  if (!driveId) {
    return { success: false, isCached: false };
  }

  try {
    // 1. Mark as caching
    if (note) {
      await admin.from("vault_notes").update({ sync_status: "caching" }).eq("id", noteId);
    }

    // 2. Download from Google Drive
    const { buffer, contentType, filename } = await downloadDriveFileBuffer(driveId, "pdf");

    // 3. Storage Optimization & Deduplication
    const optResult = await optimizePdf(buffer);

    let finalPublicUrl = optResult.existingUrl;
    let finalObjectKey = optResult.existingKey;
    let targetBucketName = "skillbridge-media";

    if (!optResult.isDeduplicated || !finalPublicUrl || !finalObjectKey) {
      const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      finalObjectKey = `vault/drive_cached/${note?.uploader_id || "system"}/${Date.now()}_${crypto.randomUUID()}_${sanitizedName}`;

      const uploadResult = await multiBucketManager.uploadToPool({
        buffer: optResult.optimizedBuffer,
        contentType: contentType || "application/pdf",
        objectKey: finalObjectKey,
      });

      finalPublicUrl = uploadResult.publicUrl;
      targetBucketName = uploadResult.bucketName;

      await registerMediaObject({
        bucket: targetBucketName,
        objectKey: finalObjectKey,
        mimeType: contentType || "application/pdf",
        fileSizeBytes: optResult.optimizedBuffer.length,
        uploaderId: note?.uploader_id || "00000000-0000-0000-0000-000000000000",
        entityType: "resource",
        provider: "r2",
        status: "ready",
      });
    }

    // 4. Update Note Record
    if (note) {
      await admin
        .from("vault_notes")
        .update({
          file_url: finalPublicUrl,
          file_key: finalObjectKey,
          file_size_bytes: optResult.optimizedBuffer.length,
          sha256_hash: optResult.sha256,
          storage_bucket: targetBucketName,
          storage_provider: "r2",
          sync_status: "synced",
          r2_cached_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", noteId);
    } else {
      // Update resources table fallback
      await admin
        .from("resources")
        .update({
          url: finalPublicUrl,
          storage_path: finalObjectKey,
        })
        .eq("id", noteId);
    }

    logger.info({ noteId, finalPublicUrl }, "[DriveVaultWorker] Successfully cached Drive note into Cloudflare R2");
    return { success: true, r2Url: finalPublicUrl, isCached: true };
  } catch (err) {
    logger.error({ noteId, err: (err as Error).message }, "[DriveVaultWorker] Failed to cache Drive note to R2");
    if (note) {
      await admin.from("vault_notes").update({ sync_status: "failed" }).eq("id", noteId);
    }
    return { success: false, isCached: false };
  }
}
