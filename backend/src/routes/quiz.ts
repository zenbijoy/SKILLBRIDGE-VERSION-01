/**
 * SkillBridge – Secure Quiz Routes
 * ---------------------------------
 * All answer keys stay server-side. Client never receives correct_index.
 * Grading is 100% server-authoritative.
 */

import { createHash } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { sanitizeIlike } from "../lib/query-helpers.js";
import { quizStartLimiter } from "../middleware/rateLimiters.js";
import {
  generateQuizSession,
  getQuizSession,
  gradeSubmission,
  invalidateSession,
  recordViolation,
  type DifficultyLevel,
} from "../services/quizEngine.js";

export const quiz = Router();

// ────────────────────────────────────────────────────────────────
// GET /quiz/catalog  – list available skill topics for assessment
// ────────────────────────────────────────────────────────────────
quiz.get(
  "/catalog",
  wrap(async (_req, res) => {
    const { data: skills, error } = await admin
      .from("skills")
      .select("id, name, category")
      .order("name");

    if (error) throw error;

    const catalog = (skills ?? []).map((s: any) => ({
      skill_id: s.id,
      skill_name: s.name,
      category: s.category ?? "General",
      difficulties: ["easy", "medium", "hard"],
      time_limit_seconds: 900,
      pass_threshold: 80,
      question_count: 10,
      reward_points: { easy: 10, medium: 15, hard: 25 },
    }));

    res.json({ catalog });
  }),
);

// ────────────────────────────────────────────────────────────────
// POST /quiz/start  – generate AI quiz session
// ────────────────────────────────────────────────────────────────
quiz.post(
  "/start",
  quizStartLimiter,
  wrap(async (req, res) => {
    const body = z
      .object({
        skill_id: z.string().uuid().optional(),
        custom_skill_name: z.string().min(2).max(100).optional(),
        topic: z.string().min(2).max(200).optional(),
        difficulty: z.enum(["easy", "medium", "hard"]),
        question_count: z.coerce.number().int().min(5).max(20).optional().default(10),
        time_limit_seconds: z.coerce.number().int().min(120).max(3600).optional().default(900),
        context_info: z.string().max(500).optional(),
      })
      .refine((d) => Boolean(d.skill_id || d.custom_skill_name), {
        message: "Either skill_id or custom_skill_name must be provided",
      })
      .parse(req.body);

    let skillId = body.skill_id;
    let skillName = "";

    if (body.custom_skill_name) {
      const cleanName = sanitizeIlike(body.custom_skill_name);
      if (!cleanName) {
        throw new AppError("Invalid custom skill name", { statusCode: 400, code: "VALIDATION_ERROR" });
      }

      const { data: existingSkill } = await admin
        .from("skills")
        .select("id, name")
        .ilike("name", cleanName)
        .limit(1)
        .maybeSingle();

      if (existingSkill) {
        skillId = existingSkill.id;
        skillName = existingSkill.name;
      } else {
        const { data: newSkill, error: insErr } = await admin
          .from("skills")
          .insert({
            name: body.custom_skill_name.trim(),
            category: "Custom Skill",
          })
          .select("id, name")
          .maybeSingle();

        if (insErr || !newSkill) {
          // If insert failed (e.g. concurrent race condition), retry lookup
          const { data: retrySkill } = await admin
            .from("skills")
            .select("id, name")
            .ilike("name", cleanName)
            .limit(1)
            .maybeSingle();

          if (retrySkill) {
            skillId = retrySkill.id;
            skillName = retrySkill.name;
          } else {
            throw new AppError("Failed to register custom skill", { statusCode: 409, code: "RESOURCE_CONFLICT" });
          }
        } else {
          skillId = newSkill.id;
          skillName = newSkill.name;
        }
      }
    } else if (skillId) {
      const { data: skill, error: sErr } = await admin
        .from("skills")
        .select("id, name")
        .eq("id", skillId)
        .maybeSingle();

      if (sErr) throw sErr;
      if (!skill) throw new AppError("Skill not found", { statusCode: 404, code: "RESOURCE_NOT_FOUND" });
      skillName = (skill as any).name;
    }

    const effectiveTopic = body.topic?.trim() || skillName || "General Assessment";

    const { data: existingPassedAttempt } = skillId
      ? await admin
          .from("quiz_attempts")
          .select("id")
          .eq("user_id", req.userId!)
          .eq("skill_id", skillId)
          .eq("passed", true)
          .maybeSingle()
      : { data: null };

    // Generate AI session
    const session = await generateQuizSession({
      userId: req.userId!,
      skillId: skillId!,
      skillName,
      topic: effectiveTopic,
      difficulty: body.difficulty as DifficultyLevel,
      questionCount: body.question_count,
      timeLimitSeconds: body.time_limit_seconds,
      maxViolations: 3,
      contextInfo: body.context_info,
    });

    res.status(201).json({
      session_id: session.session_id,
      skill_name: session.skill_name,
      topic: session.topic,
      difficulty: session.difficulty,
      question_count: session.client_questions.length,
      time_limit_seconds: session.time_limit_seconds,
      expires_at: session.expires_at,
      questions: session.client_questions, // NO answer keys
      max_violations: session.max_violations,
      already_passed: !!existingPassedAttempt,
    });
  }),
);

