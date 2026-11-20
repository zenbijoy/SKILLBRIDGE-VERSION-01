import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { broadcastRoomPoll, broadcastRoomSessionRequest } from "../socket.js";
import { NotificationService } from "../services/notificationService.js";

export const roomPolls = Router({ mergeParams: true });

async function needMember(roomId: string, userId: string) {
  const { data } = await admin
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as { role: string };

  // Room owner is implicitly a leader even if not in room_members table
  const { data: room } = await admin
    .from("rooms")
    .select("owner_id")
    .eq("id", roomId)
    .maybeSingle();
  if (room && room.owner_id === userId) {
    return { role: "owner" };
  }
  return null;
}

function leader(role?: string) {
  return role === "owner" || role === "admin" || role === "teacher" || role === "moderator";
}

// POST /api/v1/rooms/:id/polls - Create a new live poll
roomPolls.post(
  "/",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        question: z.string().trim().min(3).max(300),
        options: z.array(z.string().trim().min(1).max(120)).min(2).max(8),
        pollType: z.enum(["time_selection", "opinion"]).default("opinion"),
        targetRequestId: z.string().uuid().optional(),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(req.body);

    const m = await needMember(roomId, req.userId!);
    if (!m || !leader(m.role)) return res.status(403).json({ error: "Only leaders can create polls" });

    const options = body.options.map((text, i) => ({
      id: `opt_${i}`,
      text,
      votes: 0,
    }));

    const metadata = {
      kind: "live_poll",
      poll_type: body.pollType,
      target_request_id: body.targetRequestId || null,
      options,
      total_votes: 0,
      is_open: true,
      created_by: req.userId!,
      created_at: new Date().toISOString(),
      expires_at: body.expiresAt || null,
    };

    const { data, error } = await admin
      .from("room_posts")
      .insert({
        room_id: roomId,
        author_id: req.userId!,
        type: "poll",
        title: body.question,
        body: body.question,
        metadata,
        is_pinned: true,
      })
      .select(`
        id, room_id, author_id, type, title, body, metadata, is_pinned, created_at,
        profiles:author_id (id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Real-time broadcast to all members in the room
    broadcastRoomPoll(roomId, "created", { poll: data });

    if (body.targetRequestId) {
      await admin
        .from("room_session_requests")
        .update({ status: "converted_to_poll" })
        .eq("id", body.targetRequestId)
        .eq("room_id", roomId);
      broadcastRoomSessionRequest(roomId, "status_changed", {
        requestId: body.targetRequestId,
        status: "converted_to_poll",
      });
    }

    // Notify room members about new live poll
    void (async () => {
      try {
        const { data: members } = await admin
          .from("room_members")
          .select("user_id")
          .eq("room_id", roomId);

        for (const m of (members || []).slice(0, 100)) {
          if (m.user_id !== req.userId!) {
            void NotificationService.dispatch({
              userId: m.user_id,
              type: "ROOM_POLL_CREATED",
              title: "New Room Poll! 🗳️",
              body: `Teacher asked: "${body.question.slice(0, 80)}"`,
              priority: "normal",
              entityType: "room",
              entityId: roomId,
              data: { roomId, pollId: data.id, route: "room" },
            });
          }
        }
      } catch {}
    })();

    res.status(201).json({ poll: data });
  }),
);

// GET /api/v1/rooms/:id/polls/active - Get the currently active poll + user's current vote
roomPolls.get(
  "/active",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const m = await needMember(roomId, req.userId!);
    if (!m) return res.status(403).json({ error: "Join room to view polls" });

    const { data } = await admin
      .from("room_posts")
      .select(`
        id, room_id, author_id, title, body, metadata, created_at,
        profiles:author_id (id, full_name, username, avatar_url)
      `)
      .eq("room_id", roomId)
      .eq("type", "poll")
      .order("created_at", { ascending: false })
      .limit(10);

    const open = (data ?? []).find((p: any) => p.metadata?.is_open !== false) ?? null;

    let userVote: string | null = null;
    if (open) {
      const { data: vote } = await admin
        .from("room_poll_votes")
        .select("option_id")
        .eq("poll_id", open.id)
        .eq("user_id", req.userId!)
        .maybeSingle();
      if (vote) userVote = vote.option_id;
    }

    res.json({ poll: open, userVote });
  }),
);

// GET /api/v1/rooms/:id/polls - List all polls for this room (recent first) + user votes
roomPolls.get(
  "/",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const m = await needMember(roomId, req.userId!);
    if (!m) return res.status(403).json({ error: "Join room to view polls" });

    const { data: polls, error } = await admin
      .from("room_posts")
      .select(`
        id, room_id, author_id, title, body, metadata, created_at,
        profiles:author_id (id, full_name, username, avatar_url)
      `)
      .eq("room_id", roomId)
      .eq("type", "poll")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    const pollIds = (polls || []).map((p: any) => p.id);
    const userVotes: Record<string, string> = {};

    if (pollIds.length > 0) {
      const { data: votes } = await admin
        .from("room_poll_votes")
        .select("poll_id, option_id")
        .in("poll_id", pollIds)
        .eq("user_id", req.userId!);

      for (const v of votes || []) {
        userVotes[v.poll_id] = v.option_id;
      }
    }

    res.json({ polls: polls || [], userVotes });
  }),
);

// POST /api/v1/rooms/:id/polls/:pollId/vote - Vote or switch vote on an option
roomPolls.post(
  "/:pollId/vote",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const pollId = z.string().uuid().parse(req.params.pollId);
    const body = z.object({ optionId: z.string().min(1).max(30) }).parse(req.body);

    const m = await needMember(roomId, req.userId!);
    if (!m) return res.status(403).json({ error: "Join room to vote" });

    const { data: poll } = await admin
      .from("room_posts")
      .select("id, metadata, room_id")
      .eq("id", pollId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!poll) return res.status(404).json({ error: "Poll not found" });

    const meta: any = (poll as any).metadata ?? {};
    if (meta.is_open === false) return res.status(400).json({ error: "Poll closed" });

    const options: any[] = Array.isArray(meta.options) ? meta.options : [];
    if (!options.some((o) => o.id === body.optionId)) return res.status(400).json({ error: "Bad option" });

    let first = true;
    const counts: Record<string, number> = {};
    for (const o of options) counts[o.id] = 0;

    try {
      const { data: prior } = await admin
        .from("room_poll_votes")
        .select("option_id")
        .eq("poll_id", pollId)
        .eq("user_id", req.userId!)
        .maybeSingle();
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
        p_user_id: req.userId!,
        p_event_type: "poll_vote",
        p_points: 5,
        p_reference_type: "room_poll",
        p_reference_id: pollId,
      }).then(() => null, () => null);
    }

    // Real-time broadcast
    broadcastRoomPoll(roomId, "voted", {
      pollId,
      options: next,
      total_votes: total,
      optionId: body.optionId,
      voterId: req.userId,
    });

    res.json({ success: true, options: next, total_votes: total, userVote: body.optionId });
  }),
);

// PATCH /api/v1/rooms/:id/polls/:pollId/close - Close an active poll
roomPolls.patch(
  "/:pollId/close",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const pollId = z.string().uuid().parse(req.params.pollId);

    const m = await needMember(roomId, req.userId!);
    if (!m || !leader(m.role)) return res.status(403).json({ error: "Leaders only" });

    const { data: poll } = await admin
      .from("room_posts")
      .select("metadata")
      .eq("id", pollId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!poll) return res.status(404).json({ error: "Poll not found" });

    const meta: any = (poll as any).metadata ?? {};
    const options: any[] = Array.isArray(meta.options) ? meta.options : [];
    const winningOption = options.reduce(
      (best, cur) => ((cur.votes || 0) > (best?.votes || 0) ? cur : best),
      options[0] || null,
    );

    const updatedMeta = {
      ...meta,
      is_open: false,
      closed_at: new Date().toISOString(),
      closed_by: req.userId!,
      winning_option: winningOption,
    };

    await admin
      .from("room_posts")
      .update({ metadata: updatedMeta, is_pinned: false })
      .eq("id", pollId);

    // Real-time broadcast
    broadcastRoomPoll(roomId, "closed", {
      pollId,
      winningOption,
      options,
      total_votes: meta.total_votes,
    });

    res.json({ success: true, winningOption });
  }),
);

// DELETE /api/v1/rooms/:id/polls/:pollId - Delete a poll
roomPolls.delete(
  "/:pollId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const pollId = z.string().uuid().parse(req.params.pollId);

    const m = await needMember(roomId, req.userId!);
    if (!m || !leader(m.role)) return res.status(403).json({ error: "Leaders only" });

    await admin.from("room_posts").delete().eq("id", pollId).eq("room_id", roomId);

    // Real-time broadcast
    broadcastRoomPoll(roomId, "deleted", { pollId });

    res.json({ success: true });
  }),
);

// POST /api/v1/rooms/:id/polls/:pollId/announce - Broadcast poll result to the room's main chat
roomPolls.post(
  "/:pollId/announce",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const pollId = z.string().uuid().parse(req.params.pollId);

    const m = await needMember(roomId, req.userId!);
    if (!m || !leader(m.role)) return res.status(403).json({ error: "Leaders only" });

    const { data: poll } = await admin
      .from("room_posts")
      .select("title, metadata")
      .eq("id", pollId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!poll) return res.status(404).json({ error: "Poll not found" });

    const meta: any = (poll as any).metadata ?? {};
    const options: any[] = Array.isArray(meta.options) ? meta.options : [];
    const winningOption =
      meta.winning_option ||
      options.reduce(
        (best, cur) => ((cur.votes || 0) > (best?.votes || 0) ? cur : best),
        options[0] || null,
      );

    const { data: room } = await admin
      .from("rooms")
      .select("conversation_id, title")
      .eq("id", roomId)
      .maybeSingle();

    if (!room?.conversation_id) {
      return res.status(400).json({ error: "Room conversation channel not found" });
    }

    const convId = room.conversation_id;
    const winText = winningOption ? `${winningOption.text} (${winningOption.votes || 0} votes)` : "No votes";
    const announcementText = `📢 **Live Poll Closed**\n**Question:** ${poll.title}\n🏆 **Winning Decision:** ${winText}`;

    const { data: msg, error: msgErr } = await admin
      .from("messages")
      .insert({
        conversation_id: convId,
        sender_id: req.userId!,
        body: announcementText,
      })
      .select("id, conversation_id, sender_id, body, created_at")
      .single();

    if (msgErr) throw msgErr;

    const io = req.app.get("io");
    if (io) {
      io.to(`conversation:${convId}`).emit("chat:message", {
        ...msg,
        sender: { id: req.userId! },
      });
    }

    res.json({ success: true, message: msg });
  }),
);
