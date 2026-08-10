import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import type { Server } from "socket.io";
export function chat(io: Server) {
  const r = Router();
  r.get(
    "/conversations",
    wrap(async (req, res) => {
      const { data, error } = await admin
        .from("conversation_members")
        .select(
          "conversation_id,last_read_at,conversations(id,title,kind,updated_at)",
        )
        .eq("user_id", req.userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const conversations = await Promise.all(
        (data ?? []).map(async (x: any) => {
          let query = admin
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", x.conversation_id)
            .neq("sender_id", req.userId!);
          if (x.last_read_at) query = query.gt("created_at", x.last_read_at);
          const { count } = await query;
          return { ...x.conversations, unread_count: count ?? 0 };
        }),
      );
      res.json({ conversations });
    }),
  );
  r.get(
    "/conversations/:id/messages",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { data: m } = await admin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle();
      if (!m)
        return res.status(403).json({ error: "Not a conversation member" });
      const before =
        typeof req.query.before === "string"
          ? req.query.before
          : new Date().toISOString();
      const { data, error } = await admin
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .lt("created_at", before)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json({ messages: (data ?? []).reverse() });
    }),
  );
  r.post(
    "/conversations",
    wrap(async (req, res) => {
      const { participantId } = z
        .object({ participantId: z.string().uuid() })
        .parse(req.body);
      const { data: block } = await admin
        .from("blocks")
        .select("id")
        .or(
          `and(blocker_id.eq.${req.userId},blocked_id.eq.${participantId}),and(blocker_id.eq.${participantId},blocked_id.eq.${req.userId})`,
        )
        .limit(1);
      if (block?.length)
        return res.status(403).json({ error: "Messaging unavailable" });
      const { data: existing } = await admin.rpc("find_dm_conversation", {
        p_user_a: req.userId!,
        p_user_b: participantId,
      });
      if (existing?.[0]) return res.json(existing[0]);
      const { data: c, error } = await admin
        .from("conversations")
        .insert({ kind: "dm", created_by: req.userId! })
        .select()
        .single();
      if (error) throw error;
      await admin.from("conversation_members").insert([
        { conversation_id: c.id, user_id: req.userId!, role: "member" },
        { conversation_id: c.id, user_id: participantId, role: "member" },
      ]);
      res.status(201).json(c);
    }),
  );

  r.patch(
    "/conversations/:id/read",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { data, error } = await admin
        .from("conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", id)
        .eq("user_id", req.userId!)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    }),
  );
  r.post(
    "/conversations/:id/messages",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { body } = z
        .object({ body: z.string().trim().min(1).max(5000) })
        .parse(req.body);
      const { data: m } = await admin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle();
      if (!m) return res.status(403).json({ error: "Not a member" });
      const { data, error } = await admin
        .from("messages")
        .insert({ conversation_id: id, sender_id: req.userId!, body })
        .select()
        .single();
      if (error) throw error;
      await admin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);
      io.to(`conversation:${id}`).emit("message:new", data);
      res.status(201).json(data);
    }),
  );
  r.patch(
    "/messages/:id",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { body } = z
        .object({ body: z.string().min(1).max(5000) })
        .parse(req.body);
      const { data, error } = await admin
        .from("messages")
        .update({ body, edited_at: new Date().toISOString() })
        .eq("id", id)
        .eq("sender_id", req.userId!)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    }),
  );
  return r;
}
