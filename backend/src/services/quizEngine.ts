/**
 * SkillBridge Quiz Engine
 * -----------------------
 * Server-authoritative AI-powered assessment service.
 *
 * Security model:
 *   - Answer keys NEVER leave the server
 *   - Sessions are signed with HMAC
 *   - Grading is 100% server-side
 *   - Questions are generated + validated server-side before serving
 */

import { createHmac, randomBytes } from "crypto";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { geminiKeyManager } from "./geminiKeyManager.js";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type BloomLevel =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate"
  | "create";

export type DifficultyLevel = "easy" | "medium" | "hard";

export interface GeneratedQuestion {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number; // NEVER sent to client
  bloom_level: BloomLevel;
  difficulty: DifficultyLevel;
  explanation: string;
  topic_tag: string;
}

export interface QuizSession {
  session_id: string;
  user_id: string;
  skill_id: string;
  skill_name: string;
  topic: string;
  difficulty: DifficultyLevel;
  questions: GeneratedQuestion[];
  client_questions: ClientQuestion[];
  started_at: string;
  expires_at: string;
  hmac_signature: string;
  violation_count: number;
  max_violations: number;
  time_limit_seconds: number;
}

export interface ClientQuestion {
  id: string;
  prompt: string;
  options: string[];
  bloom_level: BloomLevel;
  difficulty: DifficultyLevel;
  topic_tag: string;
}

export interface GradingResult {
  score: number;
  passed: boolean;
  correct_count: number;
  total_count: number;
  question_results: QuestionResult[];
  bloom_breakdown: Record<BloomLevel, { correct: number; total: number }>;
  pass_threshold: number;
  integrity_ok: boolean;
}

export interface QuestionResult {
  question_id: string;
  prompt: string;
  your_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
  bloom_level: BloomLevel;
  difficulty: DifficultyLevel;
}

// ────────────────────────────────────────────────────────────────
// In-memory session store
// ────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 90 * 60 * 1000;
const sessionStore = new Map<string, QuizSession>();

const sessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessionStore.entries()) {
    if (new Date(session.expires_at).getTime() < now) {
      sessionStore.delete(id);
    }
  }
}, 5 * 60 * 1000);

if (sessionCleanupTimer && typeof sessionCleanupTimer.unref === "function") {
  sessionCleanupTimer.unref();
}

// ────────────────────────────────────────────────────────────────
// HMAC session signing
// ────────────────────────────────────────────────────────────────

const SESSION_SECRET = env.QUIZ_SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 32);

function signSession(sessionId: string, userId: string, expiresAt: string): string {
  return createHmac("sha256", SESSION_SECRET)
    .update(`${sessionId}:${userId}:${expiresAt}`)
    .digest("hex");
}

function verifySession(session: QuizSession): boolean {
  const expected = signSession(session.session_id, session.user_id, session.expires_at);
  return session.hmac_signature === expected;
}

// ────────────────────────────────────────────────────────────────
// Gemini API call (with multi-key failover pool)
// ────────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  const result = await geminiKeyManager.generateContent({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.9,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
    preferredModel: "gemini-flash-latest",
  });

  if (!result.text) throw new Error("Gemini returned empty response");
  return result.text;
}

// ────────────────────────────────────────────────────────────────
// Question generation prompt
// ────────────────────────────────────────────────────────────────

