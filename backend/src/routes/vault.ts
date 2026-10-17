import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { optimizePdf } from "../services/storageOptimizer.js";
import { multiBucketManager } from "../services/multiBucketStorage.js";
import { registerMediaObject, finalizeMediaObject } from "../services/storage.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

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

    // Try reading from vault_notes table first
    const { data: directNotes, error: directError } = await admin
      .from("vault_notes")
      .select(`
        *,
        uploader:profiles!vault_notes_uploader_id_fkey(id, full_name, username, avatar_url, university, department)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!directError && Array.isArray(directNotes)) {
      let filtered = directNotes as VaultNoteItem[];

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
// 2. POST /api/v1/vault/upload — Upload PDF to Cloudflare R2 with Optimization
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

    // 15 MB hard limit
    if (rawBuffer.byteLength > 15 * 1024 * 1024) {
      return res.status(413).json({ error: "PDF exceeds maximum allowed size of 15 MB" });
    }

    // 1. Run Storage Compression & Deduplication Algorithm
    const optResult = await optimizePdf(rawBuffer);

    let finalPublicUrl = optResult.existingUrl;
    let finalObjectKey = optResult.existingKey;
    let targetBucketName = "skillbridge-media";

    // 2. If not deduplicated, upload optimized buffer to R2 Multi-Bucket pool
    if (!optResult.isDeduplicated || !finalPublicUrl || !finalObjectKey) {
      const sanitizedName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      finalObjectKey = `vault/${req.userId}/${Date.now()}_${crypto.randomUUID()}_${sanitizedName}`;

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
        uploaderId: req.userId,
        entityType: "resource",
        provider: "r2",
        status: "ready",
      });
    }

    // 3. Persist Record to database
    // A) Try inserting into vault_notes table
    const { data: insertedVault, error: vaultInsertError } = await admin
      .from("vault_notes")
      .insert({
        title: body.title,
        description: body.description || null,
        file_url: finalPublicUrl,
        file_key: finalObjectKey,
        file_size_bytes: optResult.optimizedBuffer.length,
        sha256_hash: optResult.sha256,
        uploader_id: req.userId,
        department: body.department || null,
        semester: body.semester || null,
        course_code: body.courseCode || null,
        tags: body.tags,
        visibility: body.visibility,
        community_id: body.communityId || null,
        community_name: body.communityName || null,
        storage_bucket: targetBucketName,
        storage_provider: "r2",
      })
      .select("*")
      .maybeSingle();

    if (!vaultInsertError && insertedVault) {
      logger.info(
        { id: insertedVault.id, title: body.title, deduplicated: optResult.isDeduplicated },
        "[Vault] Note successfully created in vault_notes",
      );
      return res.status(201).json({ note: insertedVault, optimization: { isDeduplicated: optResult.isDeduplicated, savingsRatio: optResult.savingsRatio } });
    }

    // B) Fallback: Store into `resources` table with rich JSON metadata
    const metadataPayload = JSON.stringify({
      description: body.description,
      department: body.department,
      semester: body.semester,
      course_code: body.courseCode,
      tags: body.tags,
      visibility: body.visibility,
      community_id: body.communityId,
      community_name: body.communityName,
      file_size_bytes: optResult.optimizedBuffer.length,
      sha256_hash: optResult.sha256,
      mime_type: "application/pdf",
      downloads_count: 0,
      views_count: 1,
    });

    const { data: insertedRes, error: resInsertError } = await admin
      .from("resources")
      .insert({
        room_id: body.communityId || null,
        uploader_id: req.userId,
        title: body.title,
        description: metadataPayload,
        url: finalPublicUrl,
        storage_path: finalObjectKey,
        kind: "file",
      })
      .select("*")
      .single();

    if (resInsertError) throw resInsertError;

    res.status(201).json({
      note: {
        id: insertedRes.id,
        title: insertedRes.title,
        description: body.description,
        file_url: finalPublicUrl,
        file_key: finalObjectKey,
        file_size_bytes: optResult.optimizedBuffer.length,
        mime_type: "application/pdf",
        uploader_id: req.userId,
        department: body.department || null,
        semester: body.semester || null,
        course_code: body.courseCode || null,
        tags: body.tags,
        visibility: body.visibility,
        community_id: body.communityId || null,
        community_name: body.communityName || null,
        downloads_count: 0,
        views_count: 1,
        created_at: insertedRes.created_at,
        updated_at: insertedRes.created_at,
      },
      optimization: {
        isDeduplicated: optResult.isDeduplicated,
        savingsRatio: optResult.savingsRatio,
      },
    });
  }),
);

// -----------------------------------------------------------------------------
// 3. POST /api/v1/vault/:id/view — Track Note Reading Analytics
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
// 4. DELETE /api/v1/vault/:id — Delete Note
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
