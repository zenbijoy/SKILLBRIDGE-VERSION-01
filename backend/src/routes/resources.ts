import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import {
  signedUpload,
  registerMediaObject,
  finalizeMediaObject,
  getStorageStatus,
  getStorageProvider,
  resolveMediaObjectPublicUrl,
} from "../services/storage.js";
import { uploadTicketLimiter } from "../middleware/rateLimiters.js";
import { logDomainEvent } from "../lib/domainLogger.js";
import { logger } from "../lib/logger.js";

export const resources = Router();

// GET /api/v1/resources/storage-status - Safe observability for active storage provider
resources.get(
  "/storage-status",
  wrap(async (_req, res) => {
    res.json(getStorageStatus());
  }),
);

// GET /api/v1/resources?roomId=... - List room study materials & resources
resources.get(
  "/",
  wrap(async (req, res) => {
    const roomId = req.query.roomId ? String(req.query.roomId) : null;
    if (!roomId) {
      return res.status(400).json({ error: "roomId query parameter is required" });
    }

    const { data: room, error: roomErr } = await admin
      .from("rooms")
      .select("id, visibility, owner_id")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !room) {
      return res.status(404).json({ error: "Room not found" });
    }

    if (room.visibility !== "public") {
      const { data: m } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", req.userId!)
        .maybeSingle();

      if (!m && room.owner_id !== req.userId) {
        return res.status(403).json({ error: "Room membership required" });
      }
    }

    const { data: list, error } = await admin
      .from("resources")
      .select("id, room_id, title, description, url, storage_path, kind, uploader_id, created_at, uploader:profiles(id, full_name, username, avatar_url, reputation)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ resources: list ?? [] });
  }),
);

