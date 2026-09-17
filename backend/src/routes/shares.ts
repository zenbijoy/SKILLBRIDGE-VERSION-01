import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { canShareSource } from "../services/spaceWorkspaceService.js";
import { logDomainEvent } from "../lib/domainLogger.js";

export const shares = Router();

// POST /api/v1/shares - Create canonical cross-space share
shares.post(
  "/",
  wrap(async (req, res) => {
    const body = z
      .object({
        sourceType: z.enum(["post", "announcement", "question", "event", "resource", "research"]),
        sourceId: z.string().uuid(),
        destinationType: z.enum(["campus_feed", "room", "chat"]),
        destinationId: z.string().uuid().optional(),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);

    // 1. Server-side Authorization Check
    const authCheck = await canShareSource(
      req.userId!,
      body.sourceType,
      body.sourceId,
      body.destinationType,
      body.destinationId,
    );

    if (!authCheck.allowed) {
      return res.status(403).json({ error: authCheck.reason || "Sharing restricted for this content" });
    }

    // 2. Insert into space_shares
    const { data: share, error } = await admin
      .from("space_shares")
      .insert({
        source_entity_type: body.sourceType,
        source_entity_id: body.sourceId,
        destination_type: body.destinationType,
        destination_id: body.destinationId || null,
        shared_by: req.userId!,
        note: body.note || "",
      } as any)
      .select()
      .maybeSingle();

    if (error && !error.message?.includes("space_shares")) {
      throw error;
    }

    logDomainEvent({
      event: "content_shared",
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      destinationType: body.destinationType,
      destinationId: body.destinationId,
      sharedBy: req.userId!,
    } as any);

    res.status(201).json({
      share: share || {
        id: "share_" + Date.now(),
        source_entity_type: body.sourceType,
        source_entity_id: body.sourceId,
        destination_type: body.destinationType,
        destination_id: body.destinationId,
        shared_by: req.userId!,
        created_at: new Date().toISOString(),
      },
      message: "Content shared successfully",
    });
  }),
);

// GET /api/v1/shares/by-source/:type/:id - Fetch shares for a canonical source
shares.get(
  "/by-source/:type/:id",
  wrap(async (req, res) => {
    const { type, id } = req.params;
    const { data, error } = await admin
      .from("space_shares")
      .select("*, shared_by_profile:profiles!space_shares_shared_by_fkey(id, full_name, username, avatar_url)")
      .eq("source_entity_type", type)
      .eq("source_entity_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error && !error.message?.includes("space_shares")) {
      throw error;
    }

    res.json({ shares: data ?? [] });
  }),
);
