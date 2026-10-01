import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { ensureCampusHelpWorkspace } from "../services/spaceWorkspaceService.js";
import { logDomainEvent } from "../lib/domainLogger.js";
import { NotificationService } from "../services/notificationService.js";
import { logger } from "../lib/logger.js";

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

// GET /api/v1/help/questions/:id - Get single question detail with thread
help.get(
  "/questions/:id",
  wrap(async (req, res) => {
    const { id } = req.params;

    const { data: q, error } = await admin
      .from("room_questions")
      .select(`
        id, room_id, title, body, is_resolved, upvotes_count, created_at, accepted_answer_id,
        author:profiles!room_questions_author_id_fkey(id, full_name, username, avatar_url, university, department),
        room:rooms!room_questions_room_id_fkey(id, title, visibility),
        answers:room_question_answers(
          id, question_id, body, is_accepted, upvotes_count, created_at,
          author:profiles!room_question_answers_author_id_fkey(id, full_name, username, avatar_url, university, department)
        )
      `)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!q) {
      return res.status(404).json({ error: "Question not found" });
    }

    const answers = (q.answers ?? []).sort((a: any, b: any) => {
      if (a.is_accepted && !b.is_accepted) return -1;
      if (!a.is_accepted && b.is_accepted) return 1;
      return (b.upvotes_count || 0) - (a.upvotes_count || 0);
    });

    const acceptedAnswer = answers.find((a: any) => a.is_accepted) || null;

    res.json({
      question: {
        id: q.id,
        roomId: q.room_id,
        roomTitle: (q as any).room?.title ?? ((q as any).room?.[0]?.title) ?? "Study Space",
        title: q.title,
        body: q.body,
        isResolved: q.is_resolved,
        upvotesCount: q.upvotes_count ?? 0,
        createdAt: q.created_at,
        author: q.author,
        answersCount: answers.length,
        hasAcceptedAnswer: Boolean(acceptedAnswer),
        acceptedAnswer,
        answers,
        subject: (q as any).subject || null,
        topic: (q as any).topic || null,
        urgency: (q as any).urgency || "normal",
      },
    });
  }),
);

// POST /api/v1/help/questions/:id/answers - Post answer to question
help.post(
  "/questions/:id/answers",
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const body = z
      .object({
        body: z.string().min(2, "Answer must be at least 2 characters").max(4000),
      })
      .parse(req.body);

    const { data: q, error: qErr } = await admin
      .from("room_questions")
      .select("id, room_id, author_id, title")
      .eq("id", id)
      .maybeSingle();

    if (qErr) throw qErr;
    if (!q) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Auto-ensure user membership in question's room
    await admin.from("room_members").upsert({
      room_id: q.room_id,
      user_id: req.userId!,
      role: "member",
    } as any);

    const { data: answer, error } = await admin
      .from("room_question_answers")
      .insert({
        question_id: id,
        author_id: req.userId!,
        body: body.body.trim(),
      })
      .select(`
        id, question_id, body, is_accepted, upvotes_count, created_at,
        author:profiles!room_question_answers_author_id_fkey(id, full_name, username, avatar_url, university, department)
      `)
      .single();

    if (error) throw error;

    logDomainEvent({
      event: "question_answered",
      roomId: q.room_id,
      questionId: id,
      answerId: answer.id,
    } as any);

    if (q.author_id && q.author_id !== req.userId) {
      const responderName = (answer as any).author?.full_name || (answer as any).author?.username || "A peer";
      NotificationService.dispatch({
        userId: q.author_id,
        type: "QUESTION_ANSWERED",
        title: "New Answer on Your Question",
        body: `${responderName} replied to: "${q.title.slice(0, 50)}"`,
        entityType: "question",
        entityId: id,
        data: { roomId: q.room_id, questionId: id, answerId: answer.id, route: "room" },
      }).catch((err) => {
        logger.warn({ err: (err as Error).message, questionId: id }, "Failed to dispatch question answered notification");
      });
    }

    res.status(201).json({ answer });
  }),
);

// POST /api/v1/help/questions/:id/upvote - Upvote a question
help.post(
  "/questions/:id/upvote",
  wrap(async (req, res) => {
    const { id } = req.params;

    const { data: q, error: getErr } = await admin
      .from("room_questions")
      .select("id, upvotes_count")
      .eq("id", id)
      .maybeSingle();

    if (getErr) throw getErr;
    if (!q) return res.status(404).json({ error: "Question not found" });

    const newCount = (q.upvotes_count || 0) + 1;
    const { error: updateErr } = await admin
      .from("room_questions")
      .update({ upvotes_count: newCount })
      .eq("id", id);

    if (updateErr) throw updateErr;

    res.json({ upvotesCount: newCount });
  }),
);

// PATCH /api/v1/help/questions/:id/answers/:answerId/accept - Accept answer as solution
help.patch(
  "/questions/:id/answers/:answerId/accept",
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const answerId = String(req.params.answerId);

    const { data: q, error: qErr } = await admin
      .from("room_questions")
      .select("id, room_id, author_id, title, is_resolved")
      .eq("id", id)
      .maybeSingle();

    if (qErr) throw qErr;
    if (!q) return res.status(404).json({ error: "Question not found" });

    if (q.author_id !== req.userId) {
      return res.status(403).json({ error: "Only the question author can accept an answer as the solution" });
    }

    // Reset previous accepted answers
    await admin
      .from("room_question_answers")
      .update({ is_accepted: false })
      .eq("question_id", id);

    // Accept this answer
    await admin
      .from("room_question_answers")
      .update({ is_accepted: true })
      .eq("id", answerId);

    // Mark question resolved
    await admin
      .from("room_questions")
      .update({ is_resolved: true, accepted_answer_id: answerId })
      .eq("id", id);

    // Notify answer author if not self
    const { data: acceptedAnswer } = await admin
      .from("room_question_answers")
      .select("author_id")
      .eq("id", answerId)
      .maybeSingle();

    if (acceptedAnswer?.author_id && acceptedAnswer.author_id !== req.userId) {
      NotificationService.dispatch({
        userId: acceptedAnswer.author_id,
        type: "ANSWER_ACCEPTED",
        title: "Answer Accepted! 🌟",
        body: `Your answer was accepted as the solution for: "${q.title?.slice(0, 50) || "a question"}"`,
        entityType: "question",
        entityId: id,
        data: { roomId: q.room_id, questionId: id, answerId, route: "room" },
      }).catch((err) => {
        logger.warn({ err: (err as Error).message, questionId: id, answerId }, "Failed to dispatch answer accepted notification");
      });
    }

    res.json({ success: true, acceptedAnswerId: answerId });
  }),
);