// POST /api/v1/resources/upload-ticket - Mint signed R2 PUT upload ticket for up to 50MB files
resources.post(
  "/upload-ticket",
  uploadTicketLimiter,
  wrap(async (req, res) => {
    const b = z
      .object({
        roomId: z.string().uuid(),
        filename: z.string().min(1).max(180),
        contentType: z.string().max(100),
        fileSizeBytes: z.number().min(1).max(52428800).optional(), // 50MB maximum
      })
      .parse(req.body);

    const { data: m } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", b.roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!m) {
      const { data: room } = await admin
        .from("rooms")
        .select("owner_id")
        .eq("id", b.roomId)
        .maybeSingle();
      if (!room || room.owner_id !== req.userId) {
        return res.status(403).json({ error: "Join room before uploading" });
      }
    }

    const safe = b.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${req.userId}/${b.roomId}/${Date.now()}_${crypto.randomUUID()}-${safe}`;
    const ticket = await signedUpload("resources", path);

    // Register pending media object in tracking registry
    const mediaObj = await registerMediaObject({
      bucket: "resources",
      objectKey: path,
      mimeType: b.contentType,
      fileSizeBytes: b.fileSizeBytes,
      uploaderId: req.userId!,
      entityType: "resource",
      provider: ticket.provider,
      status: "pending_upload",
    });

    res.json({
      bucket: "resources",
      ...ticket,
      path,
      mediaObjectId: mediaObj?.id,
      maxSizeBytes: 52428800,
    });
  }),
);

// POST /api/v1/resources/upload - Direct buffer upload to R2 storage for up to 50MB files
resources.post(
  "/upload",
  wrap(async (req, res) => {
    const b = z
      .object({
        roomId: z.string().uuid(),
        title: z.string().trim().min(2).max(180),
        description: z.string().trim().max(2000).optional().default(""),
        fileBase64: z.string().min(20),
        fileName: z.string().trim().max(160).optional().default("resource.pdf"),
        contentType: z.string().max(100).default("application/pdf"),
        kind: z.enum(["note", "slide", "link", "file", "image"]).default("file"),
      })
      .parse(req.body);

    const { data: m } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", b.roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!m) {
      const { data: room } = await admin
        .from("rooms")
        .select("owner_id")
        .eq("id", b.roomId)
        .maybeSingle();
      if (!room || room.owner_id !== req.userId) {
        return res.status(403).json({ error: "Join room before uploading" });
      }
    }

    const cleanBase64 = b.fileBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    if (buffer.byteLength > 52428800) {
      return res.status(413).json({ error: "File exceeds 50MB size limit." });
    }

    const safe = (b.fileName || "resource.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `${req.userId}/${b.roomId}/${Date.now()}_${crypto.randomUUID()}-${safe}`;
    const storage = getStorageProvider();

    await storage.uploadBuffer("resources", objectKey, buffer, b.contentType);
    const publicUrl = resolveMediaObjectPublicUrl({
      bucket: "resources",
      object_key: objectKey,
      provider: storage.name,
    });

    const { data: inserted, error } = await admin
      .from("resources")
      .insert({
        room_id: b.roomId,
        uploader_id: req.userId!,
        title: b.title,
        description: b.description || null,
        url: publicUrl,
        storage_path: objectKey,
        kind: b.kind,
      })
      .select("*, uploader:profiles(id, full_name, username, avatar_url, reputation)")
      .single();

    if (error) throw error;

    await registerMediaObject({
      bucket: "resources",
      objectKey,
      mimeType: b.contentType,
      fileSizeBytes: buffer.byteLength,
      uploaderId: req.userId!,
      entityType: "resource",
      entityId: inserted.id,
      provider: storage.name,
      status: "ready",
    });

    logDomainEvent({
      event: "material_uploaded",
      roomId: b.roomId,
      materialId: inserted.id,
      fileType: b.kind,
    });

    try {
      const io = req.app.get("io");
      if (io) {
        io.to(`room:${b.roomId}`).emit("room:resource_added", {
          room_id: b.roomId,
          resource: inserted,
        });
      }
    } catch {}

    res.status(201).json({ resource: inserted, url: publicUrl });
  }),
);

// POST /api/v1/resources - Register finalized resource in room
resources.post(
  "/",
  wrap(async (req, res) => {
    const b = z
      .object({
        room_id: z.string().uuid(),
        title: z.string().min(2).max(180),
        description: z.string().max(2000).optional().default(""),
        url: z.string().min(2),
        storage_path: z.string().optional(),
        media_object_id: z.string().uuid().optional(),
        file_size_bytes: z.number().optional(),
        kind: z
          .enum(["note", "slide", "link", "file", "image"])
          .default("file"),
      })
      .parse(req.body);

    const { data: m } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", b.room_id)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!m) {
      const { data: room } = await admin
        .from("rooms")
        .select("owner_id")
        .eq("id", b.room_id)
        .maybeSingle();
      if (!room || room.owner_id !== req.userId) {
        return res.status(403).json({ error: "Room membership required" });
      }
    }

    if (b.storage_path) {
      const expectedPrefix = `${req.userId}/${b.room_id}/`;
      if (!b.storage_path.startsWith(expectedPrefix)) {
        return res.status(403).json({ error: "Invalid storage path prefix: must belong to room uploader" });
      }
    }

    const { data, error } = await admin
      .from("resources")
      .insert({
        room_id: b.room_id,
        title: b.title,
        description: b.description || null,
        url: b.url,
        storage_path: b.storage_path,
        kind: b.kind,
        uploader_id: req.userId!,
      })
      .select("*, uploader:profiles(id, full_name, username, avatar_url, reputation)")
      .single();
    if (error) throw error;

    // Finalize media object lifecycle
    if (b.media_object_id) {
      await finalizeMediaObject({
        mediaObjectId: b.media_object_id,
        fileSizeBytes: b.file_size_bytes,
      });
    } else if (b.storage_path) {
      await registerMediaObject({
        bucket: "resources",
        objectKey: b.storage_path,
        mimeType: b.kind === "image" ? "image/png" : "application/octet-stream",
        fileSizeBytes: b.file_size_bytes,
        uploaderId: req.userId!,
        entityType: "resource",
        entityId: data.id,
        status: "ready",
      });
    }

    logDomainEvent({
      event: "material_uploaded",
      roomId: b.room_id,
      materialId: data.id,
      fileType: b.kind,
    });

    try {
      const io = req.app.get("io");
      if (io) {
        io.to(`room:${b.room_id}`).emit("room:resource_added", {
          room_id: b.room_id,
          resource: data,
        });
      }
    } catch {}

    res.status(201).json(data);
  }),
);

// GET /api/v1/resources/:id/download - Get presigned download URL
resources.get(
  "/:id/download",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: resource } = await admin
      .from("resources")
      .select("*, room:rooms(visibility, owner_id)")
      .eq("id", id)
      .single();

    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    // Authorization check
    if (resource.room_id) {
      const { data: m } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", resource.room_id)
        .eq("user_id", req.userId!)
        .maybeSingle();

      const isOwner = (resource.room as any)?.owner_id === req.userId;
      const isPublic = (resource.room as any)?.visibility === "public";

      if (!m && !isOwner && !isPublic) {
        return res.status(403).json({ error: "Not authorized to download" });
      }
    }

    if (!resource.storage_path) {
      return res.json({ url: resource.url });
    }

    // Generate signed URL via active StorageProvider (valid for 1 hour)
    const provider = getStorageProvider();
    const downloadUrl = await provider.createSignedDownloadUrl("resources", resource.storage_path, 3600);
    res.json({ url: downloadUrl });
  }),
);

// DELETE /api/v1/resources/:id - Delete resource & clean up R2 storage
resources.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: resource } = await admin
      .from("resources")
      .select("*, room:rooms(owner_id)")
      .eq("id", id)
      .single();

    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    // Check authorization: uploader, room owner, or room moderator/teacher
    let authorized = resource.uploader_id === req.userId || (resource.room as any)?.owner_id === req.userId;
    if (!authorized && resource.room_id) {
      const { data: m } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", resource.room_id)
        .eq("user_id", req.userId!)
        .maybeSingle();
      if (m && ["owner", "admin", "moderator", "teacher"].includes(m.role)) {
        authorized = true;
      }
    }

    if (!authorized) {
      return res.status(403).json({ error: "Not authorized to delete this resource" });
    }

    // Remove from R2 storage if storage_path is present
    if (resource.storage_path) {
      try {
        const provider = getStorageProvider();
        await provider.removeFiles("resources", [resource.storage_path]);
      } catch (e) {
        logger.warn({ err: e, path: resource.storage_path }, "Failed to delete resource file from storage provider");
      }
    }

    const { error: delErr } = await admin.from("resources").delete().eq("id", id);
    if (delErr) throw delErr;

    try {
      const io = req.app.get("io");
      if (io && resource.room_id) {
        io.to(`room:${resource.room_id}`).emit("room:resource_deleted", {
          room_id: resource.room_id,
          resource_id: id,
        });
      }
    } catch {}

    res.json({ success: true, id });
  }),
);
