import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { geminiKeyManager } from "../services/geminiKeyManager.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";

export const ct = Router();

// In-memory fallback cache for development or environments with mock DB
const localPlanCache = new Map<string, any[]>();

// ────────────────────────────────────────────────────────────────
// Types & Heuristics
// ────────────────────────────────────────────────────────────────

interface StudyBlock {
  dayOrBlock: string;
  topic: string;
  sessionType: "deep_theory" | "numerical_practice" | "formula_drill" | "past_paper_simulation" | "speed_review";
  durationMinutes: number;
  priority: "high" | "medium" | "low";
  focus: string;
  practiceQuestionsCount: number;
  activeRecallPrompt: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  topic: string;
  priority: "high" | "medium" | "low";
  estMinutes: number;
  completed: boolean;
}

interface CheatsheetItem {
  topic: string;
  concept: string;
  formulaOrRule: string;
  mnemonicOrTip: string;
}

interface ExamTrap {
  topic: string;
  commonMistake: string;
  howToAvoid: string;
}

/**
 * Intelligent algorithmic fallback generator when Gemini API quota or network is offline.
 * Replaces the old naive (availableHours / topics.length) with a realistic Pomodoro and
 * prioritized breakdown based on cognitive load principles.
 */
function generateHeuristicPlan(
  subject: string,
  topics: string[],
  availableHours: number,
  targetGoal: string = "mastery",
  difficulty: string = "intermediate",
): {
  subject: string;
  totalHours: number;
  overallStrategy: string;
  schedule: StudyBlock[];
  recommendedChecklist: ChecklistItem[];
  cheatsheet: CheatsheetItem[];
  examTraps: ExamTrap[];
  aiTips: string[];
  isAiGenerated: boolean;
} {
  const totalMinutes = availableHours * 60;
  const numTopics = Math.max(1, topics.length);

  // Strategy explanation
  const strategyMap: Record<string, string> = {
    ace: `Targeting 100% full marks: Prioritize rigorous numerical problem solving, edge-case derivations, and rapid self-quizzing across all ${numTopics} topics.`,
    mastery: `High-yield 85%+ score strategy: Focus 60% of time on core concepts and past Class Test patterns, 30% on active recall problem-solving, and 10% on rapid formula review.`,
    pass: `Efficient exam survival strategy: Master high-frequency definitions, standard formulas, and the top 3 fundamental question archetypes.`,
    revision: `Last-minute consolidation strategy: Execute timed practice blocks with zero note-skimming, testing immediate recall under time pressure.`,
  };

  const overallStrategy = strategyMap[targetGoal] || strategyMap.mastery;

  // Allocate minutes across blocks with a 50-minute Pomodoro standard
  const schedule: StudyBlock[] = [];
  const recommendedChecklist: ChecklistItem[] = [];
  const cheatsheet: CheatsheetItem[] = [];
  const examTraps: ExamTrap[] = [];

  const sessionTypes: StudyBlock["sessionType"][] = [
    "deep_theory",
    "numerical_practice",
    "formula_drill",
    "past_paper_simulation",
    "speed_review",
  ];

  const minutesPerTopic = Math.max(30, Math.floor((totalMinutes * 0.85) / numTopics));

  topics.forEach((topic, idx) => {
    const priority: "high" | "medium" | "low" = idx === 0 ? "high" : idx % 2 === 1 ? "medium" : "high";
    const sessionType: StudyBlock["sessionType"] = sessionTypes[idx % sessionTypes.length] ?? "deep_theory";
    const duration = Math.min(minutesPerTopic, 90);

    schedule.push({
      dayOrBlock: `Block ${idx + 1} (${duration}m Pomodoro)`,
      topic,
      sessionType,
      durationMinutes: duration,
      priority,
      focus: `Master foundational principles of ${topic}, solve 5 typical Class Test variations, and memorize core governing equations.`,
      practiceQuestionsCount: targetGoal === "ace" ? 8 : 5,
      activeRecallPrompt: `Can you explain the main mechanism or derivation of ${topic} to a peer without looking at slides?`,
    });

    // 2 specific checklist tasks per topic
    recommendedChecklist.push({
      id: `task_${idx + 1}_theory`,
      title: `Review ${topic} lecture notes & write 1-page formula summary`,
      topic,
      priority: "high",
      estMinutes: Math.round(duration * 0.4),
      completed: false,
    });

    recommendedChecklist.push({
      id: `task_${idx + 1}_practice`,
      title: `Solve 5 past CT / textbook practice problems on ${topic}`,
      topic,
      priority,
      estMinutes: Math.round(duration * 0.6),
      completed: false,
    });

    // Cheatsheet item
    cheatsheet.push({
      topic,
      concept: `Core Theorem & Governing Relationship for ${topic}`,
      formulaOrRule: `Key Relation / Property in ${topic}: verify boundary conditions & standard dimensions.`,
      mnemonicOrTip: `Remember: Always check units and sign conventions when applying rules in ${topic}.`,
    });

    // Common exam traps
    examTraps.push({
      topic,
      commonMistake: `Rushing through intermediate algebraic/conceptual steps in ${topic} questions without stating assumptions.`,
      howToAvoid: `Explicitly write given variables, formulas, and state assumptions in the first 60 seconds of answering.`,
    });
  });

  // Final rapid review block
  const remainingMinutes = Math.max(20, totalMinutes - schedule.reduce((acc, s) => acc + s.durationMinutes, 0));
  schedule.push({
    dayOrBlock: `Final Sprint (${remainingMinutes}m)`,
    topic: "Comprehensive Review & Formula Run",
    sessionType: "speed_review",
    durationMinutes: remainingMinutes,
    priority: "high",
    focus: `Full formula recall test across all ${numTopics} topics. Simulate timed 15-minute mock CT questions.`,
    practiceQuestionsCount: 4,
    activeRecallPrompt: "Write down every key formula from memory on blank scratch paper.",
  });

  recommendedChecklist.push({
    id: "task_final_mock",
    title: "Complete 15-minute timed mock test under exam conditions",
    topic: "Comprehensive",
    priority: "high",
    estMinutes: remainingMinutes,
    completed: false,
  });

  const aiTips = [
    `Use 50/10 Pomodoro intervals: 50 minutes of hyper-focus on ${subject}, followed by a 10-minute complete mental rest.`,
    "Active recall over passive re-reading: solve problems with closed books rather than repeatedly highlighting slides.",
    `Focus on high-weightage topics (${topics.slice(0, 2).join(", ")}) in the initial fresh hours when mental focus is peak.`,
    "Review your cheatsheet formulas right before sleeping — sleep consolidation significantly enhances recall during exam morning.",
  ];

  return {
    subject,
    totalHours: availableHours,
    overallStrategy: overallStrategy ?? "High-yield preparation",
    schedule,
    recommendedChecklist,
    cheatsheet,
    examTraps,
    aiTips,
    isAiGenerated: false,
  };
}

