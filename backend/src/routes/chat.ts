import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import type { Server } from "socket.io";
import { PushService } from "../services/PushService.js";

export function chat(io: Server) {
  const r = Router();

  r.get(
    "/presence",
    wrap(async (req, res) => {
      const { userConnections } = await import("../server.js");
      res.json({ onlineUsers: Array.from(userConnections.keys()) });
    })
  );

  r.get(
    "/conversations",
    wrap(async (req, res) => {
      const { data, error } = await admin
        .from("conversation_members")
        .select(
          "conversation_id,last_read_at,last_read_message_id,conversations(id,title,kind,updated_at)",
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

      let messageId: string | undefined;
      if (req.body && typeof req.body === "object") {
        const parsed = z.object({ message_id: z.string().uuid().optional() }).safeParse(req.body);
        if (parsed.success) {
          messageId = parsed.data.message_id;
        }
      }

      const updateData: any = { last_read_at: new Date().toISOString() };
      if (messageId) {
        updateData.last_read_message_id = messageId;
      }

      const { data, error } = await admin
        .from("conversation_members")
        .update(updateData)
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
      const { body, client_message_id, reply_to_message_id } = z
        .object({
          body: z.string().trim().min(1).max(5000),
          client_message_id: z.string().uuid().optional(),
          reply_to_message_id: z.string().uuid().optional()
        })
        .parse(req.body);

      if (client_message_id) {
        const { data: existing } = await admin
          .from("messages")
          .select()
          .eq("sender_id", req.userId!)
          .eq("client_message_id", client_message_id)
          .maybeSingle();
        if (existing) {
          return res.status(200).json(existing);
        }
      }

      const { data: m } = await admin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle();
      if (!m) return res.status(403).json({ error: "Not a member" });

      const { data: conv } = await admin
        .from("conversations")
        .select("kind, conversation_members(user_id)")
        .eq("id", id)
        .single();

      if (conv?.kind === "dm") {
        const otherUserId = conv.conversation_members.find((cm: any) => cm.user_id !== req.userId!)?.user_id;
        if (otherUserId) {
          const { data: block } = await admin
            .from("blocks")
            .select("id")
            .or(
              `and(blocker_id.eq.${req.userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${req.userId})`,
            )
            .limit(1);
          if (block?.length) {
            return res.status(403).json({ error: "Messaging unavailable" });
          }
        }
      }

      const { data, error } = await admin
        .from("messages")
        .insert({ conversation_id: id, sender_id: req.userId!, body, client_message_id, reply_to_message_id })
        .select()
        .single();
      if (error) throw error;
      await admin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);

      io.to(`conversation:${id}`).emit("message:new", data);

      if (conv) {
        const otherMembers = conv.conversation_members.filter((cm: any) => cm.user_id !== req.userId!);
        for (const member of otherMembers) {
          const sockets = await io.in(`user:${member.user_id}`).fetchSockets();
          if (sockets.length === 0) {
            await PushService.sendNotification(member.user_id, {
              title: "New Message",
              body: body.length > 50 ? body.substring(0, 47) + "..." : body,
              data: { conversationId: id, messageId: data.id }
            });
          }
        }
      }

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

  r.post(
    "/messages/:id/reactions",
    wrap(async (req, res) => {
      const message_id = z.string().uuid().parse(req.params.id);
      const { reaction } = z.object({ reaction: z.string().min(1).max(50) }).parse(req.body);

      const { data, error } = await admin
        .from("message_reactions")
        .insert({ message_id, user_id: req.userId!, reaction })
        .select()
        .single();

      if (error) throw error;

      const { data: msg } = await admin.from("messages").select("conversation_id").eq("id", message_id).single();
      if (msg) {
        io.to(`conversation:${msg.conversation_id}`).emit("message:reaction:add", { messageId: message_id, reaction: data });
      }

      res.status(201).json(data);
    })
  );

  r.delete(
    "/messages/:id/reactions/:reaction",
    wrap(async (req, res) => {
      const message_id = z.string().uuid().parse(req.params.id);
      const reaction = req.params.reaction;

      const { error } = await admin
        .from("message_reactions")
        .delete()
        .eq("message_id", message_id)
        .eq("user_id", req.userId!)
        .eq("reaction", reaction);

      if (error) throw error;

      const { data: msg } = await admin.from("messages").select("conversation_id").eq("id", message_id).single();
      if (msg) {
        io.to(`conversation:${msg.conversation_id}`).emit("message:reaction:remove", { messageId: message_id, reaction, userId: req.userId! });
      }

      res.status(204).send();
    })
  );

  r.patch(
    "/messages/:id/status",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { status } = z.object({ status: z.enum(["delivered", "read"]) }).parse(req.body);

      const { data: msg } = await admin
        .from("messages")
        .select("id, conversation_id")
        .eq("id", id)
        .maybeSingle();

      if (!msg) {
        return res.status(404).json({ error: "Message not found" });
      }

      const { data: member } = await admin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", msg.conversation_id)
        .eq("user_id", req.userId!)
        .maybeSingle();

      if (!member) {
        return res.status(403).json({ error: "Not a conversation member" });
      }

      const receiptData: any = {
        message_id: id,
        user_id: req.userId!,
      };
      if (status === "delivered") receiptData.delivered_at = new Date().toISOString();
      if (status === "read") {
        receiptData.delivered_at = new Date().toISOString();
        receiptData.read_at = new Date().toISOString();
      }

      await admin.from("message_delivery_receipts").upsert(receiptData, { onConflict: "message_id,user_id" });

      if (status === "read") {
        io.to(`conversation:${msg.conversation_id}`).emit("message:read", { messageId: id, userId: req.userId! });
      } else if (status === "delivered") {
        io.to(`conversation:${msg.conversation_id}`).emit("message:delivered", { messageId: id, userId: req.userId! });
      }

      res.json({ success: true, message_id: id, delivery_status: status, status });
    })
  );

  r.delete(
    "/messages/:id",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);

      const { data, error } = await admin
        .from("messages")
        .update({ soft_deleted: true })
        .eq("id", id)
        .eq("sender_id", req.userId!)
        .select()
        .single();

      if (error) throw error;

      io.to(`conversation:${data.conversation_id}`).emit("message:delete", { messageId: id });

      res.status(204).send();
    })
  );

  return r;
}
