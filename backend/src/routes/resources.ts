import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { signedUpload } from "../services/storage.js";
export const resources = Router();
resources.post(
  "/upload-ticket",
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
    res.json({ bucket: "resources", ...ticket, path });
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
      .insert({ ...b, uploader_id: req.userId! })
      .select()
      .single();
    if (error) throw error;
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
    
    // Generate signed URL (valid for 1 hour)
    const { data, error } = await admin.storage
      .from("resources")
      .createSignedUrl(resource.storage_path, 3600);
      
    if (error) throw error;
    res.json({ url: data.signedUrl });
  }),
);
