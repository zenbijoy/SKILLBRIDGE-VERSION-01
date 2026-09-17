import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { ensureCampusHelpWorkspace } from "../services/spaceWorkspaceService.js";
import { logDomainEvent } from "../lib/domainLogger.js";

export const help = Router();

// GET /api/v1/help/questions - Canonical question listing across spaces
help.get(
  "/questions",
  wrap(async (req, res) => {
    const urgency = typeof req.query.urgency === "string" ? req.query.urgency : "";
    const subject = typeof req.query.subject === "string" ? req.query.subject : "";
    const status = typeof req.query.status === "string" ? req.query.status : "all";
    const mine = req.query.mine === "true";
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    let query = admin
      .from("room_questions")
      .select(`
        id, room_id, title, body, is_resolved, upvotes_count, created_at,
        author:profiles!room_questions_author_id_fkey(id, full_name, username, avatar_url, university),
        room:rooms!room_questions_room_id_fkey(id, title, visibility),
        answers:room_question_answers(
          id, body, is_accepted, upvotes_count, created_at,
          author:profiles!room_question_answers_author_id_fkey(id, full_name, username, avatar_url)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (mine) {
      query = query.eq("author_id", req.userId!);
    }

    if (status === "resolved") {
      query = query.eq("is_resolved", true);
    } else if (status === "open") {
      query = query.eq("is_resolved", false);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Filter out private room questions unless user is a member or author
    const filtered = (data ?? []).filter((q: any) => {
      if (q.author?.id === req.userId) return true;
      if (q.room?.visibility === "private") return false;
      return true;
    });

    // Transform questions with metadata
    const questions = filtered.map((q: any) => {
      const answers = q.answers ?? [];
      const acceptedAnswer = answers.find((a: any) => a.is_accepted);
      const isAnswered = answers.length > 0;

      return {
        id: q.id,
        roomId: q.room_id,
        roomTitle: q.room?.title ?? "Study Space",
        title: q.title,
        body: q.body,
        isResolved: q.is_resolved,
        upvotesCount: q.upvotes_count ?? 0,
        createdAt: q.created_at,
        author: q.author,
        answersCount: answers.length,
        hasAcceptedAnswer: Boolean(acceptedAnswer),
        acceptedAnswer: acceptedAnswer ?? null,
        answers,
        subject: (q as any).subject || null,
        topic: (q as any).topic || null,
        urgency: (q as any).urgency || "normal",
      };
    });

    // Filter by answered/unanswered if status === "answered"
    const finalQuestions = status === "answered"
      ? questions.filter((q) => q.answersCount > 0)
      : questions;

    res.json({ questions: finalQuestions });
  }),
);

// POST /api/v1/help/questions - Fast canonical question composer
help.post(
  "/questions",
  wrap(async (req, res) => {
    const body = z
      .object({
        title: z.string().max(200).optional(),
        body: z.string().min(5, "Question details must be at least 5 characters").max(4000),
        subject: z.string().max(100).optional(),
        topic: z.string().max(100).optional(),
        urgency: z.enum(["normal", "today", "exam_soon"]).default("normal"),
        target: z.enum(["campus", "room"]).default("campus"),
        roomId: z.string().uuid().optional(),
        tags: z.array(z.string()).default([]),
      })
      .parse(req.body);

    let targetRoomId: string;

    if (body.target === "room" && body.roomId) {
      targetRoomId = body.roomId;
      // Auto-ensure membership
      await admin.from("room_members").upsert({
        room_id: targetRoomId,
        user_id: req.userId!,
        role: "member",
      } as any);
    } else {
      // Get user's university for campus help room
      const { data: profile } = await admin
        .from("profiles")
        .select("university")
        .eq("id", req.userId!)
        .maybeSingle();

      targetRoomId = await ensureCampusHelpWorkspace(profile?.university || "Campus");
      // Auto-ensure membership in campus help room
      await admin.from("room_members").upsert({
        room_id: targetRoomId,
        user_id: req.userId!,
        role: "member",
      } as any);
    }

    const title = body.title?.trim() || body.body.slice(0, 80).trim();

    // Insert canonical question
    const { data: question, error } = await admin
      .from("room_questions")
      .insert({
        room_id: targetRoomId,
        author_id: req.userId!,
        title,
        body: body.body.trim(),
        subject: body.subject?.trim() || null,
        topic: body.topic?.trim() || null,
        urgency: body.urgency,
        tags: body.tags,
      } as any)
      .select(`
        id, room_id, title, body, is_resolved, upvotes_count, created_at,
        author:profiles!room_questions_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) {
      // Fallback insert without extra columns if DB schema cache hasn't synced
      const { data: fallbackQuestion, error: fallbackErr } = await admin
        .from("room_questions")
        .insert({
          room_id: targetRoomId,
          author_id: req.userId!,
          title,
          body: body.body.trim(),
        })
        .select(`
          id, room_id, title, body, is_resolved, upvotes_count, created_at,
          author:profiles!room_questions_author_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (fallbackErr) throw fallbackErr;

      logDomainEvent({
        event: "question_created",
        roomId: targetRoomId,
        questionId: fallbackQuestion.id,
        urgency: body.urgency,
      } as any);

      return res.status(201).json({
        question: {
          ...fallbackQuestion,
          subject: body.subject || null,
          topic: body.topic || null,
          urgency: body.urgency,
        },
      });
    }

    logDomainEvent({
      event: "question_created",
      roomId: targetRoomId,
      questionId: question.id,
      urgency: body.urgency,
    } as any);

    res.status(201).json({
      question: {
        ...question,
        subject: body.subject || null,
        topic: body.topic || null,
        urgency: body.urgency,
      },
    });
  }),
);
