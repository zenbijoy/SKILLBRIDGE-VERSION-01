import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
import { env } from "../config/env.js";
import { cacheGet, cacheSet, redis } from "../lib/redis.js";

export const rooms = Router();

const createSchema = z
  .object({
    title: z.string().min(4).max(120),
    description: z.string().max(1000),
    topic: z.string().min(2).max(100),
    visibility: z.enum(["public", "private", "invite_only"]).default("public"),
    mode: z.enum(["online", "offline", "hybrid"]).default("hybrid"),
    capacity: z.number().int().min(2).max(env.MAX_ROOM_CAPACITY).default(30),
    tags: z.array(z.string().max(40)).max(10).default([]),
    rules: z.string().max(1000).optional().default(""),
    campus_location: z.string().max(200).optional(),
  })
  .refine(
    (data) => data.mode === "online" || (data.campus_location && data.campus_location.trim().length > 0),
    {
      message: "Campus location is required for offline or hybrid learning rooms",
      path: ["campus_location"],
    },
  );

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// Invalidate room list cache
async function invalidateRoomCache() {
  if (!redis) return;
  try {
    const keys = await redis.keys("rooms:public:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Ignore cache invalidation failures
  }
}

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
      p_tags: body.tags,
      p_rules: body.rules,
      p_campus_location: body.campus_location,
      p_owner_id: req.userId!,
    });
    if (error) throw error;

    await invalidateRoomCache();

    const { data: room, error: fetchErr } = await admin
      .from("rooms")
      .select("*")
      .eq("id", v_room_id)
      .single();
    if (fetchErr) throw fetchErr;
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
        .select("role, profiles(id, full_name, username, avatar_url, reputation)")
        .eq("room_id", id)
        .limit(100),
      admin
        .from("teaching_requests")
        .select(
          "id,status,note,created_at,volunteer:profiles!teaching_requests_volunteer_id_fkey(id, full_name, username, avatar_url)",
        )
        .eq("room_id", id),
      admin.from("sessions").select("*").eq("room_id", id).order("starts_at"),
      admin.from("resources").select("id,title,url,kind,created_at").eq("room_id", id),
    ]);
    if (room.visibility !== "public" && !membership)
      return res.status(403).json({ error: "Room is private" });
    res.json({
      room,
      membership,
      members: members ?? [],
      teachingRequests: teach ?? [],
      sessions: sessions ?? [],
      resources: resources ?? [],
    });
  }),
);

rooms.post(
  "/:id/teach",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { note } = z
      .object({ note: z.string().max(500).default("") })
      .parse(req.body);
    const { data: m } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", id)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!m) return res.status(403).json({ error: "Must join room first" });
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
    
    const { data: request } = await admin
      .from("teaching_requests")
      .select("volunteer_id, status")
      .eq("id", requestId)
      .eq("room_id", roomId)
      .single();
      
    if (!request) return res.status(404).json({ error: "Request not found" });
    
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

// Room Invitations: Create Invitation
rooms.post(
  "/:id/invitations",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { invitee_id } = z.object({ invitee_id: z.string().uuid() }).parse(req.body);

    if (invitee_id === req.userId!) {
      return res.status(400).json({ error: "Cannot invite yourself" });
    }

    // Verify caller is owner or moderator
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Only room hosts or moderators can invite members" });
    }

    // Verify invitee is not already a member
    const { data: existingMember } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", invitee_id)
      .maybeSingle();

    if (existingMember) {
      return res.status(400).json({ error: "User is already a member of this room" });
    }

    const { data: invite, error } = await admin
      .from("room_invitations")
      .insert({
        room_id: roomId,
        inviter_id: req.userId!,
        invitee_id,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;

    const { data: room } = await admin.from("rooms").select("title").eq("id", roomId).single();
    await notifyUser(
      invitee_id,
      "Room Invitation",
      `You were invited to join "${room?.title || "a study room"}".`,
      "room",
      { roomId },
    );

    res.status(201).json(invite);
  }),
);

// Room Invitations: List
rooms.get(
  "/:id/invitations",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Not authorized to view invitations" });
    }

    const { data, error } = await admin
      .from("room_invitations")
      .select("*, invitee:profiles!room_invitations_invitee_id_fkey(id, full_name, username, avatar_url)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ invitations: data ?? [] });
  }),
);

// Atomic Join
rooms.post(
  "/:id/join",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    
    const { data: rpcData, error: rpcError } = await admin.rpc("join_room_service_atomic", {
      p_room_id: id,
      p_user_id: req.userId!,
    });

    if (rpcError) {
      const msg = (rpcError.message || "").toLowerCase();
      if (msg.includes("capacity") || msg.includes("full")) {
        return res.status(400).json({ error: "Room is at maximum capacity" });
      }
      if (msg.includes("invit") || msg.includes("invite")) {
        return res.status(403).json({ error: "This room requires an invitation to join" });
      }
      if (msg.includes("private")) {
        return res.status(403).json({ error: "This room is private" });
      }
      if (msg.includes("not found")) {
        return res.status(404).json({ error: "Room not found" });
      }
      throw rpcError;
    }

    await invalidateRoomCache();
    res.json({ joined: true, role: "member", member_count: rpcData?.member_count ?? 1 });
  }),
);

// Atomic Leave
rooms.post(
  "/:id/leave",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    const { data: rpcData, error: rpcError } = await admin.rpc("leave_room_service_atomic", {
      p_room_id: id,
      p_user_id: req.userId!,
    });

    if (rpcError) {
      const msg = rpcError.message || "";
      if (msg.includes("owner")) {
        return res.status(400).json({ error: "Room owner cannot leave without transferring ownership" });
      }
      if (msg.includes("not found")) {
        return res.status(404).json({ error: "Room not found" });
      }
      throw rpcError;
    }

    await invalidateRoomCache();
    res.json({ left: true, member_count: rpcData?.member_count ?? 1 });
  }),
);
