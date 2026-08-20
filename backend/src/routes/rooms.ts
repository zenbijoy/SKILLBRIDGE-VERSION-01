import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
import { env } from "../config/env.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
export const rooms = Router();
const createSchema = z.object({
  title: z.string().min(4).max(120),
  description: z.string().max(1000),
  topic: z.string().min(2).max(100),
  visibility: z.enum(["public", "private", "invite_only"]).default("public"),
  mode: z.enum(["online", "offline", "hybrid"]).default("hybrid"),
  capacity: z.number().int().min(2).max(env.MAX_ROOM_CAPACITY).default(30),
  tags: z.array(z.string().max(40)).max(10).default([]),
  rules: z.string().max(1000).optional().default(""),
  campus_location: z.string().max(200).optional(),
});
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

rooms.get(
  "/",
  wrap(async (req, res) => {
    const page = pageSchema.parse(req.query.page ?? 1);
    const limit = limitSchema.parse(req.query.limit ?? 20);
    const cacheKey = `rooms:public:p${page}:l${limit}`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) return res.json(cached);

    const from = (page - 1) * limit;
    const to = page * limit - 1;

    const { data, count, error } = await admin
      .from("rooms")
      .select("*", { count: "exact" })
      .in("status", ["open", "scheduled", "live"])
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    const result = {
      rooms: data ?? [],
      total: count ?? 0,
      page,
      limit,
    };
    await cacheSet(cacheKey, result, 30);
    res.json(result);
  }),
);
rooms.post(
  "/",
  wrap(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data: v_room_id, error } = await admin.rpc("create_room_atomic", {
      p_title: body.title,
      p_description: body.description,
      p_topic: body.topic,
      p_visibility: body.visibility,
      p_mode: body.mode,
      p_capacity: body.capacity,
      p_rules: body.rules,
      p_tags: body.tags,
      p_campus_location: body.campus_location ?? null,
      p_owner_id: req.userId!,
    });
    if (error) throw error;
    const { data: room } = await admin.from("rooms").select().eq("id", v_room_id).single();
    res.status(201).json(room);
  }),
);
rooms.get(
  "/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: room, error } = await admin
      .from("rooms")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    const [
      { data: membership },
      { data: members },
      { data: teach },
      { data: sessions },
      { data: resources },
    ] = await Promise.all([
      admin
        .from("room_members")
        .select("role, user_id")
        .eq("room_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle(),
      admin
        .from("room_members")
        .select("profiles(*)")
        .eq("room_id", id)
        .limit(100),
      admin
        .from("teaching_requests")
        .select(
          "id,status,volunteer:profiles!teaching_requests_volunteer_id_fkey(*)",
        )
        .eq("room_id", id),
      admin.from("sessions").select("*").eq("room_id", id).order("starts_at"),
      admin.from("resources").select("id,title,url").eq("room_id", id),
    ]);
    if (room.visibility !== "public" && !membership)
      return res.status(403).json({ error: "Room is private" });
    res.json({
      room,
      members: (members ?? []).map((m: { profiles?: unknown }) => m.profiles),
      teachingRequests: teach ?? [],
      sessions: sessions ?? [],
      resources: resources ?? [],
      myMembership: membership,
    });
  }),
);
rooms.post(
  "/:id/teach",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { note } = z
      .object({ note: z.string().max(500).optional() })
      .parse(req.body);
    const { data, error } = await admin
      .from("teaching_requests")
      .upsert(
        { room_id: id, volunteer_id: req.userId!, note, status: "pending" },
        { onConflict: "room_id,volunteer_id" },
      )
      .select()
      .single();
    if (error) throw error;
    const { data: room } = await admin
      .from("rooms")
      .select("owner_id,title")
      .eq("id", id)
      .single();
    if (room)
      await notifyUser(
        room.owner_id,
        "New teaching volunteer",
        `A member volunteered to teach in ${room.title}.`,
        "room",
        { roomId: id },
      );
    res.status(201).json(data);
  }),
);
rooms.patch(
  "/:id/teach/:requestId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const requestId = z.string().uuid().parse(req.params.requestId);
    const { status } = z
      .object({ status: z.enum(["accepted", "rejected"]) })
      .parse(req.body);
    const { data: room } = await admin
      .from("rooms")
      .select("owner_id")
      .eq("id", roomId)
      .single();
    if (room?.owner_id !== req.userId)
      return res.status(403).json({ error: "Only room owner can decide" });
    if (status === "accepted") {
      const { error } = await admin.rpc("accept_teaching_request", {
        p_room_id: roomId,
        p_request_id: requestId,
      });
      if (error) throw error;
      res.json({ status: "accepted" });
    } else {
      const { error } = await admin
        .from("teaching_requests")
        .update({ status: "rejected", decided_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
      res.json({ status: "rejected" });
    }
  }),
);