// ────────────────────────────────────────────────────────────────
// GET /api/v1/ct/plans - Get all CT study plans for current user
// ────────────────────────────────────────────────────────────────
ct.get(
  "/plans",
  wrap(async (req, res) => {
    const userId = req.userId!;

    // 1. Try ct_study_plans table first
    const { data: ctPlans, error: ctError } = await admin
      .from("ct_study_plans")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("target_date", { ascending: true });

    if (!ctError && ctPlans && ctPlans.length > 0) {
      return res.json({
        plans: ctPlans.map((p) => ({
          id: p.id,
          subject: p.subject,
          examDate: p.target_date,
          topics: Array.isArray(p.topics) ? p.topics : [],
          checklist: Array.isArray(p.checklist) ? p.checklist : [],
          schedule: Array.isArray(p.schedule) ? p.schedule : [],
          cheatsheet: Array.isArray(p.cheatsheet) ? p.cheatsheet : [],
          aiTips: Array.isArray(p.ai_tips) ? p.ai_tips : [],
          mockQuiz: Array.isArray(p.mock_quiz) ? p.mock_quiz : [],
          progressPercent: p.progress_percent ?? 0,
          studyMinutesSpent: p.study_minutes_spent ?? 0,
          targetScore: p.target_score ?? "ace",
          status: p.status ?? "in_progress",
          createdAt: p.created_at,
        })),
      });
    }

    // 2. Try user_goals table
    const { data: userGoals, error: goalError } = await admin
      .from("user_goals")
      .select("*")
      .eq("user_id", userId)
      .eq("category", "academic")
      .order("target_date", { ascending: true });

    if (!goalError && userGoals && userGoals.length > 0) {
      return res.json({
        plans: userGoals.map((p) => {
          const meta = (p.metadata as any) || {};
          return {
            id: p.id,
            subject: p.title,
            examDate: p.target_date,
            topics: meta.topics || [],
            checklist: meta.checklist || [],
            schedule: meta.schedule || [],
            cheatsheet: meta.cheatsheet || [],
            aiTips: meta.aiTips || [],
            mockQuiz: meta.mockQuiz || [],
            progressPercent: p.progress_percentage ?? 0,
            studyMinutesSpent: meta.studyMinutesSpent ?? 0,
            targetScore: meta.targetScore ?? "ace",
            status: p.status ?? "in_progress",
            createdAt: p.created_at,
          };
        }),
      });
    }

    // 3. Fallback to in-memory local cache
    const cached = localPlanCache.get(userId) || [];
    res.json({ plans: cached });
  }),
);