// ────────────────────────────────────────────────────────────────
// POST /quiz/violation  – record integrity violation
// ────────────────────────────────────────────────────────────────
quiz.post(
  "/violation",
  wrap(async (req, res) => {
    const { session_id } = z
      .object({ session_id: z.string().min(10) })
      .parse(req.body);

    const result = recordViolation(session_id, req.userId!);
    if (!result) {
      return res.status(404).json({ error: "Session not found or expired" });
    }

    res.json(result);
  }),
);

// ────────────────────────────────────────────────────────────────
// POST /quiz/submit  – grade submission server-side
// ────────────────────────────────────────────────────────────────
quiz.post(
  "/submit",
  wrap(async (req, res) => {
    const body = z
      .object({
        session_id: z.string().min(10).optional(),
        quizId: z.string().uuid().optional(),
        // answers: { questionId -> chosen option index (0-3) }
        answers: z.record(z.string(), z.number().int().min(0).max(3)),
        elapsed_seconds: z.number().int().min(0).optional(),
      })
      .refine((d) => Boolean(d.session_id || d.quizId), {
        message: "Either session_id or quizId must be provided",
      })
      .parse(req.body);

    // Support legacy database-backed quiz submissions
    if (body.quizId && !body.session_id) {
      const { data: questions } = await admin
        .from("quiz_questions")
        .select("id, correct_answer")
        .eq("quiz_id", body.quizId);

      const qList = (questions ?? []) as Array<{ id: string; correct_answer: number }>;
      let correctCount = 0;
      for (const q of qList) {
        if (body.answers[q.id] === q.correct_answer) {
          correctCount++;
        }
      }
      const totalCount = qList.length || 1;
      const score = Math.round((correctCount / totalCount) * 100);
      const passed = score >= 80;

      const { data: attempt } = await admin
        .from("quiz_attempts")
        .insert({
          user_id: req.userId!,
          quiz_id: body.quizId,
          score,
          passed,
          correct_count: correctCount,
          total_count: totalCount,
        })
        .select("id")
        .single();

      if (passed) {
        await admin
          .rpc("award_reputation_atomic", {
            p_user_id: req.userId!,
            p_event_type: "quiz_completed",
            p_points: 15,
            p_reference_type: "quiz_attempt",
            p_reference_id: attempt?.id || body.quizId,
          })
          .then(() => null, () => null);
      }

      return res.json({
        attempt_id: attempt?.id,
        score,
        passed,
        correct_count: correctCount,
        total_count: totalCount,
      });
    }

    // Retrieve and verify session
    const session = getQuizSession(body.session_id!, req.userId!);
    if (!session) {
      throw new AppError(
        "Quiz session expired or invalid. Please start a new quiz.",
        { statusCode: 422, code: "VALIDATION_ERROR" },
      );
    }

    // Check time limit server-side (started_at + time_limit_seconds + 30s grace) - H4 fix
    const serverElapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000),
    );
    const clientElapsed = body.elapsed_seconds;
    if (
      serverElapsedSeconds > session.time_limit_seconds + 30 ||
      (clientElapsed !== undefined && clientElapsed > session.time_limit_seconds + 30)
    ) {
      invalidateSession(body.session_id!);
      throw new AppError("Time limit exceeded.", { statusCode: 422, code: "VALIDATION_ERROR" });
    }

    // Server-side grading (answer key never left server)
    // Hardening: gradeSubmission must never throw a raw 500 — wrap it.
    let result: ReturnType<typeof gradeSubmission>;
    try {
      result = gradeSubmission(session, body.answers, 80);
    } catch (gradeErr) {
      logger.error({ event: "quiz_grade_failed", err: gradeErr }, "Quiz grading crashed");
      throw new AppError("Could not grade this assessment. Please retry.", {
        statusCode: 500,
        code: "INTERNAL_SERVER_ERROR",
      });
    }

    // Invalidate session immediately after grading
    invalidateSession(body.session_id!);

    if (!result.integrity_ok) {
      throw new AppError("Session integrity check failed.", { statusCode: 422, code: "VALIDATION_ERROR" });
    }

    const effectiveElapsed =
      clientElapsed !== undefined ? Math.min(clientElapsed, serverElapsedSeconds) : serverElapsedSeconds;

    // Persist attempt — tolerate partially-migrated DBs (missing optional
    // columns) and never fail grading because history failed to save.
    const violationCount = session.violation_count;
    const fullAttemptPayload: Record<string, unknown> = {
      user_id: req.userId!,
      skill_id: session.skill_id,
      quiz_session_id: body.session_id,
      topic: session.topic,
      difficulty: session.difficulty,
      score: result.score,
      passed: result.passed,
      correct_count: result.correct_count,
      total_count: result.total_count,
      violation_count: violationCount,
      bloom_breakdown: result.bloom_breakdown,
      elapsed_seconds: effectiveElapsed,
      answers_submitted: Object.keys(body.answers).length,
    };

    const isMissingColumnError = (e: unknown) => {
      const msg = String(
        (e as { message?: unknown })?.message ?? (e as { error_description?: unknown })?.error_description ?? e ?? "",
      ).toLowerCase();
      return (
        msg.includes("column") &&
        (msg.includes("does not exist") || msg.includes("unknown column") || msg.includes("no such column"))
      );
    };

    let attempt: { id: string } | null = null;
    let historySaved = true;
    try {
      const first = await admin.from("quiz_attempts").insert(fullAttemptPayload).select("id").single();
      if (!first.error) {
        attempt = first.data as { id: string } | null;
      } else if (isMissingColumnError(first.error)) {
        // Production DB may only have the legacy quiz_attempts shape — drop
        // optional engine columns one-by-one until the insert succeeds.
        const fallbackPayload = { ...fullAttemptPayload };
        let lastErr: unknown = first.error;
        for (const col of [
          "answers_submitted",
          "elapsed_seconds",
          "bloom_breakdown",
          "violation_count",
          "total_count",
          "correct_count",
          "difficulty",
          "topic",
          "quiz_session_id",
          "skill_id",
        ]) {
          delete fallbackPayload[col];
          const retry = await admin.from("quiz_attempts").insert({ ...fallbackPayload }).select("id").single();
          if (!retry.error) {
            attempt = retry.data as { id: string } | null;
            lastErr = null;
            break;
          }
          lastErr = retry.error;
          if (!isMissingColumnError(retry.error)) break;
        }
        if (lastErr || !attempt) {
          historySaved = false;
          logger.error(
            { event: "quiz_attempt_persist_failed", err: lastErr },
            "quiz_attempts insert failed — returning grade without history",
          );
        }
      } else {
        historySaved = false;
        logger.error(
          { event: "quiz_attempt_persist_failed", err: first.error },
          "quiz_attempts insert failed — returning grade without history",
        );
      }
    } catch (persistErr) {
      historySaved = false;
      logger.error(
        { event: "quiz_attempt_persist_failed", err: persistErr },
        "quiz_attempts insert threw — returning grade without history",
      );
    }

    const attemptId: string | null = attempt?.id ?? null;

    // If passed: upsert user_skills + award reputation (deduplicated) - H3 fix
    // All DB follow-ups are non-fatal: grading result must survive even if
    // badges/reputation writes fail.
    let rewardPoints = 0;
    if (result.passed) {
      try {
        await admin
          .from("user_skills")
          .upsert(
            {
              user_id: req.userId!,
              skill_id: session.skill_id,
              kind: "known",
              proficiency: session.difficulty === "hard" ? 5 : session.difficulty === "medium" ? 4 : 3,
              verified: true,
            },
            { onConflict: "user_id,skill_id,kind" },
          );
      } catch (skillErr) {
        logger.error({ event: "quiz_skill_upsert_failed", err: skillErr }, "user_skills upsert failed");
      }

      try {
        // Check if user already passed this skill prior to this attempt
        const prevQuery = admin
          .from("quiz_attempts")
          .select("id")
          .eq("user_id", req.userId!)
          .eq("skill_id", session.skill_id)
          .eq("passed", true)
          .limit(1);
        const prevRes = attemptId
          ? await prevQuery.neq("id", attemptId).maybeSingle()
          : await prevQuery.maybeSingle();
        const previousPass = prevRes.data;

        if (!previousPass) {
          rewardPoints = session.difficulty === "hard" ? 25 : session.difficulty === "medium" ? 15 : 10;
          await admin
            .rpc("award_reputation_atomic", {
              p_user_id: req.userId!,
              p_event_type: "skill_verified",
              p_points: rewardPoints,
              p_reference_type: "skill_verification",
              p_reference_id: session.skill_id,
            })
            .then(() => null, () => null); // non-fatal
        }
      } catch (repErr) {
        logger.error({ event: "quiz_reputation_failed", err: repErr }, "reputation follow-up failed");
      }
    }

    // Return full result (with explanations, bloom breakdown)
    res.json({
      attempt_id: attemptId,
      history_saved: historySaved,
      score: result.score,
      passed: result.passed,
      correct_count: result.correct_count,
      total_count: result.total_count,
      pass_threshold: result.pass_threshold,
      question_results: result.question_results,
      bloom_breakdown: result.bloom_breakdown,
      skill_id: session.skill_id,
      skill_name: session.skill_name,
      difficulty: session.difficulty,
      violation_count: violationCount,
      reward_points: rewardPoints,
    });
  }),
);

