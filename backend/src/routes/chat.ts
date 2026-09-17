import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import type { Server } from "socket.io";
import { PushService } from "../services/PushService.js";
import { isBlocked } from "../lib/query-helpers.js";

export function chat(io: Server) {
  const r = Router();

  r.get(
    "/presence",
    wrap(async (req, res) => {
      const { userConnections } = await import("../socket.js");
      const { data: myConvs } = await admin
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", req.userId!);

      const convIds = (myConvs ?? []).map((c) => c.conversation_id);
      const relevantPeers = new Set<string>();
      if (convIds.length > 0) {
        const { data: peers } = await admin
          .from("conversation_members")
          .select("user_id")
          .in("conversation_id", convIds)
          .limit(200);
        (peers ?? []).forEach((p) => relevantPeers.add(p.user_id));
      }
      const rawOnline = Array.from(userConnections.keys()).filter((id) => relevantPeers.has(id));
      const { filterVisiblePresence } = await import("../services/privacyService.js");
      const onlineUsers = await filterVisiblePresence(req.userId!, rawOnline);
      res.json({ onlineUsers });
    })
  );

  r.get(
    "/conversations",
    wrap(async (req, res) => {
      const archivedParam = req.query.archived;
      const isArchivedQuery = archivedParam === "true";

      let filteredMembers: any[] = [];
      const resPrimary: any = await (admin
        .from("conversation_members")
        .select("conversation_id,last_read_at,last_read_message_id,is_pinned,is_archived,muted_until,conversations(id,title,kind,updated_at)")
        .eq("user_id", req.userId!)
        .order("created_at", { ascending: false }) as any);

      if (resPrimary.error && (resPrimary.error.message?.includes("is_pinned") || resPrimary.error.message?.includes("column"))) {
        const fallback: any = await (admin
          .from("conversation_members")
          .select("conversation_id,last_read_at,last_read_message_id,conversations(id,title,kind,updated_at)")
          .eq("user_id", req.userId!)
          .order("created_at", { ascending: false }) as any);
        if (fallback.error) throw fallback.error;
        filteredMembers = (fallback.data ?? []).map((x: any) => ({ ...x, is_pinned: false, is_archived: false, muted_until: null }));
      } else if (resPrimary.error) {
        throw resPrimary.error;
      } else {
        filteredMembers = resPrimary.data ?? [];
      }

      if (!filteredMembers || filteredMembers.length === 0) {
        return res.json({ conversations: [] });
      }

      // Filter archived vs active conversations
      filteredMembers = filteredMembers.filter((cm: any) => {
        const isArchived = Boolean(cm.is_archived);
        return isArchivedQuery ? isArchived : !isArchived;
      });

      if (filteredMembers.length === 0) {
        return res.json({ conversations: [] });
      }

      const convIds = filteredMembers.map((x: any) => x.conversation_id);

      // Single batch query for unread messages calculation
      const { data: unreadMessages, error: msgError } = await admin
        .from("messages")
        .select("conversation_id,created_at")
        .in("conversation_id", convIds)
        .neq("sender_id", req.userId!)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (msgError) throw msgError;

      const unreadMap = new Map<string, number>();
      for (const cm of filteredMembers) {
        unreadMap.set(cm.conversation_id, 0);
      }

      for (const msg of unreadMessages ?? []) {
        const cm = filteredMembers.find((x: any) => x.conversation_id === msg.conversation_id);
        if (cm) {
          if (!cm.last_read_at || msg.created_at > cm.last_read_at) {
            unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) || 0) + 1);
          }
        }
      }

      // Resolve DM peer profiles for Telegram-style naming & avatars
      const dmConvIds = filteredMembers
        .filter((cm: any) => cm.conversations?.kind === "dm")
        .map((cm: any) => cm.conversation_id);

      const peerMap = new Map<string, { id: string; name: string; avatar_url: string | null; is_online: boolean }>();
      if (dmConvIds.length > 0) {
        const { data: peers } = await admin
          .from("conversation_members")
          .select("conversation_id, user_id, profiles(id, full_name, username, avatar_url)")
          .in("conversation_id", dmConvIds)
          .neq("user_id", req.userId!)
          .limit(200);

        const { userConnections } = await import("../socket.js");
        for (const p of (peers ?? [])) {
          const prof: any = p.profiles;
          if (prof) {
            peerMap.set(p.conversation_id, {
              id: prof.id,
              name: prof.full_name || prof.username || "SkillBridge User",
              avatar_url: prof.avatar_url || null,
              is_online: userConnections.has(prof.id),
            });
          }
        }
      }

      // Batch query latest message per conversation
      const { data: latestMsgs } = await admin
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, attachment, delivery_status")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(2000);

      const latestMsgMap = new Map<string, any>();
      for (const msg of (latestMsgs ?? [])) {
        if (!latestMsgMap.has(msg.conversation_id)) {
          latestMsgMap.set(msg.conversation_id, msg);
        }
      }

      const conversations = filteredMembers.map((cm: any) => {
        const c = cm.conversations || {};
        const isDm = c.kind === "dm";
        const peer = peerMap.get(cm.conversation_id);
        const lastMsg = latestMsgMap.get(cm.conversation_id) || null;
        const mutedUntil = cm.muted_until || null;
        const isMuted = Boolean(mutedUntil && new Date(mutedUntil) > new Date());

        return {
          id: c.id,
          kind: c.kind || "dm",
          title: isDm ? (peer?.name || "Direct Message") : (c.title || "Conversation"),
          avatar_url: isDm ? (peer?.avatar_url || null) : null,
          peer_id: isDm ? (peer?.id || null) : null,
          is_online: isDm ? Boolean(peer?.is_online) : false,
          unread_count: unreadMap.get(cm.conversation_id) ?? 0,
          is_pinned: Boolean(cm.is_pinned),
          is_archived: Boolean(cm.is_archived),
          is_muted: isMuted,
          muted_until: mutedUntil,
          updated_at: c.updated_at,
          last_message: lastMsg ? {
            id: lastMsg.id,
            body: lastMsg.body,
            sender_id: lastMsg.sender_id,
            created_at: lastMsg.created_at,
            attachment: lastMsg.attachment,
            delivery_status: lastMsg.delivery_status || "sent",
          } : null,
        };
      });

      // Pinned conversations at the top, then recent activity
      conversations.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

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

  r.get(
    "/conversations/:id",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const userId = req.userId!;

      const { data: member } = await admin
        .from("conversation_members")
        .select("role, is_pinned, is_archived, muted_until")
        .eq("conversation_id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!member) {
        return res.status(403).json({ error: "Not a conversation member" });
      }

      const { data: conv, error } = await admin
        .from("conversations")
        .select("id, title, kind, updated_at, created_at, created_by")
        .eq("id", id)
        .single();

      if (error || !conv) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const { data: allMembers } = await admin
        .from("conversation_members")
        .select("user_id, role, profiles(id, full_name, username, avatar_url, headline)")
        .eq("conversation_id", id);

      const { userConnections } = await import("../socket.js");

      let resolvedTitle = conv.title;
      let resolvedAvatarUrl: string | null = null;
      let resolvedPeerId: string | null = null;
      let isOnline = false;

      if (conv.kind === "dm") {
        const otherMember = (allMembers || []).find((m: any) => m.user_id !== userId);
        if (otherMember?.profiles) {
          const p: any = otherMember.profiles;
          resolvedTitle = p.full_name || p.username || "SkillBridge Student";
          resolvedAvatarUrl = p.avatar_url || null;
          resolvedPeerId = p.id;
          isOnline = userConnections.has(p.id);
        }
      }

      res.json({
        conversation: {
          ...conv,
          title: resolvedTitle,
          avatar_url: resolvedAvatarUrl,
          peer_id: resolvedPeerId,
          is_online: isOnline,
          is_pinned: Boolean((member as any).is_pinned),
          is_archived: Boolean((member as any).is_archived),
          muted_until: (member as any).muted_until,
          members: (allMembers || []).map((m: any) => ({
            userId: m.user_id,
            role: m.role,
            profile: m.profiles,
            is_online: userConnections.has(m.user_id),
          })),
        },
      });
    }),
  );

  r.post(
    "/conversations",
    wrap(async (req, res) => {
      const parsed = z
        .object({
          kind: z.enum(["dm", "group"]).default("dm"),
          participantId: z.string().uuid().optional(),
          participantIds: z.array(z.string().uuid()).min(1).max(25).optional(),
          title: z.string().trim().max(100).optional(),
        })
        .parse(req.body);

      // 1. Group DM Creation
      if (parsed.kind === "group" || (parsed.participantIds && parsed.participantIds.length > 1)) {
        const memberIds = Array.from(new Set([...(parsed.participantIds || []), req.userId!]));
        const { data: c, error } = await admin
          .from("conversations")
          .insert({ kind: "group", title: parsed.title || "Group Chat", created_by: req.userId! })
          .select()
          .single();
        if (error) throw error;

        await admin.from("conversation_members").insert(
          memberIds.map((uid) => ({
            conversation_id: c.id,
            user_id: uid,
            role: uid === req.userId! ? "admin" : "member",
          }))
        );
        return res.status(201).json(c);
      }

      // 2. 1:1 Direct Message Creation with Uniqueness Guarantee
      const participantId = parsed.participantId || parsed.participantIds?.[0];
      if (!participantId) {
        return res.status(400).json({ error: "participantId is required for direct conversation" });
      }

      const blocked = await isBlocked(req.userId!, participantId);
      if (blocked) {
        return res.status(403).json({ error: "Messaging unavailable" });
      }

      const { canUserMessage } = await import("../services/privacyService.js");
      const msgCheck = await canUserMessage(req.userId!, participantId);
      if (!msgCheck.allowed) {
        return res.status(403).json({ error: msgCheck.reason || "Messaging unavailable" });
      }

      // Try atomic RPC get_or_create_dm_conversation first
      try {
        const { data: rpcRes, error: rpcErr } = await admin.rpc("get_or_create_dm_conversation", {
          p_user_a: req.userId!,
          p_user_b: participantId,
        });
        if (!rpcErr && rpcRes) {
          return res.status(rpcRes.is_new ? 201 : 200).json(rpcRes);
        }
      } catch {
        // Fall through to fallback
      }

      // Fallback: find existing DM
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
    "/conversations/:id/pin",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { is_pinned } = z.object({ is_pinned: z.boolean().optional() }).parse(req.body || {});
      const { data: current } = await (admin
        .from("conversation_members") as any)
        .select("is_pinned")
        .eq("conversation_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle();

      const nextVal = typeof is_pinned === "boolean" ? is_pinned : !current?.is_pinned;
      const { error } = await (admin
        .from("conversation_members") as any)
        .update({ is_pinned: nextVal })
        .eq("conversation_id", id)
        .eq("user_id", req.userId!);

      if (error && !error.message?.includes("is_pinned")) throw error;
      res.json({ conversation_id: id, is_pinned: nextVal });
    }),
  );

  r.patch(
    "/conversations/:id/archive",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { is_archived } = z.object({ is_archived: z.boolean().optional() }).parse(req.body || {});
      const { data: current } = await (admin
        .from("conversation_members") as any)
        .select("is_archived")
        .eq("conversation_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle();

      const nextVal = typeof is_archived === "boolean" ? is_archived : !current?.is_archived;
      const { error } = await (admin
        .from("conversation_members") as any)
        .update({ is_archived: nextVal })
        .eq("conversation_id", id)
        .eq("user_id", req.userId!);

      if (error && !error.message?.includes("is_archived")) throw error;
      res.json({ conversation_id: id, is_archived: nextVal });
    }),
  );

  r.patch(
    "/conversations/:id/mute",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { durationHours, until } = z
        .object({
          durationHours: z.number().min(0).max(8760).optional(),
          until: z.string().nullable().optional(),
        })
        .parse(req.body || {});

      let mutedUntil: string | null = null;
      if (typeof durationHours === "number" && durationHours > 0) {
        mutedUntil = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
      } else if (until) {
        mutedUntil = new Date(until).toISOString();
      }

      const { error } = await (admin
        .from("conversation_members") as any)
        .update({ muted_until: mutedUntil })
        .eq("conversation_id", id)
        .eq("user_id", req.userId!);

      if (error && !error.message?.includes("muted_until")) throw error;
      res.json({
        conversation_id: id,
        muted_until: mutedUntil,
        is_muted: Boolean(mutedUntil && new Date(mutedUntil) > new Date()),
      });
    }),
  );

  r.patch(
    "/conversations/:id/unread",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { error } = await admin
        .from("conversation_members")
        .update({ last_read_at: null, last_read_message_id: null })
        .eq("conversation_id", id)
        .eq("user_id", req.userId!);

      if (error) throw error;
      res.json({ success: true, conversation_id: id, unread: true });
    }),
  );

  r.get(
    "/conversations/:id/search",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const queryStr = String(req.query.q || "").trim();
      const filter = String(req.query.filter || "all");

      const { data: member } = await admin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle();

      if (!member) {
        return res.status(403).json({ error: "Not a conversation member" });
      }

      let q = admin
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, attachment, delivery_status")
        .eq("conversation_id", id)
        .eq("soft_deleted", false);

      if (queryStr) {
        q = q.ilike("body", `%${queryStr}%`);
      }

      const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
      if (error) throw error;

      let filtered = data || [];
      if (filter === "media") {
        filtered = filtered.filter((m: any) => m.attachment?.type === "image" || m.attachment?.type === "video");
      } else if (filter === "files") {
        filtered = filtered.filter((m: any) => m.attachment?.type === "file" || m.attachment?.type === "audio" || m.attachment?.type === "voice");
      } else if (filter === "links") {
        filtered = filtered.filter((m: any) => m.body?.includes("http"));
      }

      res.json({ results: filtered });
    }),
  );

  r.get(
    "/conversations/:id/media",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const type = String(req.query.type || "media");

      const { data: member } = await admin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle();

      if (!member) {
        return res.status(403).json({ error: "Not a conversation member" });
      }

      let q = admin
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, attachment")
        .eq("conversation_id", id)
        .eq("soft_deleted", false);

      if (type === "links") {
        q = q.ilike("body", "%http%");
      } else {
        q = q.not("attachment", "is", null);
      }

      const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;

      let items: any[] = [];
      if (type === "media") {
        items = (data || []).filter((m: any) => m.attachment?.type === "image" || m.attachment?.type === "video");
      } else if (type === "files") {
        items = (data || []).filter((m: any) => m.attachment?.type === "file" || m.attachment?.type === "audio" || m.attachment?.type === "voice");
      } else if (type === "links") {
        items = data || [];
      }

      res.json({ items });
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
    "/upload",
    wrap(async (req, res) => {
      const { fileBase64, contentType = "image/jpeg", fileName = "attachment" } = z
        .object({
          fileBase64: z.string().min(10),
          contentType: z.string().default("image/jpeg"),
          fileName: z.string().optional().default("attachment"),
        })
        .parse(req.body);

      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("pdf")
        ? "pdf"
        : contentType.includes("webp")
        ? "webp"
        : "jpg";
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${req.userId}/${Date.now()}_${sanitizedName}.${ext}`;
      const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ""), "base64");

      const { error: uploadError } = await admin.storage
        .from("avatars")
        .upload(path, buffer, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);

      res.json({
        url: urlData.publicUrl,
        type: contentType.startsWith("image/") ? "image" : "file",
        name: fileName,
        size: buffer.length,
      });
    }),
  );

  r.post(
    "/conversations/:id/messages",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { body, client_message_id, reply_to_message_id, attachment } = z
        .object({
          body: z.string().trim().max(5000).default(""),
          client_message_id: z.string().uuid().optional(),
          reply_to_message_id: z.string().uuid().optional(),
          attachment: z
            .object({
              url: z.string().url(),
              type: z.string(),
              name: z.string().optional(),
              size: z.number().optional(),
            })
            .optional(),
        })
        .refine((data) => data.body.length > 0 || data.attachment, {
          message: "Message must contain text or an attachment",
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
        .select("kind, conversation_members(user_id, muted_until)")
        .eq("id", id)
        .single();

      if (conv?.kind === "dm") {
        const otherUserId = conv.conversation_members.find((cm: any) => cm.user_id !== req.userId!)?.user_id;
        if (otherUserId) {
          const blocked = await isBlocked(req.userId!, otherUserId);
          if (blocked) {
            return res.status(403).json({ error: "Messaging unavailable" });
          }
          const { canUserMessage } = await import("../services/privacyService.js");
          const msgCheck = await canUserMessage(req.userId!, otherUserId);
          if (!msgCheck.allowed) {
            return res.status(403).json({ error: msgCheck.reason || "Messaging unavailable" });
          }
        }
      }

      const defaultBody = attachment
        ? `[${attachment.type === "image" ? "Photo" : attachment.type === "voice" || attachment.type === "audio" ? "Voice note" : "Attachment"}]`
        : "";

      const { data, error } = await admin
        .from("messages")
        .insert({
          conversation_id: id,
          sender_id: req.userId!,
          body: body || defaultBody,
          client_message_id,
          reply_to_message_id,
          attachment: attachment ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      await admin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);

      // Section 9: Restore unmuted archived conversation to inbox on new message
      try {
        await admin
          .from("conversation_members")
          .update({ is_archived: false })
          .eq("conversation_id", id)
          .eq("is_archived", true)
          .or("muted_until.is.null,muted_until.lt.now()");
      } catch {
        // Non-fatal if column not yet active
      }

      io.to(`conversation:${id}`).emit("message:new", data);

      if (conv) {
        const otherMembers = conv.conversation_members.filter((cm: any) => cm.user_id !== req.userId!);
        for (const member of otherMembers) {
          // Section 10 & 96: Muted chats suppress push notifications
          const isMuted = member.muted_until && new Date(member.muted_until) > new Date();
          if (isMuted) continue;

          const sockets = await io.in(`user:${member.user_id}`).fetchSockets();
          if (sockets.length === 0) {
            await PushService.sendNotification(member.user_id, {
              title: "New Message",
              body: body.length > 50 ? body.substring(0, 47) + "..." : (body || defaultBody),
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

      const { data: msg } = await admin
        .from("messages")
        .select("conversation_id")
        .eq("id", message_id)
        .maybeSingle();

      if (!msg) return res.status(404).json({ error: "Message not found" });

      const { data: isMember } = await admin
        .from("conversation_members")
        .select("id")
        .eq("conversation_id", msg.conversation_id)
        .eq("user_id", req.userId!)
        .maybeSingle();

      if (!isMember) {
        return res.status(403).json({ error: "Not authorized to react to this conversation" });
      }

      const { data, error } = await admin
        .from("message_reactions")
        .insert({ message_id, user_id: req.userId!, reaction })
        .select()
        .single();

      if (error) throw error;

      io.to(`conversation:${msg.conversation_id}`).emit("message:reaction:add", { messageId: message_id, reaction: data });

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

  // Private Attachment Upload Ticket
  r.post(
    "/conversations/:id/attachment-ticket",
    wrap(async (req, res) => {
      const convId = z.string().uuid().parse(req.params.id);
      const b = z
        .object({
          filename: z.string().min(1).max(160),
          contentType: z.string().regex(/^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/plain|application\/zip|audio\/(m4a|mp4|aac|mpeg|webm|ogg|wav|x-m4a))$/i, {
            message: "Unsupported file type",
          }),
          sizeBytes: z.number().int().min(1).max(15 * 1024 * 1024), // Max 15MB
        })
        .parse(req.body);

      const { data: member } = await admin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", convId)
        .eq("user_id", req.userId!)
        .maybeSingle();

      if (!member) {
        return res.status(403).json({ error: "Not authorized to upload to this conversation" });
      }

      const { signedUpload } = await import("../services/storage.js");
      const safeFilename = b.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${convId}/${req.userId!}/${crypto.randomUUID()}-${safeFilename}`;
      const ticket = await signedUpload("attachments", storagePath);

      res.json({ bucket: "attachments", ...ticket, storagePath });
    })
  );

  // Private Attachment Signed Download
  r.get(
    "/conversations/:id/attachments/:attachmentId/download",
    wrap(async (req, res) => {
      const convId = z.string().uuid().parse(req.params.id);
      const { storagePath } = z.object({ storagePath: z.string().min(5) }).parse(req.query);

      const { data: member } = await admin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", convId)
        .eq("user_id", req.userId!)
        .maybeSingle();

      if (!member) {
        return res.status(403).json({ error: "Not authorized to download conversation attachments" });
      }

      if (!storagePath.startsWith(`${convId}/`)) {
        return res.status(403).json({ error: "Invalid attachment path for this conversation" });
      }

      const { data, error } = await admin.storage
        .from("attachments")
        .createSignedUrl(storagePath, 3600);

      if (error) throw error;
      res.json({ url: data.signedUrl });
    })
  );

  return r;
}