// ────────────────────────────────────────────────────────────────
// POST /api/v1/ct/plans - Create a new CT study preparation plan
// ────────────────────────────────────────────────────────────────
ct.post(
  "/plans",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        subject: z.string().min(2).max(120),
        examDate: z.string().datetime(),
        topics: z.array(z.string()).default([]),
        checklist: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              topic: z.string().optional().default(""),
              priority: z.enum(["high", "medium", "low"]).optional().default("medium"),
              estMinutes: z.number().optional().default(30),
              completed: z.boolean().default(false),
            }),
          )
          .default([]),
        schedule: z.array(z.any()).optional().default([]),
        cheatsheet: z.array(z.any()).optional().default([]),
        aiTips: z.array(z.string()).optional().default([]),
        mockQuiz: z.array(z.any()).optional().default([]),
        targetScore: z.string().optional().default("ace"),
      })
      .parse(req.body);

    const planId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const planPayload = {
      id: planId,
      user_id: userId,
      subject: body.subject,
      target_date: body.examDate,
      topics: body.topics,
      checklist: body.checklist,
      schedule: body.schedule,
      cheatsheet: body.cheatsheet,
      ai_tips: body.aiTips,
      mock_quiz: body.mockQuiz,
      target_score: body.targetScore,
      progress_percent: 0,
      study_minutes_spent: 0,
      status: "in_progress",
      created_at: nowIso,
      updated_at: nowIso,
    };

    let persisted = false;

    // 1. Try inserting into ct_study_plans
    try {
      const { data, error } = await admin
        .from("ct_study_plans")
        .insert(planPayload)
        .select()
        .maybeSingle();

      if (!error && data) {
        persisted = true;
      }
    } catch (err) {
      logger.debug({ err }, "ct_study_plans table insert fallback");
    }

    // 2. Fallback to user_goals table
    if (!persisted) {
      try {
        const { data, error } = await admin
          .from("user_goals")
          .insert({
            user_id: userId,
            title: body.subject,
            category: "academic",
            status: "in_progress",
            target_date: body.examDate,
            progress_percentage: 0,
            metadata: {
              topics: body.topics,
              checklist: body.checklist,
              schedule: body.schedule,
              cheatsheet: body.cheatsheet,
              aiTips: body.aiTips,
              mockQuiz: body.mockQuiz,
              targetScore: body.targetScore,
              studyMinutesSpent: 0,
            },
          })
          .select()
          .maybeSingle();

        if (!error && data) {
          planPayload.id = data.id;
          persisted = true;
        }
      } catch (err) {
        logger.debug({ err }, "user_goals table insert fallback");
      }
    }

    // Always maintain local memory cache for zero-downtime reliability
    const existing = localPlanCache.get(userId) || [];
    const formattedPlan = {
      id: planPayload.id,
      subject: planPayload.subject,
      examDate: planPayload.target_date,
      topics: planPayload.topics,
      checklist: planPayload.checklist,
      schedule: planPayload.schedule,
      cheatsheet: planPayload.cheatsheet,
      aiTips: planPayload.ai_tips,
      mockQuiz: planPayload.mock_quiz,
      progressPercent: 0,
      studyMinutesSpent: 0,
      targetScore: planPayload.target_score,
      status: "in_progress",
      createdAt: nowIso,
    };
    localPlanCache.set(userId, [formattedPlan, ...existing]);

    res.status(201).json({ plan: formattedPlan });
  }),
);