// ────────────────────────────────────────────────────────────────
// GET /quiz/history  – user's past attempts
// ────────────────────────────────────────────────────────────────
quiz.get(
  "/history",
  wrap(async (req, res) => {
    // Tolerate partially-migrated DBs: retry with a minimal column set if
    // the full select references columns that don't exist yet.
    const fullSelect =
      "id, skill_id, topic, difficulty, score, passed, correct_count, total_count, bloom_breakdown, elapsed_seconds, created_at, skills(name)";
    const minimalSelect = "id, score, passed, created_at";
    let attempts: any[] | null = null;
    let lastErr: unknown = null;

    for (const select of [fullSelect, minimalSelect]) {
      try {
        const { data, error } = await admin
          .from("quiz_attempts")
          .select(select)
          .eq("user_id", req.userId!)
          .order("created_at", { ascending: false })
          .limit(50);
        if (!error) {
          attempts = data ?? [];
          lastErr = null;
          break;
        }
        lastErr = error;
        const msg = String(
          (error as { message?: unknown })?.message ?? error ?? "",
        ).toLowerCase();
        const missingCol =
          msg.includes("column") &&
          (msg.includes("does not exist") || msg.includes("unknown column") || msg.includes("no such column"));
        if (!missingCol) break;
      } catch (e) {
        lastErr = e;
        break;
      }
    }

    if (lastErr && attempts === null) throw lastErr;

    res.json({
      attempts: (attempts ?? []).map((a: any) => ({
        id: a.id,
        skill_id: a.skill_id ?? null,
        skill_name: a.skills?.name ?? a.topic ?? "Quiz",
        topic: a.topic ?? a.skills?.name ?? null,
        difficulty: a.difficulty ?? null,
        score: a.score,
        passed: a.passed,
        correct_count: a.correct_count ?? null,
        total_count: a.total_count ?? null,
        bloom_breakdown: a.bloom_breakdown ?? null,
        elapsed_seconds: a.elapsed_seconds ?? null,
        created_at: a.created_at,
      })),
    });
  }),
);

