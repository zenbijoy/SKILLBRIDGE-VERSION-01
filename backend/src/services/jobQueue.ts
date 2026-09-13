import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { fetchYouTubeVideoMetadata } from "./youtubeService.js";
import { cleanupOrphanedMedia } from "./mediaCleanupService.js";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "dead_letter";

export interface BackgroundJobRecord {
  id: string;
  job_type: string;
  payload: Record<string, any>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  scheduled_for: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  result: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type JobHandler = (payload: any, job: BackgroundJobRecord) => Promise<any>;

const handlers = new Map<string, JobHandler>();

/**
 * Registers a handler function for a specific job type.
 */
export function registerJobHandler(jobType: string, handler: JobHandler): void {
  handlers.set(jobType, handler);
}

/**
 * Enqueues a job into the background_jobs table.
 * Schedules non-blocking immediate opportunistic batch execution.
 */
export async function enqueueJob(
  jobType: string,
  payload: Record<string, any> = {},
  options?: {
    priority?: number;
    maxAttempts?: number;
    scheduledFor?: Date;
  }
): Promise<string | null> {
  try {
    const scheduledFor = options?.scheduledFor
      ? options.scheduledFor.toISOString()
      : new Date().toISOString();

    const { data, error } = await admin
      .from("background_jobs")
      .insert({
        job_type: jobType,
        payload,
        priority: options?.priority ?? 0,
        max_attempts: options?.maxAttempts ?? 5,
        scheduled_for: scheduledFor,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      logger.warn({ err: error.message, jobType }, "Failed enqueuing background job to DB");
      return null;
    }

    const jobId = data?.id;
    logger.debug({ jobId, jobType }, "Enqueued background job");

    // Opportunistic processing trigger (free-tier friendly: non-blocking, zero continuous polling loop)
    setImmediate(() => {
      processBatch(3).catch((err) => {
        logger.debug({ err: err instanceof Error ? err.message : String(err) }, "Opportunistic job processing skipped");
      });
    });

    return jobId;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), jobType }, "Exception enqueuing job");
    return null;
  }
}

/**
 * Processes a batch of pending jobs.
 * Supports exponential backoff and dead-letter queue classification.
 */
export async function processBatch(limit: number = 5): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const stats = { processed: 0, succeeded: 0, failed: 0 };
  const workerId = `worker-${process.pid}-${Date.now()}`;
  const now = new Date().toISOString();

  try {
    // 1. Query pending jobs that are due
    const { data: candidates, error: fetchErr } = await admin
      .from("background_jobs")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("priority", { ascending: false })
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (fetchErr) {
      logger.warn({ err: fetchErr.message }, "Error fetching pending background jobs");
      return stats;
    }

    if (!candidates || candidates.length === 0) {
      return stats;
    }

    for (const job of candidates as BackgroundJobRecord[]) {
      // 2. Optimistic locking: mark running
      const { data: locked, error: lockErr } = await admin
        .from("background_jobs")
        .update({
          status: "running",
          locked_at: now,
          locked_by: workerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "pending")
        .select()
        .single();

      if (lockErr || !locked) {
        // Job was claimed by another concurrent process
        continue;
      }

      stats.processed++;
      const handler = handlers.get(job.job_type);

      if (!handler) {
        // No handler registered: fail directly
        await admin
          .from("background_jobs")
          .update({
            status: "failed",
            last_error: `No handler registered for job type: ${job.job_type}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        stats.failed++;
        continue;
      }

      try {
        const result = await handler(job.payload, job);

        await admin
          .from("background_jobs")
          .update({
            status: "completed",
            result: result || {},
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        stats.succeeded++;
      } catch (handlerErr) {
        stats.failed++;
        const errMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
        const newAttempts = job.attempts + 1;

        if (newAttempts >= job.max_attempts) {
          // Exceeded max attempts: move to dead_letter
          await admin
            .from("background_jobs")
            .update({
              status: "dead_letter",
              attempts: newAttempts,
              last_error: errMsg,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          logger.error(
            { jobId: job.id, jobType: job.job_type, attempts: newAttempts, err: errMsg },
            "Background job permanently failed (moved to dead_letter)"
          );
        } else {
          // Exponential backoff retry: 30s * 2^attempts
          const backoffSeconds = Math.min(30 * Math.pow(2, newAttempts), 3600); // capped at 1h
          const nextScheduled = new Date(Date.now() + backoffSeconds * 1000).toISOString();

          await admin
            .from("background_jobs")
            .update({
              status: "pending",
              attempts: newAttempts,
              scheduled_for: nextScheduled,
              last_error: errMsg,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          logger.warn(
            { jobId: job.id, jobType: job.job_type, nextScheduled, attempts: newAttempts, err: errMsg },
            "Background job failed; scheduled retry with exponential backoff"
          );
        }
      }
    }
  } catch (outerErr) {
    logger.warn({ err: outerErr instanceof Error ? outerErr.message : String(outerErr) }, "Error in background job batch processing");
  }

  return stats;
}

// -----------------------------------------------------------------------------
// Register Default Job Handlers
// -----------------------------------------------------------------------------

registerJobHandler("YOUTUBE_METADATA_SYNC", async (payload: {
  recordingId: string;
  videoId: string;
  accessToken?: string;
}) => {
  const { recordingId, videoId, accessToken } = payload;
  if (!recordingId || !videoId) {
    throw new Error("Invalid payload: recordingId and videoId are required");
  }

  const meta = await fetchYouTubeVideoMetadata(videoId, accessToken);

  const updateFields: Record<string, any> = {
    title: meta.title,
    thumbnail_url: meta.thumbnailUrl,
    last_synced_at: new Date().toISOString(),
    status: "ready",
    provider_metadata: meta,
  };

  if (meta.durationSeconds) updateFields.duration_seconds = meta.durationSeconds;
  if (meta.channelId) updateFields.youtube_channel_id = meta.channelId;
  if (meta.publishedAt) updateFields.published_at = meta.publishedAt;
  if (meta.privacyStatus) updateFields.privacy_status = meta.privacyStatus;
  if (meta.description) updateFields.description = meta.description;

  const { error } = await admin
    .from("room_recordings")
    .update(updateFields)
    .eq("id", recordingId);

  if (error) {
    throw new Error(`Failed updating room_recording: ${error.message}`);
  }

  return { recordingId, videoId, syncedTitle: meta.title };
});

registerJobHandler("MEDIA_CLEANUP", async (payload: { cutoffHours?: number; batchSize?: number }) => {
  return await cleanupOrphanedMedia(payload);
});