// ────────────────────────────────────────────────────────────────
// PATCH /api/v1/ct/plans/:id - Update plan progress & checklist
// ────────────────────────────────────────────────────────────────
ct.patch(
  "/plans/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const planId = req.params.id;

    const body = z
      .object({
        checklist: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              topic: z.string().optional().default(""),
              priority: z.enum(["high", "medium", "low"]).optional().default("medium"),
              estMinutes: z.number().optional().default(30),
              completed: z.boolean(),
            }),
          )
          .optional(),
        progressPercent: z.number().min(0).max(100).optional(),
        studyMinutesSpent: z.number().min(0).optional(),
        status: z.enum(["in_progress", "completed", "archived"]).optional(),
        examDate: z.string().datetime().optional(),
        topics: z.array(z.string()).optional(),
        cheatsheet: z.array(z.any()).optional(),
      })
      .parse(req.body);

    let progress = body.progressPercent;
    if (progress === undefined && body.checklist && body.checklist.length > 0) {
      const completed = body.checklist.filter((c) => c.completed).length;
      progress = Math.round((completed / body.checklist.length) * 100);
    }

    // 1. Try ct_study_plans update
    const updateData: any = { updated_at: new Date().toISOString() };
    if (body.checklist !== undefined) updateData.checklist = body.checklist;
    if (progress !== undefined) updateData.progress_percent = progress;
    if (body.studyMinutesSpent !== undefined) updateData.study_minutes_spent = body.studyMinutesSpent;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.examDate !== undefined) updateData.target_date = body.examDate;
    if (body.topics !== undefined) updateData.topics = body.topics;
    if (body.cheatsheet !== undefined) updateData.cheatsheet = body.cheatsheet;

    try {
      await admin
        .from("ct_study_plans")
        .update(updateData)
        .eq("id", planId)
        .eq("user_id", userId);
    } catch {
      // Ignore DB error
    }

    // 2. Try user_goals update
    try {
      const { data: goal } = await admin
        .from("user_goals")
        .select("metadata")
        .eq("id", planId)
        .eq("user_id", userId)
        .maybeSingle();

      if (goal) {
        const meta = (goal.metadata as any) || {};
        if (body.checklist !== undefined) meta.checklist = body.checklist;
        if (body.studyMinutesSpent !== undefined) meta.studyMinutesSpent = body.studyMinutesSpent;
        if (body.topics !== undefined) meta.topics = body.topics;
        if (body.cheatsheet !== undefined) meta.cheatsheet = body.cheatsheet;

        await admin
          .from("user_goals")
          .update({
            progress_percentage: progress ?? 0,
            status: body.status ?? "in_progress",
            metadata: meta,
            updated_at: new Date().toISOString(),
          })
          .eq("id", planId)
          .eq("user_id", userId);
      }
    } catch {
      // Ignore DB error
    }

    // Update in-memory cache
    const userPlans = localPlanCache.get(userId) || [];
    const updatedUserPlans = userPlans.map((p) => {
      if (p.id !== planId) return p;
      return {
        ...p,
        checklist: body.checklist ?? p.checklist,
        progressPercent: progress ?? p.progressPercent,
        studyMinutesSpent: body.studyMinutesSpent ?? p.studyMinutesSpent,
        status: body.status ?? p.status,
        examDate: body.examDate ?? p.examDate,
        topics: body.topics ?? p.topics,
        cheatsheet: body.cheatsheet ?? p.cheatsheet,
      };
    });
    localPlanCache.set(userId, updatedUserPlans);

    const found = updatedUserPlans.find((p) => p.id === planId);
    res.json({ success: true, plan: found || { id: planId, progressPercent: progress } });
  }),
);

