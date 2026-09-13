import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { getStorageProvider } from "./storage.js";

export interface CleanupResult {
  scanned: number;
  deleted: number;
  errors: string[];
}

/**
 * Sweeps and cleans orphaned or abandoned media objects older than cutoff.
 * Abandoned uploads that remained in 'pending_upload' status past 24 hours
 * are removed from physical storage and marked deleted.
 */
export async function cleanupOrphanedMedia(options?: {
  cutoffHours?: number;
  batchSize?: number;
}): Promise<CleanupResult> {
  const cutoffHours = options?.cutoffHours ?? 24;
  const batchSize = options?.batchSize ?? 50;
  const cutoffDate = new Date(Date.now() - cutoffHours * 60 * 60 * 1000).toISOString();

  const result: CleanupResult = {
    scanned: 0,
    deleted: 0,
    errors: [],
  };

  try {
    // 1. Fetch pending_upload media objects older than cutoff
    const { data: abandonedUploads, error: fetchErr } = await admin
      .from("media_objects")
      .select("id, bucket, object_key, status, created_at")
      .eq("status", "pending_upload")
      .lt("created_at", cutoffDate)
      .limit(batchSize);

    if (fetchErr) {
      logger.warn({ err: fetchErr.message }, "Error querying abandoned media objects");
      result.errors.push(fetchErr.message);
      return result;
    }

    if (!abandonedUploads || abandonedUploads.length === 0) {
      return result;
    }

    result.scanned = abandonedUploads.length;
    const storage = getStorageProvider();

    // Group files by bucket for batch deletion
    const byBucket: Record<string, { ids: string[]; keys: string[] }> = {};
    for (const item of abandonedUploads) {
      if (!byBucket[item.bucket]) {
        byBucket[item.bucket] = { ids: [], keys: [] };
      }
      const entry = byBucket[item.bucket]!;
      entry.ids.push(item.id);
      entry.keys.push(item.object_key);
    }

    for (const [bucket, { ids, keys }] of Object.entries(byBucket)) {
      try {
        await storage.removeFiles(bucket, keys);
      } catch (storageErr) {
        const msg = storageErr instanceof Error ? storageErr.message : String(storageErr);
        logger.warn({ bucket, keys, err: msg }, "Failed deleting objects from storage provider");
        result.errors.push(`Storage deletion failed for bucket ${bucket}: ${msg}`);
      }

      // Update records to 'deleted'
      const { error: updateErr } = await admin
        .from("media_objects")
        .update({ status: "deleted" })
        .in("id", ids);

      if (updateErr) {
        logger.warn({ ids, err: updateErr.message }, "Failed updating media objects status to deleted");
        result.errors.push(`DB update failed for ids: ${updateErr.message}`);
      } else {
        result.deleted += ids.length;
      }
    }

    logger.info(
      { scanned: result.scanned, deleted: result.deleted, errorsCount: result.errors.length },
      "Media cleanup cycle completed"
    );
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errorMsg }, "Unhandled error during media cleanup");
    result.errors.push(errorMsg);
    return result;
  }
}
