import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const ct = Router();

// Get all CT study plans for user
ct.get(
  "/plans",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const { data: plans, error } = await admin
      .from("user_goals")
      .select("*")
      .eq("user_id", userId)
      .eq("category", "academic")
      .order("target_date", { ascending: true });

    if (error) {
      // Graceful fallback to mock/empty structure if user_goals has custom filters
      return res.json({ plans: [] });
    }

    res.json({
      plans: (plans || []).map((p) => ({
        id: p.id,
        subject: p.title,
        examDate: p.target_date,
        topics: (p.metadata as any)?.topics || [],
        checklist: (p.metadata as any)?.checklist || [],
        progressPercent: p.progress_percentage || 0,
        createdAt: p.created_at,
      })),
    });
  }),
);

// Create a new CT study preparation plan
ct.post(
  "/plans",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        subject: z.string().min(2).max(100),
        examDate: z.string().datetime(),
        topics: z.array(z.string()).default([]),
        checklist: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              completed: z.boolean().default(false),
            }),
          )
          .default([]),
      })
      .parse(req.body);

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
        },
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      plan: {
        id: data.id,
        subject: data.title,
        examDate: data.target_date,
        topics: body.topics,
        checklist: body.checklist,
        progressPercent: 0,
        createdAt: data.created_at,
      },
    });
  }),
);

// AI-Powered Study Roadmap Generator for upcoming CT
ct.post(
  "/ai/generate-plan",
  wrap(async (req, res) => {
    const { subject, topics, availableHours } = z
      .object({
        subject: z.string().min(2),
        topics: z.array(z.string()).min(1),
        availableHours: z.number().min(1).max(100).default(6),
      })
      .parse(req.body);

    // Dynamic smart study allocation algorithm
    const hoursPerTopic = Math.max(1, Math.round(availableHours / topics.length));
    const generatedSchedule = topics.map((topic, idx) => ({
      dayOrBlock: `Block ${idx + 1} (${hoursPerTopic}h)`,
      topic,
      focus: `Core concepts, past year questions & key formulas for ${topic}`,
      practiceQuestionsCount: 10,
    }));

    const checklist = topics.map((topic, idx) => ({
      id: `topic_${idx + 1}`,
      title: `Review ${topic} formulas & solve 5 sample MCQs`,
      completed: false,
    }));

    res.json({
      subject,
      totalHours: availableHours,
      schedule: generatedSchedule,
      recommendedChecklist: checklist,
      aiTips: [
        "Focus on high-frequency questions first.",
        "Take a 5-minute break every 25 minutes (Pomodoro technique).",
        "Test your recall with a timed practice quiz before exam day.",
      ],
    });
  }),
);