// ────────────────────────────────────────────────────────────────
// DELETE /api/v1/ct/plans/:id - Delete / archive a CT study plan
// ────────────────────────────────────────────────────────────────
ct.delete(
  "/plans/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const planId = req.params.id;

    try {
      await admin.from("ct_study_plans").delete().eq("id", planId).eq("user_id", userId);
    } catch {
      // Ignore
    }

    try {
      await admin.from("user_goals").delete().eq("id", planId).eq("user_id", userId);
    } catch {
      // Ignore
    }

    const userPlans = localPlanCache.get(userId) || [];
    localPlanCache.set(
      userId,
      userPlans.filter((p) => p.id !== planId),
    );

    res.json({ success: true, id: planId });
  }),
);

// ────────────────────────────────────────────────────────────────
// POST /api/v1/ct/plans/:id/log-study - Record a completed study block
// ────────────────────────────────────────────────────────────────
ct.post(
  "/plans/:id/log-study",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const planId = req.params.id;
    const { minutes } = z.object({ minutes: z.number().int().min(1).max(360) }).parse(req.body);

    const userPlans = localPlanCache.get(userId) || [];
    const plan = userPlans.find((p) => p.id === planId);
    const newTotal = (plan?.studyMinutesSpent || 0) + minutes;

    if (plan) {
      plan.studyMinutesSpent = newTotal;
    }

    try {
      await admin
        .from("ct_study_plans")
        .update({ study_minutes_spent: newTotal })
        .eq("id", planId)
        .eq("user_id", userId);
    } catch {
      // Ignore
    }

    res.json({ success: true, studyMinutesSpent: newTotal, loggedMinutes: minutes });
  }),
);

