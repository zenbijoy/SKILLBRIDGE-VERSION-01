import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { removeTree } from "../services/storage.js";
export const account = Router();
account.delete(
  "/",
  wrap(async (req, res) => {
    const { confirm } = z
      .object({ confirm: z.literal("DELETE") })
      .parse(req.body);
    void confirm;
    const uid = req.userId!;
    for (const bucket of ["avatars", "resources"])
      await removeTree(bucket, uid);
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) throw error;
    res.status(204).end();
  }),
);

account.patch(
  "/deactivate",
  wrap(async (req, res) => {
    const uid = req.userId!;
    const { error } = await admin
      .from("profiles")
      .update({ account_status: "deactivated" })
      .eq("id", uid);
    if (error) throw error;
    res.json({ success: true });
  }),
);

account.patch(
  "/reactivate",
  wrap(async (req, res) => {
    const uid = req.userId!;
    const { error } = await admin
      .from("profiles")
      .update({ account_status: "active" })
      .eq("id", uid)
      .eq("account_status", "deactivated");
    if (error) throw error;
    res.json({ success: true });
  }),
);

account.get(
  "/blocks",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("blocks")
      .select("*, blocked:profiles!blocks_blocked_id_fkey(id, full_name, username, avatar_url)")
      .eq("blocker_id", req.userId!);
    if (error) throw error;
    res.json({ data });
  }),
);

account.post(
  "/blocks",
  wrap(async (req, res) => {
    const { blocked_id } = z.object({ blocked_id: z.string().uuid() }).parse(req.body);
    if (blocked_id === req.userId!) {
      return res.status(400).json({ error: "Cannot block yourself" });
    }
    const { error } = await admin.rpc("block_user_atomic", {
      p_blocker_id: req.userId!,
      p_blocked_id: blocked_id,
    });
    if (error) throw error;
    res.json({ success: true, blocked_id });
  }),
);

account.delete(
  "/blocks/:blocked_id",
  wrap(async (req, res) => {
    const { error } = await admin
      .from("blocks")
      .delete()
      .match({ blocker_id: req.userId!, blocked_id: req.params.blocked_id });
    if (error) throw error;
    res.status(204).end();
  }),
);
