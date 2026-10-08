import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const roomPolls = Router({ mergeParams: true });

async function needMember(roomId: string, userId: string) {
  const { data } = await admin
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { role: string } | null;
}

function leader(role?: string) {
  return role === "owner" || role === "teacher" || role === "moderator";
}

roomPolls.post(
  "/",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        question: z.string().trim().min(3).max(300),
        options: z.array(z.string().trim().min(1).max(120)).min(2).max(6),
      })
      .parse(req.body);
    const m = await needMember(roomId, req.userId!);
    if (!m || !leader(m.role)) return res.status(403).json({ error: "Only leaders can poll" });
    const options = body.options.map((text, i) => ({ id: `opt_${i}`, text, votes: 0 }));
    const { data, error } = await admin
      .from("room_posts")
      .insert({
        room_id: roomId, author_id: req.userId!, type: "poll",
        title: body.question, body: body.question,
        metadata: { kind: "live_poll", options, total_votes: 0, is_open: true },
        is_pinned: true,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ poll: data });
  }),
);

roomPolls.get(
  "/active",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const m = await needMember(roomId, req.userId!);
    if (!m) return res.status(403).json({ error: "Join room to view polls" });
    const { data } = await admin
      .from("room_posts")
      .select("id, title, body, metadata, created_at")
      .eq("room_id", roomId)
      .eq("type", "poll")
      .order("created_at", { ascending: false })
      .limit(5);
    const open = (data ?? []).find((p: any) => p.metadata?.is_open !== false) ?? null;
    res.json({ poll: open });
  }),
);

roomPolls.post(
  "/:pollId/vote",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const pollId = z.string().uuid().parse(req.params.pollId);
    const body = z.object({ optionId: z.string().min(1).max(20) }).parse(req.body);
    const m = await needMember(roomId, req.userId!);
    if (!m) return res.status(403).json({ error: "Join room to vote" });
    const { data: poll } = await admin
      .from("room_posts").select("id, metadata, room_id")
      .eq("id", pollId).eq("room_id", roomId).maybeSingle();
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    const meta: any = (poll as any).metadata ?? {};
    if (meta.is_open === false) return res.status(400).json({ error: "Poll closed" });
    const options: any[] = Array.isArray(meta.options) ? meta.options : [];
    if (!options.some((o) => o.id === body.optionId)) return res.status(400).json({ error: "Bad option" });
    let first = true;
    const counts: Record<string, number> = {};
    for (const o of options) counts[o.id] = 0;
    try {
      const { data: prior } = await admin.from("room_poll_votes")
        .select("option_id").eq("poll_id", pollId).eq("user_id", req.userId!).maybeSingle();
      if (prior) first = false;
      await admin.from("room_poll_votes").upsert(
        { poll_id: pollId, user_id: req.userId!, option_id: body.optionId },
        { onConflict: "poll_id,user_id" },
      );
      const { data: all } = await admin.from("room_poll_votes").select("option_id").eq("poll_id", pollId);
      for (const v of (all as any[]) ?? []) {
        const optId = (v as any).option_id;
        if (optId && counts[optId] !== undefined) counts[optId] = (counts[optId] ?? 0) + 1;
      }
    } catch {
      for (const o of options) counts[o.id] = (o.votes ?? 0) + (o.id === body.optionId ? 1 : 0);
    }
    const next = options.map((o) => ({ ...o, votes: counts[o.id] ?? 0 }));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    await admin.from("room_posts").update({ metadata: { ...meta, options: next, total_votes: total } }).eq("id", pollId);
    if (first) {
      await admin.rpc("award_reputation_atomic", {
        p_user_id: req.userId!, p_event_type: "poll_vote", p_points: 5,
        p_reference_type: "room_poll", p_reference_id: pollId,
      }).then(() => null, () => null);
    }
    res.json({ success: true, options: next, total_votes: total });
  }),
);

roomPolls.patch(
  "/:pollId/close",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const pollId = z.string().uuid().parse(req.params.pollId);
    const m = await needMember(roomId, req.userId!);
    if (!m || !leader(m.role)) return res.status(403).json({ error: "Leaders only" });
    const { data: poll } = await admin.from("room_posts")
      .select("metadata").eq("id", pollId).eq("room_id", roomId).maybeSingle();
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    const meta: any = (poll as any).metadata ?? {};
    await admin.from("room_posts").update({ metadata: { ...meta, is_open: false }, is_pinned: false }).eq("id", pollId);
    res.json({ success: true });
  }),
);