// ────────────────────────────────────────────────────────────────
// POST /api/v1/ct/ai/generate-plan - Real Gemini AI CT Study Planner
// ────────────────────────────────────────────────────────────────
ct.post(
  "/ai/generate-plan",
  wrap(async (req, res) => {
    const {
      subject,
      topics,
      availableHours,
      examDate,
      targetGoal,
      difficulty,
      examFormat,
      weakAreas,
    } = z
      .object({
        subject: z.string().min(2).max(120),
        topics: z.array(z.string()).min(1),
        availableHours: z.number().min(1).max(100).default(6),
        examDate: z.string().optional(),
        targetGoal: z.enum(["ace", "mastery", "pass", "revision"]).default("mastery"),
        difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
        examFormat: z.enum(["mcq", "written", "mixed", "problem_solving"]).default("mixed"),
        weakAreas: z.array(z.string()).optional(),
      })
      .parse(req.body);

    const totalMinutes = availableHours * 60;

    const systemInstruction = `You are the SkillBridge Senior Academic Co-Pilot & Class Test (CT) Strategist for university and college engineering/science students.
Generate a deeply customized, scientifically-backed study preparation roadmap for an upcoming Class Test.
Use active recall, cognitive load theory, and structured Pomodoro focus blocks.
The student has ${availableHours} total study hours (${totalMinutes} minutes) to prepare for this CT.
Output strictly valid JSON with no markdown backticks or commentary outside JSON.`;

    const userPrompt = `Subject: ${subject}
Topics to Cover: ${topics.join(", ")}
Available Study Hours: ${availableHours} hours (${totalMinutes} minutes)
Exam Date: ${examDate || "Upcoming in 3 days"}
Target Goal: ${targetGoal} (ace = 100% full marks, mastery = 85%+ solid, pass = core concepts only, revision = rapid speed-test)
Student Level: ${difficulty}
Exam Format: ${examFormat}
Known Weak Areas: ${weakAreas && weakAreas.length > 0 ? weakAreas.join(", ") : "None specified"}

Generate a comprehensive Class Test preparation roadmap JSON with this exact structure:
{
  "subject": "${subject}",
  "totalHours": ${availableHours},
  "overallStrategy": "2-3 high-leverage sentences explaining the exact study tactic to maximize CT marks for this specific subject and topics",
  "schedule": [
    {
      "dayOrBlock": "Block 1 (60m Pomodoro)",
      "topic": "Specific Topic Name",
      "sessionType": "deep_theory",
      "durationMinutes": 60,
      "priority": "high",
      "focus": "Specific equations, theorems, mechanisms, or problem types to master",
      "practiceQuestionsCount": 5,
      "activeRecallPrompt": "A concrete conceptual self-test question the student must answer out loud before moving to the next block"
    }
  ],
  "recommendedChecklist": [
    {
      "id": "task_1",
      "title": "Actionable task description with concrete deliverables",
      "topic": "Related Topic Name",
      "priority": "high",
      "estMinutes": 35,
      "completed": false
    }
  ],
  "cheatsheet": [
    {
      "topic": "Related Topic",
      "concept": "Crucial Theorem or Law Name",
      "formulaOrRule": "Exact mathematical formula, algorithm complexity, or governing rule",
      "mnemonicOrTip": "Quick memory hack, unit check, or rule of thumb for the exam"
    }
  ],
  "examTraps": [
    {
      "topic": "Topic Name",
      "commonMistake": "Frequent mistake students make that examiners specifically penalize in CTs",
      "howToAvoid": "How to verify and avoid this mistake during the exam"
    }
  ],
  "aiTips": [
    "4-5 concrete, subject-specific study tips tailored to ${subject} and the provided topics"
  ]
}`;

    try {
      const aiResult = await geminiKeyManager.generateJson<{
        subject: string;
        totalHours: number;
        overallStrategy: string;
        schedule: StudyBlock[];
        recommendedChecklist: ChecklistItem[];
        cheatsheet: CheatsheetItem[];
        examTraps: ExamTrap[];
        aiTips: string[];
      }>(userPrompt, {
        systemInstruction,
        temperature: 0.3,
        timeoutMs: 25_000,
      });

      const data = aiResult.data;

      // Validate that essential fields exist in Gemini response
      if (
        data &&
        Array.isArray(data.schedule) &&
        data.schedule.length > 0 &&
        Array.isArray(data.recommendedChecklist) &&
        data.recommendedChecklist.length > 0
      ) {
        return res.json({
          subject: data.subject || subject,
          totalHours: data.totalHours || availableHours,
          overallStrategy: data.overallStrategy || "Focus on high-yield exam patterns and active self-testing.",
          schedule: data.schedule,
          recommendedChecklist: data.recommendedChecklist.map((c, i) => ({
            id: c.id || `task_${i + 1}`,
            title: c.title,
            topic: c.topic || topics[i % topics.length],
            priority: c.priority || "medium",
            estMinutes: c.estMinutes || 30,
            completed: false,
          })),
          cheatsheet: data.cheatsheet || [],
          examTraps: data.examTraps || [],
          aiTips: data.aiTips && data.aiTips.length > 0 ? data.aiTips : [
            "Use active recall over passive reading.",
            "Write out formulas on blank paper without looking.",
            "Time your practice problems to match CT exam pace.",
          ],
          isAiGenerated: true,
          aiModel: aiResult.modelUsed,
        });
      }

      throw new Error("Gemini returned incomplete plan structure");
    } catch (err: any) {
      logger.warn(
        { err: err?.message || err, subject },
        "[CT Router] Gemini plan generation failed, falling back to smart heuristic generator",
      );

      // Graceful, intelligent fallback so user is NEVER left stranded
      const fallback = generateHeuristicPlan(subject, topics, availableHours, targetGoal, difficulty);
      return res.json(fallback);
    }
  }),
);