rooms.delete(
  "/:id/teach/:requestId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const requestId = z.string().uuid().parse(req.params.requestId);
    
    // Check if the user is the one who volunteered
    const { data: request } = await admin
      .from("teaching_requests")
      .select("volunteer_id, status")
      .eq("id", requestId)
      .eq("room_id", roomId)
      .single();
      
    if (!request) return res.status(404).json({ error: "Request not found" });
    
    // Users can cancel their own request, OR room owners can cancel it (rejecting it is handled by PATCH, but they might want to delete)
    if (request.volunteer_id !== req.userId) {
      const { data: room } = await admin
        .from("rooms")
        .select("owner_id")
        .eq("id", roomId)
        .single();
      if (room?.owner_id !== req.userId) {
         return res.status(403).json({ error: "Not authorized to cancel this request" });
      }
    }
    
    const { error } = await admin
      .from("teaching_requests")
      .delete()
      .eq("id", requestId);
      
    if (error) throw error;
    res.status(204).end();
  }),
);

rooms.post(
  "/:id/join",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    
    // 1. Try atomic RPC first
    const { data: rpcData, error: rpcError } = await admin.rpc("join_room_service_atomic", {
      p_room_id: id,
      p_user_id: req.userId!,
    });

    if (!rpcError && rpcData) {
      return res.json({ joined: true, role: "learner", member_count: rpcData.member_count });
    }

    // 2. Safe Fallback with strict verification
    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("id, visibility, member_count, capacity, status")
      .eq("id", id)
      .single();

    if (roomError || !room) return res.status(404).json({ error: "Room not found" });

    if (room.visibility === "private") {
      return res.status(403).json({ error: "This room is private" });
    }

    if (room.visibility === "invite_only") {
      const { data: inv } = await admin
        .from("room_invitations")
        .select("status")
        .eq("room_id", id)
        .eq("invitee_id", req.userId!)
        .eq("status", "accepted")
        .maybeSingle();

      if (!inv) {
        return res.status(403).json({ error: "This room requires an invitation to join" });
      }
    }

    if (room.member_count >= room.capacity) {
      return res.status(400).json({ error: "Room is at maximum capacity" });
    }

    const { error: insertError } = await admin
      .from("room_members")
      .upsert(
        { room_id: id, user_id: req.userId!, role: "learner" },
        { onConflict: "room_id,user_id" },
      );

    if (insertError) throw insertError;

    // Recalculate member count
    const { count } = await admin
      .from("room_members")
      .select("*", { count: "exact", head: true })
      .eq("room_id", id);

    await admin.from("rooms").update({ member_count: count ?? 1 }).eq("id", id);

    res.json({ joined: true, role: "learner", member_count: count ?? 1 });
  }),
);

rooms.post(
  "/:id/leave",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    // 1. Try atomic RPC first
    const { data: rpcData, error: rpcError } = await admin.rpc("leave_room_service_atomic", {
      p_room_id: id,
      p_user_id: req.userId!,
    });

    if (!rpcError && rpcData) {
      return res.json({ left: true, member_count: rpcData.member_count });
    }

    // 2. Safe Fallback
    const { data: room } = await admin
      .from("rooms")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (room?.owner_id === req.userId) {
      return res.status(400).json({ error: "Room owner cannot leave their own room" });
    }

    const { error } = await admin
      .from("room_members")
      .delete()
      .eq("room_id", id)
      .eq("user_id", req.userId!);

    if (error) throw error;

    const { count } = await admin
      .from("room_members")
      .select("*", { count: "exact", head: true })
      .eq("room_id", id);

    await admin.from("rooms").update({ member_count: Math.max(1, count ?? 1) }).eq("id", id);

    res.json({ left: true, member_count: Math.max(1, count ?? 1) });
  }),
);
