import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { signedUpload, registerMediaObject, finalizeMediaObject, getStorageStatus, getStorageProvider } from "../services/storage.js";
import { uploadTicketLimiter } from "../middleware/rateLimiters.js";
import { logDomainEvent } from "../lib/domainLogger.js";

export const resources = Router();

// GET /api/v1/resources/storage-status - Safe observability for active storage provider
resources.get(
  "/storage-status",
  wrap(async (_req, res) => {
    res.json(getStorageStatus());
  }),
);

resources.post(
  "/upload-ticket",
  uploadTicketLimiter,
  wrap(async (req, res) => {
    const b = z
      .object({
        roomId: z.string().uuid(),
        filename: z.string().min(1).max(160),
        contentType: z.string().max(100),
      })
      .parse(req.body);
    const { data: m } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", b.roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!m)
      return res.status(403).json({ error: "Join room before uploading" });
    const safe = b.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${req.userId}/${b.roomId}/${crypto.randomUUID()}-${safe}`;
    const ticket = await signedUpload("resources", path);

    // Register pending media object
    const mediaObj = await registerMediaObject({
      bucket: "resources",
      objectKey: path,
      mimeType: b.contentType,
      uploaderId: req.userId!,
      entityType: "resource",
      provider: ticket.provider,
      status: "pending_upload",
    });

    res.json({ bucket: "resources", ...ticket, path, mediaObjectId: mediaObj?.id });
  }),
);

resources.post(
  "/",
  wrap(async (req, res) => {
    const b = z
      .object({
        room_id: z.string().uuid(),
        title: z.string().min(2).max(160),
        url: z.string().min(2),
        storage_path: z.string().optional(),
        media_object_id: z.string().uuid().optional(),
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
    if (!m) return res.status(403).json({ error: "Room membership required" });
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
        url: b.url,
        storage_path: b.storage_path,
        kind: b.kind,
        uploader_id: req.userId!,
      })
      .select()
      .single();
    if (error) throw error;

    // Finalize media object lifecycle
    if (b.media_object_id) {
      await finalizeMediaObject({ mediaObjectId: b.media_object_id });
    } else if (b.storage_path) {
      await registerMediaObject({
        bucket: "resources",
        objectKey: b.storage_path,
        mimeType: b.kind === "image" ? "image/png" : "application/octet-stream",
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

    res.status(201).json(data);
  }),
);

resources.get(
  "/:id/download",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: resource } = await admin
      .from("resources")
      .select("*, room:rooms(visibility)")
      .eq("id", id)
      .single();
      
    if (!resource || !resource.storage_path) {
      return res.status(404).json({ error: "Resource file not found" });
    }
    
    // Authorization check
    if (resource.room_id) {
      const { data: m } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", resource.room_id)
        .eq("user_id", req.userId!)
        .maybeSingle();
        
      if (!m && (resource.room as any)?.visibility !== "public") {
        return res.status(403).json({ error: "Not authorized to download" });
      }
    }
    
    // Generate signed URL via active StorageProvider (valid for 1 hour)
    const provider = getStorageProvider();
    const downloadUrl = await provider.createSignedDownloadUrl("resources", resource.storage_path, 3600);
    res.json({ url: downloadUrl });
  }),
);