function buildPrompt(
  skillName: string,
  topic: string,
  difficulty: DifficultyLevel,
  count: number,
  contextInfo?: string
): string {
  const guide: Record<DifficultyLevel, string> = {
    easy: "basic definitions, direct recall, simple comprehension (Bloom: Remember, Understand)",
    medium: "application, interpretation, problem-solving (Bloom: Apply, Analyze)",
    hard: "critical evaluation, design, synthesis, edge cases (Bloom: Evaluate, Create)",
  };
  const bloomMap: Record<DifficultyLevel, string> = {
    easy: "remember, understand",
    medium: "apply, analyze",
    hard: "evaluate, create",
  };

  return `You are an expert academic assessment designer for university students studying "${skillName}".

Generate exactly ${count} multiple-choice questions on the topic: "${topic}".
Difficulty: ${difficulty.toUpperCase()} — ${guide[difficulty]}
Focus Bloom levels: ${bloomMap[difficulty]}
${contextInfo ? `Specific user conditions, syllabus, and focus requirements: "${contextInfo}"\n` : ""}
Rules:
1. Each question prompt must be clear and academically rigorous (min 15 chars).
2. Provide EXACTLY 4 options per question.
3. Exactly ONE option is correct. The other 3 are plausible distractors.
4. Distractors must represent real misconceptions, NOT obviously wrong answers.
5. Do NOT include A/B/C/D labels inside option text.
6. correct_index is 0-based. Vary which index (0,1,2,3) is correct across questions.
7. Provide a clear explanation for the correct answer.
8. topic_tag: 1-3 word sub-topic.
9. Every question must test a DIFFERENT concept. No repetition.

Respond ONLY with a valid JSON array, no markdown:

[
  {
    "prompt": "...",
    "options": ["...", "...", "...", "..."],
    "correct_index": 2,
    "bloom_level": "apply",
    "difficulty": "${difficulty}",
    "explanation": "...",
    "topic_tag": "..."
  }
]`;
}

// ────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────

function validateQuestion(raw: any, idx: number): GeneratedQuestion | null {
  try {
    if (typeof raw.prompt !== "string" || raw.prompt.trim().length < 10) return null;
    if (!Array.isArray(raw.options) || raw.options.length !== 4) return null;
    if (!raw.options.every((o: any) => typeof o === "string" && o.trim().length > 0)) return null;

    const ci = Number(raw.correct_index);
    if (!Number.isInteger(ci) || ci < 0 || ci > 3) return null;

    const uniqueOpts = new Set((raw.options as string[]).map((o) => o.trim().toLowerCase()));
    if (uniqueOpts.size < 4) return null;

    const validBlooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
    const validDiffs: DifficultyLevel[] = ["easy", "medium", "hard"];
    const bloom = (raw.bloom_level as string)?.toLowerCase() as BloomLevel;
    const diff = (raw.difficulty as string)?.toLowerCase() as DifficultyLevel;

    return {
      id: randomBytes(16).toString("hex"),
      prompt: (raw.prompt as string).trim(),
      options: (raw.options as string[]).map((o) => o.trim()),
      correct_index: ci,
      bloom_level: validBlooms.includes(bloom) ? bloom : "understand",
      difficulty: validDiffs.includes(diff) ? diff : "medium",
      explanation: typeof raw.explanation === "string" ? raw.explanation.trim() : "See course materials.",
      topic_tag: typeof raw.topic_tag === "string" ? raw.topic_tag.trim().slice(0, 40) : "General",
    };
  } catch {
    logger.warn({ idx }, "Quiz validation threw");
    return null;
  }
}

function dedup(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const key = q.prompt.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ────────────────────────────────────────────────────────────────
// Public: Generate session
// ────────────────────────────────────────────────────────────────

export interface GenerateSessionOptions {
  userId: string;
  skillId: string;
  skillName: string;
  topic: string;
  difficulty: DifficultyLevel;
  questionCount?: number;
  timeLimitSeconds?: number;
  maxViolations?: number;
  contextInfo?: string;
}

export async function generateQuizSession(opts: GenerateSessionOptions): Promise<QuizSession> {
  const {
    userId, skillId, skillName, topic, difficulty,
    questionCount = 10,
    timeLimitSeconds = 900,
    maxViolations = 3,
    contextInfo,
  } = opts;

  const target = Math.min(Math.max(questionCount, 5), 20);
  const prompt = buildPrompt(skillName, topic, difficulty, target + 3, contextInfo);

  let rawText: string;
  try {
    rawText = await callGemini(prompt);
  } catch (err) {
    logger.error({ err, skillName, topic }, "Gemini quiz generation failed");
    throw new Error("AI question generation is temporarily unavailable. Please try again shortly.");
  }

  let rawArr: any[];
  try {
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    rawArr = JSON.parse(cleaned);
    if (!Array.isArray(rawArr)) throw new Error("Not array");
  } catch (err) {
    logger.error({ err, snippet: rawText.slice(0, 300) }, "Parse Gemini response failed");
    throw new Error("AI returned malformed questions. Please try again.");
  }

  const validated = rawArr.map((q, i) => validateQuestion(q, i)).filter((q): q is GeneratedQuestion => q !== null);
  const final = dedup(validated).slice(0, target);

  if (final.length < 5) {
    throw new Error("Could not generate enough valid questions for this topic. Try a different topic.");
  }

  const sessionId = randomBytes(20).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const sig = signSession(sessionId, userId, expiresAt);

  const clientQuestions: ClientQuestion[] = final.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options,
    bloom_level: q.bloom_level,
    difficulty: q.difficulty,
    topic_tag: q.topic_tag,
  }));

  const session: QuizSession = {
    session_id: sessionId,
    user_id: userId,
    skill_id: skillId,
    skill_name: skillName,
    topic,
    difficulty,
    questions: final,
    client_questions: clientQuestions,
    started_at: now.toISOString(),
    expires_at: expiresAt,
    hmac_signature: sig,
    violation_count: 0,
    max_violations: maxViolations,
    time_limit_seconds: timeLimitSeconds,
  };

  sessionStore.set(sessionId, session);
  logger.info({ sessionId, userId, skillName, count: final.length }, "Quiz session created");
  return session;
}

