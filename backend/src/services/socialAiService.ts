/**
 * SkillBridge Social AI Writing Assistance Service
 * ------------------------------------------------
 * Helps students refine posts, improve tone, suggest academic hashtags,
 * and fix grammar using Gemini AI.
 *
 * NOTE: AI NEVER auto-publishes. Suggestions are strictly returned to the client
 * for user inspection, approval, or insertion.
 */

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { geminiKeyManager } from "./geminiKeyManager.js";

export type SocialAiAction =
  | "improve"
  | "concise"
  | "professional"
  | "grammar"
  | "hashtags"
  | "summarize"
  | "title";

export interface SocialAiResponse {
  result: string;
  hashtags?: string[];
  action: SocialAiAction;
}

export async function processSocialAiAssist(
  action: SocialAiAction,
  text: string,
  context?: string,
): Promise<SocialAiResponse> {
  const prompt = buildPrompt(action, text, context);

  try {
    const response = await geminiKeyManager.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 600,
      },
      preferredModel: "gemini-flash-latest",
      timeoutMs: 8000,
    });

    const rawResult: string = response.text.trim();

    if (!rawResult) {
      return getHeuristicFallback(action, text);
    }

    if (action === "hashtags") {
      const tags = Array.from(new Set(rawResult.match(/#[A-Za-z0-9_]+/g) || []));
      return {
        result: tags.join(" "),
        hashtags: tags,
        action,
      };
    }

    return {
      result: rawResult.replace(/^["']|["']$/g, "").trim(),
      action,
    };
  } catch (err) {
    logger.warn({ err }, "Social AI Assist fetch error, falling back to heuristics");
    return getHeuristicFallback(action, text);
  }
}

function buildPrompt(action: SocialAiAction, text: string, context?: string): string {
  const ctx = context ? ` Context: ${context}.` : "";
  switch (action) {
    case "improve":
      return `You are an expert university writing assistant for SkillBridge social feed. Rewrite the following post to make it more engaging, articulate, and clear for college peers while keeping the author's original voice.${ctx} Return ONLY the revised post text without quotes or explanations:\n\n${text}`;
    case "concise":
      return `Make the following text clear, punchy, and concise without losing important facts or links.${ctx} Return ONLY the shortened text:\n\n${text}`;
    case "professional":
      return `Rewrite the following post into an academic and professional tone suitable for a university community announcement or achievement showcase.${ctx} Return ONLY the rewritten text:\n\n${text}`;
    case "grammar":
      return `Fix all grammatical errors, spelling mistakes, and punctuation issues in the following text while preserving its exact tone and vocabulary.${ctx} Return ONLY the corrected text:\n\n${text}`;
    case "hashtags":
      return `Analyze the following campus post and generate 4 to 6 highly relevant, specific hashtags formatted as #Tag (e.g. #ComputerScience #Algorithm #RUET #StudyGroup).${ctx} Return ONLY the hashtags separated by space:\n\n${text}`;
    case "summarize":
      return `Summarize the key takeaway of this post in 1-2 compelling sentences for students:${ctx} Return ONLY the summary:\n\n${text}`;
    case "title":
      return `Generate a catchy, concise 4-8 word title for this post:${ctx} Return ONLY the title text:\n\n${text}`;
    default:
      return `Polish this text:\n\n${text}`;
  }
}

function getHeuristicFallback(action: SocialAiAction, text: string): SocialAiResponse {
  switch (action) {
    case "hashtags": {
      const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const unique = Array.from(new Set(words)).slice(0, 4);
      const tags = unique.map((w) => `#${w.charAt(0).toUpperCase() + w.slice(1)}`);
      if (tags.length === 0) tags.push("#SkillBridge", "#CampusLife");
      return { result: tags.join(" "), hashtags: tags, action };
    }
    case "title": {
      const firstLine = text.split("\n")[0] || text;
      const title = firstLine.slice(0, 50).trim();
      return { result: title || "Campus Update", action };
    }
    case "summarize": {
      const sentences = text.split(/[.!?]+/).filter(Boolean);
      const summary = (sentences[0] || text).slice(0, 140).trim() + ".";
      return { result: summary, action };
    }
    default:
      return {
        result: text.trim(),
        action,
      };
  }
}
