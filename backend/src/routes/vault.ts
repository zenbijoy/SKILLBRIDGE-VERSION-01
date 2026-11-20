import express, { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { optimizePdf } from "../services/storageOptimizer.js";
import { multiBucketManager } from "../services/multiBucketStorage.js";
import { registerMediaObject } from "../services/storage.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { Readable } from "node:stream";
import { parseGoogleDriveUrl, getDriveDirectDownloadUrl } from "../services/googleDriveService.js";
import { executeDriveImportJob, cacheDriveNoteToR2 } from "../services/driveVaultWorker.js";

export const vault = Router();

export interface VaultNoteItem {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_key: string;
  file_size_bytes: number;
  mime_type: string;
  uploader_id: string;
  uploader?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
    university?: string;
    department?: string;
  };
  department: string | null;
  semester: string | null;
  course_code: string | null;
  tags: string[];
  visibility: "public" | "community" | "private";
  community_id: string | null;
  community_name: string | null;
  downloads_count: number;
  views_count: number;
  source_type?: "direct_upload" | "google_drive";
  source_drive_id?: string | null;
  source_drive_url?: string | null;
  sync_status?: "ready" | "cataloged" | "caching" | "synced" | "failed";
  r2_cached_at?: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// 1. GET /api/v1/vault — List / Search / Filter Notes
// -----------------------------------------------------------------------------
vault.get(
  "/",
  wrap(async (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    const department = String(req.query.department || "").trim();
    const semester = String(req.query.semester || "").trim();
    const visibility = String(req.query.visibility || "all").trim();
    const communityId = String(req.query.community_id || "").trim();
    const limit = Math.min(Number(req.query.limit) || 40, 100);

    // Try reading from vault_notes table first without fragile PostgREST FK syntax
    const { data: directNotes, error: directError } = await admin
      .from("vault_notes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!directError && Array.isArray(directNotes)) {
      // Robust batch population of uploader profiles
      const uploaderIds = Array.from(
        new Set(directNotes.map((n: any) => n.uploader_id).filter(Boolean)),
      );
      let profileMap = new Map<string, any>();
      if (uploaderIds.length > 0) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, full_name, username, avatar_url, university, department")
          .in("id", uploaderIds);
        if (profiles) {
          profileMap = new Map(profiles.map((p) => [p.id, p]));
        }
      }

      let filtered: VaultNoteItem[] = directNotes.map((n: any) => ({
        ...n,
        uploader: profileMap.get(n.uploader_id) || null,
      }));

      if (q) {
        filtered = filtered.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.description?.toLowerCase().includes(q) ||
            n.course_code?.toLowerCase().includes(q) ||
            n.department?.toLowerCase().includes(q) ||
            (n.tags || []).some((t) => t.toLowerCase().includes(q)),
        );
      }

      if (department && department !== "All") {
        filtered = filtered.filter((n) => n.department?.toLowerCase() === department.toLowerCase());
      }

      if (semester && semester !== "All") {
        filtered = filtered.filter((n) => n.semester === semester);
      }

      if (visibility === "community") {
        filtered = filtered.filter((n) => n.visibility === "community");
      } else if (visibility === "public") {
        filtered = filtered.filter((n) => n.visibility === "public");
      }

      if (communityId) {
        filtered = filtered.filter((n) => n.community_id === communityId);
      }

      return res.json({ notes: filtered });
    }

    // Resilient Fallback to `resources` table if custom table is awaiting migration
    const { data: rawResources, error: resError } = await admin
      .from("resources")
      .select(`
        *,
        uploader:profiles!resources_uploader_id_fkey(id, full_name, username, avatar_url, university, department)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (resError) throw resError;

    const notes: VaultNoteItem[] = (rawResources || []).map((r: any) => {
      let meta: any = {};
      try {
        if (r.description && r.description.startsWith("{")) {
          meta = JSON.parse(r.description);
        }
      } catch {}

      return {
        id: r.id,
        title: r.title,
        description: meta.description || (r.description?.startsWith("{") ? "" : r.description) || null,
        file_url: r.url,
        file_key: r.storage_path || r.url,
        file_size_bytes: meta.file_size_bytes || 0,
        mime_type: meta.mime_type || "application/pdf",
        uploader_id: r.uploader_id,
        uploader: r.uploader,
        department: meta.department || null,
        semester: meta.semester || null,
        course_code: meta.course_code || null,
        tags: meta.tags || ["Academic", "PDF"],
        visibility: meta.visibility || (r.room_id ? "community" : "public"),
        community_id: r.room_id || meta.community_id || null,
        community_name: meta.community_name || null,
        downloads_count: meta.downloads_count || 0,
        views_count: meta.views_count || 1,
        source_type: meta.source_type || (r.storage_path?.startsWith("drive/") ? "google_drive" : "direct_upload"),
        source_drive_id: meta.source_drive_id || null,
        source_drive_url: meta.source_drive_url || null,
        sync_status: meta.sync_status || "ready",
        r2_cached_at: meta.r2_cached_at || null,
        created_at: r.created_at,
        updated_at: r.created_at,
      };
    });

    let result = notes;
    if (q) {
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.description?.toLowerCase().includes(q) ||
          n.course_code?.toLowerCase().includes(q) ||
          n.department?.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (department && department !== "All") {
      result = result.filter((n) => n.department?.toLowerCase() === department.toLowerCase());
    }
    if (semester && semester !== "All") {
      result = result.filter((n) => n.semester === semester);
    }
    if (visibility === "community") {
      result = result.filter((n) => n.visibility === "community");
    } else if (visibility === "public") {
      result = result.filter((n) => n.visibility === "public");
    }

    res.json({ notes: result });
  }),
);

// -----------------------------------------------------------------------------
// Helper to process & upload PDF buffer to R2 + Database
// -----------------------------------------------------------------------------
async function processAndSaveVaultPdf(params: {
  userId: string;
  rawBuffer: Buffer;
  fileName: string;
  title: string;
  description?: string;
  department?: string;
  semester?: string;
  courseCode?: string;
  tags?: string[];
  visibility?: "public" | "community" | "private";
  communityId?: string | null;
  communityName?: string | null;
}) {
  const {
    userId,
    rawBuffer,
    fileName,
    title,
    description = "",
    department,
    semester,
    courseCode,
    tags = [],
    visibility = "public",
    communityId,
    communityName,
  } = params;

  // 1. Run Storage Compression & Deduplication Algorithm (handles up to 250MB)
  const optResult = await optimizePdf(rawBuffer);

  let finalPublicUrl = optResult.existingUrl;
  let finalObjectKey = optResult.existingKey;
  let targetBucketName = "skillbridge-media";

  // 2. If not deduplicated, upload optimized buffer to R2 Multi-Bucket pool
  if (!optResult.isDeduplicated || !finalPublicUrl || !finalObjectKey) {
    const sanitizedName = (fileName || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    finalObjectKey = `vault/${userId}/${Date.now()}_${crypto.randomUUID()}_${sanitizedName}`;

    const uploadResult = await multiBucketManager.uploadToPool({
      buffer: optResult.optimizedBuffer,
      contentType: "application/pdf",
      objectKey: finalObjectKey,
    });

    finalPublicUrl = uploadResult.publicUrl;
    targetBucketName = uploadResult.bucketName;

    // Register in media_objects table
    await registerMediaObject({
      bucket: targetBucketName,
      objectKey: finalObjectKey,
      mimeType: "application/pdf",
      fileSizeBytes: optResult.optimizedBuffer.length,
      uploaderId: userId,
      entityType: "resource",
      provider: "r2",
      status: "ready",
    });
  }

  // 3. Persist Record to database
  const { data: insertedVault, error: vaultInsertError } = await admin
    .from("vault_notes")
    .insert({
      title,
      description: description || null,
      file_url: finalPublicUrl,
      file_key: finalObjectKey,
      file_size_bytes: optResult.optimizedBuffer.length,
      sha256_hash: optResult.sha256,
      uploader_id: userId,
      department: department || null,
      semester: semester || null,
      course_code: courseCode || null,
      tags,
      visibility,
      community_id: communityId || null,
      community_name: communityName || null,
      storage_bucket: targetBucketName,
      storage_provider: "r2",
    })
    .select("*")
    .maybeSingle();

  if (!vaultInsertError && insertedVault) {
    // Fetch uploader info for immediate response
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, username, avatar_url, university, department")
      .eq("id", userId)
      .maybeSingle();

    const note = {
      ...insertedVault,
      uploader: profile || null,
    };

    logger.info(
      { id: insertedVault.id, title, deduplicated: optResult.isDeduplicated },
      "[Vault] Note successfully created in vault_notes",
    );
    return {
      note,
      optimization: {
        isDeduplicated: optResult.isDeduplicated,
        savingsRatio: optResult.savingsRatio,
        savedPercent: optResult.savedPercent,
        originalBytes: optResult.originalBytes,
        finalBytes: optResult.finalBytes,
        compressedImagesCount: optResult.compressedImagesCount || 0,
      },
    };
  }

  // Fallback: Store into `resources` table with rich JSON metadata
  const metadataPayload = JSON.stringify({
    description,
    department,
    semester,
    course_code: courseCode,
    tags,
    visibility,
    community_id: communityId,
    community_name: communityName,
    file_size_bytes: optResult.optimizedBuffer.length,
    sha256_hash: optResult.sha256,
    mime_type: "application/pdf",
    downloads_count: 0,
    views_count: 1,
  });

  const { data: insertedRes, error: resInsertError } = await admin
    .from("resources")
    .insert({
      room_id: communityId || null,
      uploader_id: userId,
      title,
      description: metadataPayload,
      url: finalPublicUrl,
      storage_path: finalObjectKey,
      kind: "file",
    })
    .select("*")
    .single();

  if (resInsertError) throw resInsertError;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, username, avatar_url, university, department")
    .eq("id", userId)
    .maybeSingle();

  return {
    note: {
      id: insertedRes.id,
      title: insertedRes.title,
      description,
      file_url: finalPublicUrl,
      file_key: finalObjectKey,
      file_size_bytes: optResult.optimizedBuffer.length,
      mime_type: "application/pdf",
      uploader_id: userId,
      uploader: profile || null,
      department: department || null,
      semester: semester || null,
      course_code: courseCode || null,
      tags,
      visibility,
      community_id: communityId || null,
      community_name: communityName || null,
      downloads_count: 0,
      views_count: 1,
      created_at: insertedRes.created_at,
      updated_at: insertedRes.created_at,
    },
    optimization: {
      isDeduplicated: optResult.isDeduplicated,
      savingsRatio: optResult.savingsRatio,
      savedPercent: optResult.savedPercent,
      originalBytes: optResult.originalBytes,
      finalBytes: optResult.finalBytes,
      compressedImagesCount: optResult.compressedImagesCount || 0,
    },
  };
}

// -----------------------------------------------------------------------------
// 2. POST /api/v1/vault/upload — Upload PDF (JSON/Base64 for up to 75 MB)
// -----------------------------------------------------------------------------
vault.post(
  "/upload",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const body = z
      .object({
        title: z.string().trim().min(2).max(180),
        description: z.string().trim().max(1000).optional().default(""),
        fileBase64: z.string().min(20),
        fileName: z.string().trim().max(160).optional().default("document.pdf"),
        department: z.string().trim().max(80).optional(),
        semester: z.string().trim().max(40).optional(),
        courseCode: z.string().trim().max(40).optional(),
        tags: z.array(z.string().trim().max(40)).max(10).optional().default([]),
        visibility: z.enum(["public", "community", "private"]).default("public"),
        communityId: z.string().uuid().optional().nullable(),
        communityName: z.string().trim().max(120).optional().nullable(),
      })
      .parse(req.body);

    const cleanBase64 = body.fileBase64.replace(/^data:application\/pdf;base64,/, "");
    const rawBuffer = Buffer.from(cleanBase64, "base64");

    // 75 MB limit for JSON base64
    if (rawBuffer.byteLength > 75 * 1024 * 1024) {
      return res.status(413).json({
        error: "PDF exceeds 75 MB for base64 upload. Please use direct raw stream upload for files up to 250 MB.",
      });
    }

    const result = await processAndSaveVaultPdf({
      userId: req.userId,
      rawBuffer,
      fileName: body.fileName,
      title: body.title,
      description: body.description,
      department: body.department,
      semester: body.semester,
      courseCode: body.courseCode,
      tags: body.tags,
      visibility: body.visibility,
      communityId: body.communityId,
      communityName: body.communityName,
    });

    res.status(201).json(result);
  }),
);

// -----------------------------------------------------------------------------
// 3. POST /api/v1/vault/upload-raw — Direct Binary Stream Upload (up to 250 MB)
// -----------------------------------------------------------------------------
vault.post(
  "/upload-raw",
  express.raw({ limit: "250mb", type: ["application/pdf", "application/octet-stream", "*/*"] }),
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const rawBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    if (!rawBuffer || rawBuffer.byteLength === 0) {
      return res.status(400).json({ error: "Empty PDF payload received" });
    }

    if (rawBuffer.byteLength > 250 * 1024 * 1024) {
      return res.status(413).json({ error: "PDF exceeds maximum allowed size of 250 MB" });
    }

    const decodeHeader = (val: any) => {
      if (!val) return "";
      try {
        return decodeURIComponent(String(val));
      } catch {
        return String(val);
      }
    };

    const title = decodeHeader(req.headers["x-vault-title"]).trim() || "Academic Note PDF";
    const description = decodeHeader(req.headers["x-vault-description"]).trim();
    const department = decodeHeader(req.headers["x-vault-department"]).trim() || "General";
    const semester = decodeHeader(req.headers["x-vault-semester"]).trim() || "1st";
    const courseCode = decodeHeader(req.headers["x-vault-course-code"]).trim() || undefined;
    const rawTags = decodeHeader(req.headers["x-vault-tags"]).trim();
    const tags = rawTags
      ? rawTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : ["PDF", "Vault"];
    const visibilityRaw = decodeHeader(req.headers["x-vault-visibility"]).trim();
    const visibility = (["public", "community", "private"].includes(visibilityRaw)
      ? visibilityRaw
      : "public") as "public" | "community" | "private";
    const fileName = decodeHeader(req.headers["x-vault-filename"]).trim() || "document.pdf";
    const communityName = decodeHeader(req.headers["x-vault-community-name"]).trim() || undefined;
    const communityId = (req.headers["x-vault-community-id"] as string) || undefined;

    const result = await processAndSaveVaultPdf({
      userId: req.userId,
      rawBuffer,
      fileName,
      title,
      description,
      department,
      semester,
      courseCode,
      tags,
      visibility,
      communityId,
      communityName,
    });

    res.status(201).json(result);
  }),
);

// -----------------------------------------------------------------------------
// 4. GET /api/v1/vault/:id — Retrieve Single Vault Note
// -----------------------------------------------------------------------------
vault.get(
  "/:id",
  wrap(async (req, res) => {
    const { id } = req.params;

    // Check vault_notes table
    const { data: note, error } = await admin
      .from("vault_notes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!error && note) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, full_name, username, avatar_url, university, department")
        .eq("id", note.uploader_id)
        .maybeSingle();

      return res.json({ note: { ...note, uploader: profile || null } });
    }

    // Fallback to resources table
    const { data: resNote } = await admin
      .from("resources")
      .select(`
        *,
        uploader:profiles!resources_uploader_id_fkey(id, full_name, username, avatar_url, university, department)
      `)
      .eq("id", id)
      .maybeSingle();

    if (resNote) {
      let meta: any = {};
      try {
        if (resNote.description && resNote.description.startsWith("{")) {
          meta = JSON.parse(resNote.description);
        }
      } catch {}

      return res.json({
        note: {
          id: resNote.id,
          title: resNote.title,
          description: meta.description || resNote.description,
          file_url: resNote.url,
          file_key: resNote.storage_path,
          file_size_bytes: meta.file_size_bytes || 0,
          mime_type: meta.mime_type || "application/pdf",
          uploader_id: resNote.uploader_id,
          uploader: resNote.uploader,
          department: meta.department || null,
          semester: meta.semester || null,
          course_code: meta.course_code || null,
          tags: meta.tags || ["PDF"],
          visibility: meta.visibility || "public",
          downloads_count: meta.downloads_count || 0,
          views_count: meta.views_count || 1,
          created_at: resNote.created_at,
          updated_at: resNote.created_at,
        },
      });
    }

    res.status(404).json({ error: "Note not found in vault" });
  }),
);

// -----------------------------------------------------------------------------
// 5. POST /api/v1/vault/:id/view — Track Note Reading Analytics
// -----------------------------------------------------------------------------
vault.post(
  "/:id/view",
  wrap(async (req, res) => {
    const { id } = req.params;

    // Try updating vault_notes view count
    const { data: vNote } = await admin.from("vault_notes").select("views_count").eq("id", id).maybeSingle();
    if (vNote) {
      await admin
        .from("vault_notes")
        .update({ views_count: (vNote.views_count || 0) + 1 })
        .eq("id", id);
      return res.json({ success: true, views_count: (vNote.views_count || 0) + 1 });
    }

    res.json({ success: true });
  }),
);

// -----------------------------------------------------------------------------
// 6. DELETE /api/v1/vault/:id — Delete Note
// -----------------------------------------------------------------------------
vault.delete(
  "/:id",
  wrap(async (req, res) => {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    // Check ownership in vault_notes
    const { data: vNote } = await admin.from("vault_notes").select("id, uploader_id").eq("id", id).maybeSingle();
    if (vNote) {
      if (vNote.uploader_id !== req.userId) {
        return res.status(403).json({ error: "Not authorized to delete this note" });
      }
      await admin.from("vault_notes").delete().eq("id", id);
      return res.json({ success: true });
    }

    // Check ownership in resources
    const { data: rNote } = await admin.from("resources").select("id, uploader_id").eq("id", id).maybeSingle();
    if (rNote) {
      if (rNote.uploader_id !== req.userId) {
        return res.status(403).json({ error: "Not authorized to delete this note" });
      }
      await admin.from("resources").delete().eq("id", id);
      return res.json({ success: true });
    }

    res.status(404).json({ error: "Note not found" });
  }),
);

// -----------------------------------------------------------------------------
// 7. POST /api/v1/vault/drive/import — Automated Background Drive Ingestion on VPS
// -----------------------------------------------------------------------------
vault.post(
  "/drive/import",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const body = z
      .object({
        driveUrl: z.string().trim().min(5),
        title: z.string().trim().max(180).optional(),
        department: z.string().trim().max(80).optional(),
        semester: z.string().trim().max(40).optional(),
        courseCode: z.string().trim().max(40).optional(),
        tags: z.array(z.string().trim().max(40)).max(10).optional().default([]),
        visibility: z.enum(["public", "community", "private"]).default("public"),
      })
      .parse(req.body);

    const parsed = parseGoogleDriveUrl(body.driveUrl);
    if (!parsed.isValid) {
      return res.status(400).json({
        error: "Invalid Google Drive URL. Please provide a valid Google Drive folder or file share link.",
      });
    }

    // Try inserting into vault_sync_jobs
    let jobId = crypto.randomUUID();
    const { data: job, error: jobErr } = await admin
      .from("vault_sync_jobs")
      .insert({
        id: jobId,
        user_id: req.userId,
        drive_url: parsed.normalizedUrl,
        drive_id: parsed.driveId,
        drive_type: parsed.type,
        status: "pending",
        department: body.department || null,
        semester: body.semester || null,
        course_code: body.courseCode || null,
        tags: body.tags,
        visibility: body.visibility,
      })
      .select("*")
      .maybeSingle();

    if (!jobErr && job) {
      jobId = job.id;
    }

    // Dispatch background execution task on VPS without blocking response
    setImmediate(() => {
      void executeDriveImportJob(jobId);
    });

    res.status(202).json({
      success: true,
      jobId,
      status: "pending",
      driveType: parsed.type,
      driveId: parsed.driveId,
      message: "Google Drive automatic ingestion task scheduled on VPS",
    });
  }),
);

// -----------------------------------------------------------------------------
// 8. GET /api/v1/vault/drive/jobs/:id — Inspect VPS Background Sync Job Status
// -----------------------------------------------------------------------------
vault.get(
  "/drive/jobs/:id",
  wrap(async (req, res) => {
    const { id } = req.params;

    const { data: job, error } = await admin
      .from("vault_sync_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !job) {
      return res.status(404).json({ error: "Sync job not found" });
    }

    res.json({ job });
  }),
);

// -----------------------------------------------------------------------------
// 9. GET /api/v1/vault/drive/stream/:id — On-Demand Stream from Drive with Background R2 Caching
// -----------------------------------------------------------------------------
vault.get(
  "/drive/stream/:id",
  wrap(async (req, res) => {
    const { id } = req.params;

    // Look up note in vault_notes
    const { data: vNote } = await admin
      .from("vault_notes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    let note = vNote;

    // Fallback to resources table
    if (!note) {
      const { data: rNote } = await admin
        .from("resources")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (rNote) {
        let meta: any = {};
        try {
          if (rNote.description && rNote.description.startsWith("{")) {
            meta = JSON.parse(rNote.description);
          }
        } catch {}

        note = {
          id: rNote.id,
          title: rNote.title,
          file_url: rNote.url,
          file_key: rNote.storage_path,
          source_type: meta.source_type || (rNote.storage_path?.startsWith("drive/") ? "google_drive" : "direct_upload"),
          source_drive_id: meta.source_drive_id || (rNote.storage_path?.startsWith("drive/") ? rNote.storage_path.split("/").pop() : null),
          sync_status: meta.sync_status || "ready",
          storage_provider: rNote.storage_path?.startsWith("vault/") ? "r2" : "google_drive",
        } as any;
      }
    }

    if (!note) {
      return res.status(404).json({ error: "Resource not found in vault" });
    }

    // A) If already cached in Cloudflare R2, serve or redirect to R2 CDN directly
    if (note.storage_provider === "r2" && note.file_url && !note.file_url.includes("drive.google.com")) {
      return res.redirect(note.file_url);
    }

    // B) If it's a Drive resource, resolve drive ID and trigger on-demand background caching
    const driveId =
      note.source_drive_id ||
      (note.file_key?.startsWith("drive/") ? note.file_key.split("/").pop() : null);

    if (!driveId) {
      return res.redirect(note.file_url);
    }

    // Trigger asynchronous background caching into R2
    setImmediate(() => {
      void cacheDriveNoteToR2(note.id);
    });

    // Formulate direct streaming URL
    const downloadUrl = getDriveDirectDownloadUrl(driveId, "pdf");

    try {
      const driveRes = await fetch(downloadUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "SkillBridge-Vault-Sync/2.1",
        },
      });

      if (driveRes.ok && driveRes.body) {
        const ct = driveRes.headers.get("content-type") || "application/pdf";
        const cl = driveRes.headers.get("content-length");

        res.setHeader("Content-Type", ct);
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(note.title.replace(/[^a-zA-Z0-9._-]/g, "_"))}.pdf"`,
        );
        if (cl) res.setHeader("Content-Length", cl);

        return Readable.fromWeb(driveRes.body as any).pipe(res);
      }
    } catch (streamErr) {
      logger.warn(
        { id, err: (streamErr as Error).message },
        "[Vault] Direct pipe encountered issue, falling back to direct URL redirect",
      );
    }

    // Resilient fallback redirect to Drive download URL
    return res.redirect(downloadUrl);
  }),
);

// -----------------------------------------------------------------------------
// 10. POST /api/v1/vault/drive/cache/:id — Explicit On-Demand Cache to R2
// -----------------------------------------------------------------------------
vault.post(
  "/drive/cache/:id",
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const result = await cacheDriveNoteToR2(id);
    res.json(result);
  }),
);
