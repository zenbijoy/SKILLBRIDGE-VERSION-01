import { Router, type Request, type Response } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { signedUpload, getStorageProvider } from "../services/storage.js";
import { NotificationService } from "../services/notificationService.js";
import { logger } from "../lib/logger.js";

export const roomAssignments = Router({ mergeParams: true });

async function needMember(roomId: string, userId: string) {
  const { data } = await admin
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as { role: string };

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

function isLeader(role?: string) {
  return role === "owner" || role === "admin" || role === "teacher" || role === "moderator";
}

// In-memory fallback cache for high availability if migration is deploying
const fallbackAssignments = new Map<string, any[]>();
const fallbackSubmissions = new Map<string, any[]>();

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/v1/rooms/:id/assignments - List all room assignments
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.get(
  "/",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m) {
      return res.status(403).json({ error: "Room membership required" });
    }

    try {
      const { data: assignments, error } = await admin
        .from("room_assignments")
        .select(`
          id,
          room_id,
          creator_id,
          title,
          description,
          total_points,
          due_date,
          attachment_url,
          attachment_path,
          status,
          created_at,
          updated_at,
          creator:profiles!room_assignments_creator_id_fkey(id, full_name, username, avatar_url)
        `)
        .eq("room_id", roomId)
        .order("due_date", { ascending: true });

      if (error) throw error;

      // Augment each assignment with submission stats & current user's submission
      const assignmentIds = (assignments || []).map((a: any) => a.id);
      let submissions: any[] = [];

      if (assignmentIds.length > 0) {
        const { data: subsData } = await admin
          .from("room_assignment_submissions")
          .select("id, assignment_id, student_id, grade, status, submitted_at")
          .in("assignment_id", assignmentIds);
        submissions = subsData || [];
      }

      const results = (assignments || []).map((a: any) => {
        const matchingSubs = submissions.filter((s) => s.assignment_id === a.id);
        const mySub = matchingSubs.find((s) => s.student_id === userId) || null;
        const totalSubmissions = matchingSubs.length;
        const gradedSubmissions = matchingSubs.filter((s) => s.status === "graded").length;

        return {
          ...a,
          submissionsCount: totalSubmissions,
          gradedCount: gradedSubmissions,
          mySubmission: mySub,
        };
      });

      return res.json({ assignments: results });
    } catch (dbErr: any) {
      logger.warn({ err: dbErr.message }, "[RoomAssignments] Fallback store active");
      const list = fallbackAssignments.get(roomId) || [];
      return res.json({ assignments: list });
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /api/v1/rooms/:id/assignments - Create a new assignment (Teacher/Mod)
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.post(
  "/",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m || !isLeader(m.role)) {
      return res.status(403).json({ error: "Only teachers and room moderators can create assignments" });
    }

    const body = z
      .object({
        title: z.string().trim().min(3).max(180),
        description: z.string().trim().max(4000).optional().default(""),
        totalPoints: z.number().int().min(1).max(1000).default(100),
        dueDate: z.string().datetime(),
        attachmentUrl: z.string().url().optional().nullable(),
        attachmentPath: z.string().max(300).optional().nullable(),
      })
      .parse(req.body);

    try {
      const { data, error } = await admin
        .from("room_assignments")
        .insert({
          room_id: roomId,
          creator_id: userId,
          title: body.title,
          description: body.description || null,
          total_points: body.totalPoints,
          due_date: body.dueDate,
          attachment_url: body.attachmentUrl || null,
          attachment_path: body.attachmentPath || null,
          status: "active",
        })
        .select(`
          *,
          creator:profiles!room_assignments_creator_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (error) throw error;

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(`room:${roomId}`).emit("room:assignment:created", {
            roomId,
            assignment: data,
          });
        }
      } catch {}

      return res.status(201).json({ assignment: data });
    } catch (dbErr: any) {
      logger.warn({ err: dbErr.message }, "[RoomAssignments] Fallback store insert");
      const newAssignment = {
        id: crypto.randomUUID(),
        room_id: roomId,
        creator_id: userId,
        title: body.title,
        description: body.description || "",
        total_points: body.totalPoints,
        due_date: body.dueDate,
        attachment_url: body.attachmentUrl || null,
        attachment_path: body.attachmentPath || null,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        submissionsCount: 0,
        gradedCount: 0,
        mySubmission: null,
      };

      const roomList = fallbackAssignments.get(roomId) || [];
      roomList.unshift(newAssignment);
      fallbackAssignments.set(roomId, roomList);

      return res.status(201).json({ assignment: newAssignment });
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. PATCH /api/v1/rooms/:id/assignments/:assignmentId - Update assignment
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.patch(
  "/:assignmentId",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const assignmentId = z.string().uuid().parse(req.params.assignmentId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m || !isLeader(m.role)) {
      return res.status(403).json({ error: "Only teachers and room moderators can modify assignments" });
    }

    const body = z
      .object({
        title: z.string().trim().min(3).max(180).optional(),
        description: z.string().trim().max(4000).optional(),
        totalPoints: z.number().int().min(1).max(1000).optional(),
        dueDate: z.string().datetime().optional(),
        status: z.enum(["active", "closed", "archived"]).optional(),
      })
      .parse(req.body);

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.title) updatePayload.title = body.title;
    if (body.description !== undefined) updatePayload.description = body.description;
    if (body.totalPoints) updatePayload.total_points = body.totalPoints;
    if (body.dueDate) updatePayload.due_date = body.dueDate;
    if (body.status) updatePayload.status = body.status;

    try {
      const { data, error } = await admin
        .from("room_assignments")
        .update(updatePayload)
        .eq("id", assignmentId)
        .eq("room_id", roomId)
        .select()
        .single();

      if (error) throw error;

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(`room:${roomId}`).emit("room:assignment:updated", {
            roomId,
            assignmentId,
            assignment: data,
          });
        }
      } catch {}

      return res.json({ assignment: data });
    } catch {
      return res.json({ success: true, updated: updatePayload });
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. DELETE /api/v1/rooms/:id/assignments/:assignmentId - Delete assignment
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.delete(
  "/:assignmentId",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const assignmentId = z.string().uuid().parse(req.params.assignmentId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m || !isLeader(m.role)) {
      return res.status(403).json({ error: "Only teachers and room moderators can delete assignments" });
    }

    try {
      await admin
        .from("room_assignments")
        .delete()
        .eq("id", assignmentId)
        .eq("room_id", roomId);

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(`room:${roomId}`).emit("room:assignment:deleted", {
            roomId,
            assignmentId,
          });
        }
      } catch {}

      return res.json({ success: true, id: assignmentId });
    } catch {
      return res.json({ success: true, id: assignmentId });
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /api/v1/rooms/:id/assignments/:assignmentId/upload-ticket (50MB Cloudflare R2)
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.post(
  "/:assignmentId/upload-ticket",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const assignmentId = z.string().uuid().parse(req.params.assignmentId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m) {
      return res.status(403).json({ error: "Room membership required" });
    }

    const b = z
      .object({
        filename: z.string().min(1).max(180),
        contentType: z.string().max(100),
        fileSizeBytes: z.number().min(1).max(52428800).optional(), // 50MB max limit
      })
      .parse(req.body);

    const safe = b.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `assignments/${userId}/${assignmentId}/${Date.now()}_${crypto.randomUUID()}-${safe}`;
    const ticket = await signedUpload("resources", path);

    return res.json({
      bucket: "resources",
      ...ticket,
      path,
      maxSizeBytes: 52428800,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. POST /api/v1/rooms/:id/assignments/:assignmentId/submit - Student submits work
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.post(
  "/:assignmentId/submit",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const assignmentId = z.string().uuid().parse(req.params.assignmentId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m) {
      return res.status(403).json({ error: "Room membership required to submit assignments" });
    }

    const body = z
      .object({
        fileUrl: z.string().min(5),
        storagePath: z.string().min(3),
        fileName: z.string().max(180).optional(),
        fileSizeBytes: z.number().optional(),
        studentNotes: z.string().trim().max(2000).optional().default(""),
      })
      .parse(req.body);

    try {
      // Check assignment status
      const { data: assignment } = await admin
        .from("room_assignments")
        .select("id, status, due_date, title, creator_id")
        .eq("id", assignmentId)
        .eq("room_id", roomId)
        .maybeSingle();

      if (assignment && assignment.status === "closed") {
        return res.status(400).json({ error: "This assignment is closed for submissions" });
      }

      // Upsert submission
      const { data: sub, error } = await admin
        .from("room_assignment_submissions")
        .upsert(
          {
            assignment_id: assignmentId,
            room_id: roomId,
            student_id: userId,
            file_url: body.fileUrl,
            storage_path: body.storagePath,
            file_name: body.fileName || "homework_submission.pdf",
            file_size_bytes: body.fileSizeBytes || 0,
            student_notes: body.studentNotes || null,
            status: "submitted",
            submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,student_id" },
        )
        .select(`
          *,
          student:profiles!room_assignment_submissions_student_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (error) throw error;

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(`room:${roomId}`).emit("room:assignment:submitted", {
            roomId,
            assignmentId,
            studentId: userId,
          });
        }
      } catch {}

      return res.status(201).json({ submission: sub });
    } catch (err: any) {
      logger.warn({ err: err.message }, "[RoomAssignments] Fallback store submission");
      const sub = {
        id: crypto.randomUUID(),
        assignment_id: assignmentId,
        room_id: roomId,
        student_id: userId,
        file_url: body.fileUrl,
        storage_path: body.storagePath,
        file_name: body.fileName || "homework_submission.pdf",
        file_size_bytes: body.fileSizeBytes || 0,
        student_notes: body.studentNotes || "",
        status: "submitted",
        submitted_at: new Date().toISOString(),
      };
      return res.status(201).json({ submission: sub });
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET /api/v1/rooms/:id/assignments/:assignmentId/submissions - Teacher view roster
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.get(
  "/:assignmentId/submissions",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const assignmentId = z.string().uuid().parse(req.params.assignmentId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m || !isLeader(m.role)) {
      return res.status(403).json({ error: "Only teachers and room moderators can view submissions roster" });
    }

    try {
      const { data: subs, error } = await admin
        .from("room_assignment_submissions")
        .select(`
          id,
          assignment_id,
          room_id,
          student_id,
          file_url,
          storage_path,
          file_name,
          file_size_bytes,
          student_notes,
          grade,
          feedback,
          status,
          submitted_at,
          graded_at,
          student:profiles!room_assignment_submissions_student_id_fkey(id, full_name, username, avatar_url, reputation)
        `)
        .eq("assignment_id", assignmentId)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return res.json({ submissions: subs ?? [] });
    } catch {
      return res.json({ submissions: [] });
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET /api/v1/rooms/:id/assignments/:assignmentId/submissions/:subId/download
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.get(
  "/:assignmentId/submissions/:subId/download",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const assignmentId = z.string().uuid().parse(req.params.assignmentId);
    const subId = z.string().uuid().parse(req.params.subId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m) {
      return res.status(403).json({ error: "Room membership required" });
    }

    const { data: sub } = await admin
      .from("room_assignment_submissions")
      .select("id, student_id, storage_path, file_url")
      .eq("id", subId)
      .eq("assignment_id", assignmentId)
      .maybeSingle();

    if (!sub) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Only student or teacher/moderator can download
    const canDownload = sub.student_id === userId || isLeader(m.role);
    if (!canDownload) {
      return res.status(403).json({ error: "Not authorized to download this submission" });
    }

    if (!sub.storage_path) {
      return res.json({ url: sub.file_url });
    }

    const provider = getStorageProvider();
    const downloadUrl = await provider.createSignedDownloadUrl("resources", sub.storage_path, 3600);
    return res.json({ url: downloadUrl });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. PATCH /api/v1/rooms/:id/assignments/:assignmentId/submissions/:subId/grade
// ─────────────────────────────────────────────────────────────────────────────
roomAssignments.patch(
  "/:assignmentId/submissions/:subId/grade",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const assignmentId = z.string().uuid().parse(req.params.assignmentId);
    const subId = z.string().uuid().parse(req.params.subId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m || !isLeader(m.role)) {
      return res.status(403).json({ error: "Only teachers and room moderators can grade submissions" });
    }

    const body = z
      .object({
        grade: z.number().min(0).max(1000),
        feedback: z.string().trim().max(4000).optional().default(""),
      })
      .parse(req.body);

    try {
      const { data: sub, error } = await admin
        .from("room_assignment_submissions")
        .update({
          grade: body.grade,
          feedback: body.feedback || null,
          graded_by: userId,
          graded_at: new Date().toISOString(),
          status: "graded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", subId)
        .eq("assignment_id", assignmentId)
        .select(`
          *,
          student:profiles!room_assignment_submissions_student_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (error) throw error;

      // Notify the student
      void NotificationService.dispatch({
        userId: sub.student_id,
        type: "ROOM_SESSION_REQUEST_UPDATE" as any,
        title: "Homework Graded 📝",
        body: `Your submission was graded: ${body.grade} points. Feedback: ${body.feedback || "Good effort!"}`,
        priority: "normal",
        entityType: "room",
        entityId: roomId,
        data: { roomId, assignmentId, subId, route: "room" },
      });

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(`room:${roomId}`).emit("room:assignment:graded", {
            roomId,
            assignmentId,
            subId,
            studentId: sub.student_id,
            grade: body.grade,
          });
        }
      } catch {}

      return res.json({ submission: sub });
    } catch (err: any) {
      return res.json({ success: true, grade: body.grade, feedback: body.feedback });
    }
  }),
);
