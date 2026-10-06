import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
import { eitherColumnFilter, isBlocked } from "../lib/query-helpers.js";
export const connections = Router();
connections.get(
  "/",
  wrap(async (req, res) => {
    const uid = req.userId!;
    const { data: edges } = await admin
      .from("connections")
      .select("user_a,user_b")
      .or(eitherColumnFilter("user_a", "user_b", uid))
      .limit(200);
    const ids = (edges ?? []).map((x) =>
      x.user_a === uid ? x.user_b : x.user_a,
    );
    const { data: people } = ids.length
      ? await admin.from("profiles").select("*").in("id", ids)
      : { data: [] as any[] };
    const { data: incoming } = await admin
      .from("connection_requests")
      .select("id,requester_id,created_at,requester:profiles!connection_requests_requester_id_fkey(*)")
      .eq("recipient_id", uid)
      .eq("status", "pending");
    const { data: outgoing } = await admin
      .from("connection_requests")
      .select("id,recipient_id,status,created_at,recipient:profiles!connection_requests_recipient_id_fkey(*)")
      .eq("requester_id", uid)
      .eq("status", "pending");
    const { data: suggested } = await admin.rpc("suggest_connections", {
      p_user_id: uid,
      p_limit: 10,
    });
    res.json({
      connections: people ?? [],
      incoming: incoming ?? [],
      outgoing: outgoing ?? [],
      suggested: suggested ?? [],
    });
  }),
);
connections.post(
  "/requests",
  wrap(async (req, res) => {
    const { recipientId } = z
      .object({ recipientId: z.string().uuid() })
      .parse(req.body);
    if (recipientId === req.userId)
      return res.status(400).json({ error: "Cannot connect to yourself" });
    const blocked = await isBlocked(req.userId!, recipientId);
    if (blocked)
      return res.status(403).json({ error: "Connection unavailable" });

    // 1. Check if already connected
    const [a, b] = [req.userId!, recipientId].sort();
    const { data: existingEdge } = await admin
      .from("connections")
      .select("id")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();

    if (existingEdge) {
      return res.status(200).json({ status: "accepted", alreadyConnected: true });
    }

    // 2. Check if recipient already sent me a pending request (mutual connect -> auto-accept)
    const { data: existingInverse } = await admin
      .from("connection_requests")
      .select("id")
      .eq("requester_id", recipientId)
      .eq("recipient_id", req.userId!)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInverse) {
      await admin.from("connection_requests").update({
        status: "accepted",
        responded_at: new Date().toISOString(),
      }).eq("id", existingInverse.id);

      await admin.from("connections").upsert(
        { user_a: a, user_b: b, user_ids: [a, b] },
        { onConflict: "user_a,user_b" },
      );

      await notifyUser(
        recipientId,
        "Connection accepted",
        "Your connection request was accepted.",
        "connection",
      );

      return res.status(200).json({ status: "accepted", autoAccepted: true });
    }

    // 3. Upsert outgoing pending request
    const { data, error } = await admin
      .from("connection_requests")
      .upsert(
        {
          requester_id: req.userId!,
          recipient_id: recipientId,
          status: "pending",
        },
        { onConflict: "requester_id,recipient_id" },
      )
      .select()
      .single();
    if (error) throw error;
    await notifyUser(
      recipientId,
      "New connection request",
      "Someone wants to connect with you.",
      "connection",
      { requestId: data.id },
    );
    res.status(201).json(data);
  }),
);
connections.patch(
  "/requests/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z
      .object({ status: z.enum(["accepted", "declined"]) })
      .parse(req.body);
    const { data: r, error } = await admin
      .from("connection_requests")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_id", req.userId!)
      .select()
      .single();
    if (error) throw error;
    if (status === "accepted") {
      const [a, b] = [r.requester_id, r.recipient_id].sort();
      await admin
        .from("connections")
        .upsert(
          { user_a: a, user_b: b, user_ids: [a, b] },
          { onConflict: "user_a,user_b" },
        );
      await notifyUser(
        r.requester_id,
        "Connection accepted",
        "Your connection request was accepted.",
        "connection",
      );
    }
    res.json(r);
  }),
);
// Withdraw / Cancel request by request ID (requester or recipient)
connections.delete(
  "/requests/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { error } = await admin
      .from("connection_requests")
      .delete()
      .eq("id", id)
      .or(`requester_id.eq.${req.userId!},recipient_id.eq.${req.userId!}`);
    if (error) throw error;
    res.status(204).end();
  }),
);
// Withdraw / Cancel pending request directly by target recipient user ID
connections.delete(
  "/requests/to/:recipientId",
  wrap(async (req, res) => {
    const recipientId = z.string().uuid().parse(req.params.recipientId);
    const { error } = await admin
      .from("connection_requests")
      .delete()
      .eq("recipient_id", recipientId)
      .eq("requester_id", req.userId!)
      .eq("status", "pending");
    if (error) throw error;
    res.status(204).end();
  }),
);
connections.delete(
  "/:userId",
  wrap(async (req, res) => {
    const other = z.string().uuid().parse(req.params.userId);
    const [a, b] = [req.userId!, other].sort();
    await admin.from("connections").delete().eq("user_a", a).eq("user_b", b);
    res.status(204).end();
  }),
);