// ────────────────────────────────────────────────────────────────
// POST /api/v1/ct/ai/mock-quiz - Instant AI-Generated Diagnostic CT Quiz
// ────────────────────────────────────────────────────────────────
ct.post(
  "/ai/mock-quiz",
  wrap(async (req, res) => {
    const { subject, topics, questionCount, difficulty } = z
      .object({
        subject: z.string().min(2),
        topics: z.array(z.string()).min(1),
        questionCount: z.number().int().min(1).max(20).default(5),
        difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
      })
      .parse(req.body);

    const prompt = `Subject: ${subject}
Topics: ${topics.join(", ")}
Difficulty: ${difficulty}
Question Count: ${questionCount}

Generate a realistic, high-yield diagnostic Class Test (CT) practice quiz with ${questionCount} questions.
Include conceptual problem-solving, numericals, and core definitions.
Output strictly valid JSON with this format:
{
  "questions": [
    {
      "id": "q1",
      "topic": "Topic Name",
      "question": "Question text with clear premise",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Concise step-by-step reasoning for why this option is correct and why others are wrong",
      "difficulty": "${difficulty}"
    }
  ]
}`;

    try {
      const aiResult = await geminiKeyManager.generateJson<{
        questions: Array<{
          id: string;
          topic: string;
          question: string;
          options: string[];
          correctIndex: number;
          explanation: string;
          difficulty: string;
        }>;
      }>(prompt, {
        systemInstruction: "You are an expert university professor creating diagnostic Class Test questions.",
        temperature: 0.2,
        timeoutMs: 20_000,
      });

      if (aiResult.data?.questions?.length) {
        return res.json({ questions: aiResult.data.questions });
      }
      throw new Error("Empty questions generated");
    } catch (err: any) {
      logger.warn({ err: err?.message }, "[CT Router] Mock quiz fallback");
      // Fallback questions
      const fallbackQuestions = topics.slice(0, questionCount).map((topic, i) => ({
        id: `fb_q_${i + 1}`,
        topic,
        question: `In the study of ${topic} for ${subject}, what is the primary condition or governing relationship?`,
        options: [
          `Satisfies boundary equilibrium and core conservation laws in ${topic}`,
          `Only applies when ambient temperature is below absolute zero`,
          `Violates standard time-complexity constraints`,
          `Independent of input parameters or system state`,
        ],
        correctIndex: 0,
        explanation: `In ${topic}, standard solutions always depend on boundary equilibrium and fundamental governing laws.`,
        difficulty,
      }));

      return res.json({ questions: fallbackQuestions });
    }
  }),
);

// ────────────────────────────────────────────────────────────────
// POST /api/v1/ct/ai/cheatsheet - Rapid Revision Flashcards / Formulas
// ────────────────────────────────────────────────────────────────
ct.post(
  "/ai/cheatsheet",
  wrap(async (req, res) => {
    const { subject, topics } = z
      .object({
        subject: z.string().min(2),
        topics: z.array(z.string()).min(1),
      })
      .parse(req.body);

    const prompt = `Subject: ${subject}
Topics: ${topics.join(", ")}

Generate a high-yield formula cheatsheet and rapid revision flashcards for these topics before an upcoming Class Test.
Output JSON:
{
  "cheatsheet": [
    {
      "id": "card_1",
      "topic": "Topic Name",
      "title": "Core Formula / Principle",
      "formulaOrKeyRule": "Mathematical expression or algorithmic law",
      "explanation": "Clear explanation of each variable and where this formula applies",
      "examTip": "Common trap or shortcut examiners test"
    }
  ]
}`;

    try {
      const aiResult = await geminiKeyManager.generateJson<{
        cheatsheet: Array<{
          id: string;
          topic: string;
          title: string;
          formulaOrKeyRule: string;
          explanation: string;
          examTip: string;
        }>;
      }>(prompt, {
        temperature: 0.2,
        timeoutMs: 20_000,
      });

      if (aiResult.data?.cheatsheet?.length) {
        return res.json({ cheatsheet: aiResult.data.cheatsheet });
      }
      throw new Error("Empty cheatsheet generated");
    } catch {
      const fallbackCards = topics.map((topic, idx) => ({
        id: `card_${idx + 1}`,
        topic,
        title: `Key Formula / Invariant for ${topic}`,
        formulaOrKeyRule: `Fundamental theorem of ${topic}`,
        explanation: `Always remember to define system boundaries and initial conditions for ${topic}.`,
        examTip: `Double-check your units and check asymptotic bounds for ${topic}.`,
      }));

      return res.json({ cheatsheet: fallbackCards });
    }
  }),
);
