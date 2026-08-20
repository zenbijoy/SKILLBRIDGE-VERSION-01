import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const quiz = Router();
quiz.get(
  "/catalog",
  wrap(async (_req, res) => {
    const { data: quizzes, error } = await admin
      .from("quizzes")
      .select("id, title, description, skill_id, created_at, skills(name), quiz_questions(id)")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const list = (quizzes ?? []).map((q: any) => ({
      id: q.id,
      title: q.title,
      description: q.description || `Assessment for ${(q.skills as any)?.name ?? "academic skill"}`,
      skill_name: (q.skills as any)?.name ?? "Skill",
      question_count: (q.quiz_questions as any[])?.length ?? 0,
      reward_points: 15,
    }));

    res.json({ quizzes: list });
  }),
);

quiz.get(
  "/next",
  wrap(async (req, res) => {
    const { data: q } = await admin
      .from("quizzes")
      .select("id,title,skill_id,skills(name)")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!q) return res.json({ quiz: null });
    const { data: questions, error } = await admin
      .from("quiz_questions")
      .select("id,prompt,options")
      .eq("quiz_id", q.id)
      .order("position");
    if (error) throw error;
    res.json({
      quiz: {
        id: q.id,
        title: q.title,
        skill_name: (q as any).skills?.name ?? "Skill",
        questions: questions ?? [],
      },
    });
  }),
);

quiz.get(
  "/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: q, error: qError } = await admin
      .from("quizzes")
      .select("id, title, skill_id, skills(name)")
      .eq("id", id)
      .single();

    if (qError || !q) return res.status(404).json({ error: "Quiz not found" });

    const { data: questions, error } = await admin
      .from("quiz_questions")
      .select("id, prompt, options")
      .eq("quiz_id", q.id)
      .order("position");

    if (error) throw error;

    res.json({
      quiz: {
        id: q.id,
        title: q.title,
        skill_name: (q as any).skills?.name ?? "Skill",
        questions: questions ?? [],
      },
    });
  }),
);
quiz.post(
  "/submit",
  wrap(async (req, res) => {
    const { quizId, answers } = z
      .object({
        quizId: z.string().uuid(),
        answers: z.record(z.string().uuid(), z.number().int().nonnegative()),
      })
      .parse(req.body);
    const { data: questions, error } = await admin
      .from("quiz_questions")
      .select("id,correct_answer")
      .eq("quiz_id", quizId);
    if (error) throw error;
    if (!questions?.length)
      return res.status(404).json({ error: "Quiz not found" });
    const correct = questions.filter(
      (x) => answers[x.id] === x.correct_answer,
    ).length;
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= 80;
    const { data: attempt, error: aerr } = await admin
      .from("quiz_attempts")
      .insert({ quiz_id: quizId, user_id: req.userId!, answers, score, passed })
      .select()
      .single();
    if (aerr) throw aerr;
    if (passed) {
      const { data: q } = await admin
        .from("quizzes")
        .select("skill_id")
        .eq("id", quizId)
        .single();

      if (q?.skill_id) {
        await admin
          .from("user_skills")
          .upsert(
            {
              user_id: req.userId!,
              skill_id: q.skill_id,
              kind: "known",
              proficiency: 4,
              verified: true,
            },
            { onConflict: "user_id,skill_id,kind" },
          );
      }

      // Idempotent point reward check (awarded only once per quiz)
      const { data: existingReward } = await admin
        .from("points_ledger")
        .select("id")
        .eq("user_id", req.userId!)
        .eq("event_type", "skill_verified")
        .eq("reference_type", "quiz")
        .eq("reference_id", quizId)
        .maybeSingle();

      if (!existingReward) {
        await admin
          .from("points_ledger")
          .insert({
            user_id: req.userId!,
            event_type: "skill_verified",
            points: 15,
            reference_type: "quiz",
            reference_id: quizId,
          });

        const { data: profile } = await admin
          .from("profiles")
          .select("reputation")
          .eq("id", req.userId!)
          .single();

        if (profile) {
          await admin
            .from("profiles")
            .update({ reputation: (profile.reputation || 0) + 15 })
            .eq("id", req.userId!);
        }
      }
    }
    res.json({ score, passed, attemptId: attempt.id });
  }),
);