// ────────────────────────────────────────────────────────────────
// Public: Get session
// ────────────────────────────────────────────────────────────────

export function getQuizSession(sessionId: string, userId: string): QuizSession | null {
  const s = sessionStore.get(sessionId);
  if (!s || s.user_id !== userId) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) {
    sessionStore.delete(sessionId);
    return null;
  }
  if (!verifySession(s)) {
    logger.warn({ sessionId, userId }, "HMAC verification failed");
    return null;
  }
  return s;
}

// ────────────────────────────────────────────────────────────────
// Public: Record violation
// ────────────────────────────────────────────────────────────────

export function recordViolation(
  sessionId: string,
  userId: string
): { violation_count: number; max_violations: number; terminated: boolean } | null {
  const s = getQuizSession(sessionId, userId);
  if (!s) return null;
  s.violation_count += 1;
  const terminated = s.violation_count >= s.max_violations;
  if (terminated) {
    sessionStore.delete(sessionId);
    logger.warn({ sessionId, userId, violations: s.violation_count }, "Session terminated: max violations");
  }
  return { violation_count: s.violation_count, max_violations: s.max_violations, terminated };
}

// ────────────────────────────────────────────────────────────────
// Public: Grade
// ────────────────────────────────────────────────────────────────

export function gradeSubmission(
  session: QuizSession,
  answers: Record<string, number>,
  passThreshold = 80
): GradingResult {
  const bloomBreakdown: Record<BloomLevel, { correct: number; total: number }> = {
    remember: { correct: 0, total: 0 },
    understand: { correct: 0, total: 0 },
    apply: { correct: 0, total: 0 },
    analyze: { correct: 0, total: 0 },
    evaluate: { correct: 0, total: 0 },
    create: { correct: 0, total: 0 },
  };

  let correctCount = 0;
  const questionResults: QuestionResult[] = session.questions.map((q) => {
    const chosen = answers[q.id];
    const isCorrect = typeof chosen === "number" && chosen === q.correct_index;
    bloomBreakdown[q.bloom_level].total += 1;
    if (isCorrect) { bloomBreakdown[q.bloom_level].correct += 1; correctCount += 1; }
    return {
      question_id: q.id,
      prompt: q.prompt,
      your_answer: typeof chosen === "number" ? (q.options[chosen] ?? "Not answered") : "Not answered",
      correct_answer: q.options[q.correct_index] ?? "",
      is_correct: isCorrect,
      explanation: q.explanation,
      bloom_level: q.bloom_level,
      difficulty: q.difficulty,
    };
  });

  const score = Math.round((correctCount / session.questions.length) * 100);
  return {
    score,
    passed: score >= passThreshold,
    correct_count: correctCount,
    total_count: session.questions.length,
    question_results: questionResults,
    bloom_breakdown: bloomBreakdown,
    pass_threshold: passThreshold,
    integrity_ok: verifySession(session),
  };
}

// ────────────────────────────────────────────────────────────────
// Public: Invalidate
// ────────────────────────────────────────────────────────────────

export function invalidateSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}
