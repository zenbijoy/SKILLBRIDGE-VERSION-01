import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
export const rooms = Router();
const createSchema = z.object({
  title: z.string().min(4).max(120),
  description: z.string().max(1000),
  topic: z.string().min(2).max(100),
  visibility: z.enum(["public", "private", "invite_only"]).default("public"),
  mode: z.enum(["online", "offline", "hybrid"]).default("hybrid"),
  capacity: z.number().int().min(2).max(250).default(30),
  tags: z.array(z.string().max(40)).max(10).default([]),
  campus_location: z.string().max(200).optional(),
});
rooms.get(
  "/",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("rooms")
      .select("*")
      .in("status", ["open", "scheduled", "live"])
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    res.json({ rooms: data ?? [] });
  }),
);
rooms.post(
  "/",
  wrap(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data: conversation, error: ce } = await admin
      .from("conversations")
      .insert({ kind: "room", title: body.title, created_by: req.userId! })
      .select()
      .single();
    if (ce) throw ce;
    const { data, error } = await admin
      .from("rooms")
      .insert({
        ...body,
        owner_id: req.userId!,
        member_count: 1,
        conversation_id: conversation.id,
      })
      .select()
      .single();
    if (error) throw error;
    await admin
      .from("room_members")
      .insert({ room_id: data.id, user_id: req.userId!, role: "owner" });
    await admin
      .from("conversation_members")
      .insert({
        conversation_id: conversation.id,
        user_id: req.userId!,
        role: "owner",
      });
    res.status(201).json(data);
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
      members: (members ?? []).map((m: any) => m.profiles),
      teachingRequests: teach ?? [],
      sessions: sessions ?? [],
      resources: resources ?? [],
      myMembership: membership,
    });
  }),
);
rooms.post(
  "/:id/join",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin.rpc("join_room_atomic", {
      p_room_id: id,
      p_user_id: req.userId!,
    });
    if (error) throw error;
    const { data: room } = await admin
      .from("rooms")
      .select("conversation_id")
      .eq("id", id)
      .single();
    if (room?.conversation_id)
      await admin
        .from("conversation_members")
        .upsert(
          {
            conversation_id: room.conversation_id,
            user_id: req.userId!,
            role: "member",
          },
          { onConflict: "conversation_id,user_id" },
        );
    res.json({ joined: true, result: data });
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
      const { data: request } = await admin
        .from("teaching_requests")
        .select("volunteer_id")
        .eq("id", requestId)
        .single();
      if (!request) return res.status(404).json({ error: "Not found" });
      
      const { error } = await admin.rpc("accept_teaching_request", {
        p_room_id: roomId,
        p_request_id: requestId,
        p_volunteer_id: request.volunteer_id,
      });
      if (error) throw error;
      res.json({ id: requestId, status: "accepted" });
    } else {
      const { data, error } = await admin
        .from("teaching_requests")
        .update({ status, decided_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("room_id", roomId)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
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
