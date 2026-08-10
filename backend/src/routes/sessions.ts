import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
export const sessions = Router();
sessions.get(
  "/mine",
  wrap(async (req, res) => {
    const uid = req.userId!;
    const { data: parts } = await admin
      .from("session_participants")
      .select("sessions(*)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    const { data: teach } = await admin
      .from("sessions")
      .select("*")
      .eq("teacher_id", uid)
      .limit(100);
    const merged = new Map<string, any>();
    for (const x of parts ?? []) {
      const s = (x as any).sessions;
      if (s) merged.set(s.id, s);
    }
    for (const s of teach ?? []) merged.set(s.id, s);
    res.json({
      sessions: [...merged.values()].sort(
        (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
      ),
    });
  }),
);
sessions.post(
  "/",
  wrap(async (req, res) => {
    const b = z
      .object({
        room_id: z.string().uuid(),
        starts_at: z.string().datetime(),
        ends_at: z.string().datetime().optional(),
        mode: z.enum(["online", "offline", "hybrid"]),
        campus_location: z.string().max(200).optional(),
      })
      .parse(req.body);
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", b.room_id)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!member || !["owner", "teacher"].includes(member.role))
      return res.status(403).json({ error: "Teacher/owner role required" });
    const { data, error } = await admin
      .from("sessions")
      .insert({ ...b, teacher_id: req.userId!, status: "scheduled" })
      .select()
      .single();
    if (error) throw error;
    const { data: members } = await admin
      .from("room_members")
      .select("user_id")
      .eq("room_id", b.room_id);
    if (members?.length) {
      await admin.from("session_participants").upsert(
        members.map((x) => ({
          session_id: data.id,
          user_id: x.user_id,
          status: "invited",
        })),
        { onConflict: "session_id,user_id" },
      );
      for (const m of members.slice(0, 100))
        if (m.user_id !== req.userId)
          await notifyUser(
            m.user_id,
            "New learning session scheduled",
            new Date(b.starts_at).toLocaleString(),
            "session",
            { sessionId: data.id },
          );
    }
    res.status(201).json(data);
  }),
);
sessions.patch(
  "/:id/attendance",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z
      .object({
        status: z.enum(["confirmed", "declined", "attended", "missed"]),
      })
      .parse(req.body);
    const { data, error } = await admin
      .from("session_participants")
      .upsert(
        {
          session_id: id,
          user_id: req.userId!,
          status,
          attendance_status: ["attended", "missed"].includes(status)
            ? status
            : null,
        },
        { onConflict: "session_id,user_id" },
      )
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  }),
);
sessions.post(
  "/:id/review",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const b = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(1000).optional(),
      })
      .parse(req.body);
    const { data: session } = await admin
      .from("sessions")
      .select("teacher_id,status")
      .eq("id", id)
      .single();
    if (!session || session.status !== "completed")
      return res.status(400).json({ error: "Session must be completed" });
      
    // Check if reviewer actually attended
    const { data: participant } = await admin
      .from("session_participants")
      .select("attendance_status")
      .eq("session_id", id)
      .eq("user_id", req.userId!)
      .single();
      
    if (participant?.attendance_status !== "attended") {
      return res.status(403).json({ error: "Only attended participants can review" });
    }
    
    if (session.teacher_id === req.userId) {
      return res.status(400).json({ error: "Cannot review yourself" });
    }

    const points = b.rating >= 4 ? 5 : (b.rating <= 2 ? -2 : 1);
    
    const { data, error } = await admin.rpc("submit_review_atomic", {
      p_reviewer_id: req.userId!,
      p_reviewee_id: session.teacher_id,
      p_session_id: id,
      p_rating: b.rating,
      p_comment: b.comment || "",
      p_points_awarded: points
    });
    
    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Review already submitted" });
      throw error;
    }
    
    res.status(201).json({ id: data, status: "submitted" });
  }),
);

sessions.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z
      .object({ status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]) })
      .parse(req.body);

    const { data: session } = await admin
      .from("sessions")
      .select("teacher_id, status")
      .eq("id", id)
      .single();

    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.teacher_id !== req.userId) return res.status(403).json({ error: "Only teacher can update session" });

    // Enforce valid transitions
    const validTransitions: Record<string, string[]> = {
      "draft": ["scheduled"],
      "scheduled": ["in_progress", "cancelled"],
      "in_progress": ["completed"],
      "completed": [],
      "cancelled": []
    };

    if (!validTransitions[session.status]?.includes(status)) {
      return res.status(400).json({ error: `Invalid transition from ${session.status} to ${status}` });
    }

    const { data, error } = await admin
      .from("sessions")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  })
);
