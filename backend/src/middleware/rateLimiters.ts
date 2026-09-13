import { rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";

/**
 * User-Aware Rate Limiting Key Generator:
 * Uses req.userId for authenticated users to avoid NAT throttling on campus WiFi networks.
 * Falls back to IP address for unauthenticated requests.
 */
export function userOrIpKey(prefix: string) {
  return (req: Request): string => {
    const identifier = req.userId ? `u:${req.userId}` : `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
    return `${prefix}:${identifier}`;
  };
}

function createLimiter(prefix: string, windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    limit: max,
    keyGenerator: userOrIpKey(prefix),
    validate: { keyGeneratorIpFallback: false, xForwardedForHeader: false },
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req: Request, res: Response, _next, options) => {
      const resetTime = (req as any).rateLimit?.resetTime;
      const retryAfter = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : Math.ceil(windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: message,
        retryAfterSeconds: retryAfter,
        limit: options.limit,
      });
    },
  });
}

// 1. Campus Feed Post Creation: 10 posts per 10 minutes
export const feedPostLimiter = createLimiter(
  "feed_post",
  10 * 60 * 1000,
  10,
  "Post submission limit reached. Please wait a few minutes before posting again.",
);

// 2. Campus Feed Comment Creation: 25 comments per 10 minutes
export const feedCommentLimiter = createLimiter(
  "feed_comment",
  10 * 60 * 1000,
  25,
  "Comment submission limit reached. Please slow down.",
);

// 3. Reactions: 30 reactions per minute
export const feedReactionLimiter = createLimiter(
  "feed_reaction",
  60 * 1000,
  30,
  "Reaction rate limit reached. Please slow down.",
);

// 4. Room Q&A Question Creation: 15 questions per 15 minutes
export const qaQuestionLimiter = createLimiter(
  "qa_question",
  15 * 60 * 1000,
  15,
  "Question submission limit reached. Please wait before asking more questions.",
);

// 5. Room Q&A Answer Creation: 30 answers per 15 minutes
export const qaAnswerLimiter = createLimiter(
  "qa_answer",
  15 * 60 * 1000,
  30,
  "Answer submission limit reached. Please wait before posting more answers.",
);

// 6. Room Recordings Addition: 10 recordings per hour
export const recordingLimiter = createLimiter(
  "recording_add",
  60 * 60 * 1000,
  10,
  "Recording addition limit reached for this study room.",
);

// 7. Storage Upload Ticket Generation: 25 tickets per hour
export const uploadTicketLimiter = createLimiter(
  "upload_ticket",
  60 * 60 * 1000,
  25,
  "Upload ticket generation limit reached. Please wait before uploading more files.",
);

// 8. Club Clash Negotiations: 15 proposals per hour
export const negotiationLimiter = createLimiter(
  "club_negotiation",
  60 * 60 * 1000,
  15,
  "Negotiation proposal limit reached. Please wait before submitting more reschedule proposals.",
);

// 9. Abuse Reports: 10 reports per hour
export const reportLimiter = createLimiter(
  "moderation_report",
  60 * 60 * 1000,
  10,
  "Report submission limit reached. Thank you for keeping the campus safe.",
);

// 10. Event Creation: 15 events per hour
export const eventCreationLimiter = createLimiter(
  "event_create",
  60 * 60 * 1000,
  15,
  "Event scheduling limit reached. Please wait before creating more club events.",
);