// ────────────────────────────────────────────────────────────────
// GET /quiz/passport  – user's verified skill badges
// ────────────────────────────────────────────────────────────────
quiz.get(
  "/passport",
  wrap(async (req, res) => {
    const { data: skills, error } = await admin
      .from("user_skills")
      .select("skill_id, proficiency, verified, created_at, skills(name, category)")
      .eq("user_id", req.userId!)
      .eq("verified", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const { data: stats } = await admin
      .from("quiz_attempts")
      .select("score, passed, difficulty")
      .eq("user_id", req.userId!);

    const total = stats?.length ?? 0;
    const passed = stats?.filter((s: any) => s.passed).length ?? 0;
    const avgScore = total > 0
      ? Math.round(stats!.reduce((sum: number, s: any) => sum + (s.score ?? 0), 0) / total)
      : 0;

    const passportId =
      "SKB-PASS-" +
      createHash("sha256")
        .update(req.userId!)
        .digest("hex")
        .slice(0, 12)
        .toUpperCase();

    res.json({
      passport_id: passportId,
      user_id: req.userId!,
      verified_skills: (skills ?? []).map((s: any) => ({
        skill_id: s.skill_id,
        skill_name: s.skills?.name ?? "Unknown",
        category: s.skills?.category ?? "General",
        proficiency: s.proficiency,
        verified_at: s.created_at,
      })),
      stats: {
        total_attempts: total,
        total_passed: passed,
        pass_rate: total > 0 ? Math.round((passed / total) * 100) : 0,
        average_score: avgScore,
      },
    });
  }),
);

// ────────────────────────────────────────────────────────────────
// Legacy: GET /quiz/catalog (old format, kept for compatibility)
// Legacy: GET /quiz/next, GET /quiz/:id  – backward compat
// These serve from the old static quiz_questions table
// ────────────────────────────────────────────────────────────────
quiz.get(
  "/next",
  wrap(async (_req, res) => {
    // Redirect to new catalog
    res.json({ quiz: null, message: "Use POST /quiz/start with skill_id and topic" });
  }),
);
