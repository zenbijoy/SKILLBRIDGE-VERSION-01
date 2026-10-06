import type { PostAppearance, SocialPost } from "../types";
import { VISUAL_THEMES } from "../constants";

export interface ResolvedAppearance {
  /** Gradient stops used for the post background. */
  gradient: [string, string, ...string[]];
  /** Flat colour fallback (also used for borders / pressed states). */
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  borderColor?: string;
  /** True when the author did not pick a custom background. */
  isDefault: boolean;
}

const DEFAULT_APPEARANCE: ResolvedAppearance = {
  gradient: ["transparent", "transparent"],
  backgroundColor: "transparent",
  textColor: "",
  accentColor: "",
  isDefault: true,
};

/**
 * Resolves the author-picked post background (Facebook-style themed posts).
 * Returns a default (no-op) appearance when nothing was selected.
 */
export function resolvePostAppearance(appearance?: PostAppearance): ResolvedAppearance {
  if (!appearance) return DEFAULT_APPEARANCE;

  const themeId = appearance.theme;
  if (!themeId || themeId === "default") return DEFAULT_APPEARANCE;

  const preset = VISUAL_THEMES.find((t) => t.id === themeId);
  if (!preset) return DEFAULT_APPEARANCE;

  return {
    gradient: preset.gradientColors,
    backgroundColor: preset.gradientColors[1] || preset.gradientColors[0],
    textColor: appearance.textColor || preset.textColor,
    accentColor: preset.accentColor,
    borderColor: preset.borderColor,
    isDefault: false,
  };
}

export type InlineTokenType =
  | "text"
  | "bold"
  | "italic"
  | "code"
  | "link"
  | "hashtag"
  | "mention"
  | "url";

export interface InlineToken {
  type: InlineTokenType;
  value: string;
  href?: string;
}

const DOMAIN_TAIL =
  /^[a-zA-Z0-9-]+\.(?:com|ai|org|net|edu|io|app|dev|co|bd)(?:\/[^\s]*)?$/i;

/**
 * Inline markdown tokenizer.
 *
 * NOTE: this deliberately avoids `String.split(regex)`. The tokenizer pattern
 * needs nested capture groups (e.g. a bare-domain alternative inside the URL
 * branch), and `split` interleaves every capture group into the output array —
 * which duplicated and mangled the rendered text (the "output is not visible"
 * bug). This scanner emits exactly one token per consumed chunk.
 */
export function tokenizeInline(rawText: string): InlineToken[] {
  if (!rawText) return [];

  const tokens: InlineToken[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  let i = 0;
  while (i < rawText.length) {
    const rest = rawText.slice(i);

    // Inline code: `code`
    if (rawText[i] === "`") {
      const end = rest.indexOf("`", 1);
      if (end > 1) {
        flush();
        tokens.push({ type: "code", value: rest.slice(1, end) });
        i += end + 1;
        continue;
      }
    }

    // Bold: **text**
    if (rawText.startsWith("**", i)) {
      const end = rest.indexOf("**", 2);
      if (end > 2) {
        flush();
        tokens.push({ type: "bold", value: rest.slice(2, end) });
        i += end + 2;
        continue;
      }
    }

    // Italic: *text*
    if (rawText[i] === "*") {
      const end = rest.indexOf("*", 1);
      if (end > 1) {
        flush();
        tokens.push({ type: "italic", value: rest.slice(1, end) });
        i += end + 1;
        continue;
      }
    }

    // Markdown link: [label](href)
    if (rawText[i] === "[") {
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (match) {
        flush();
        tokens.push({ type: "link", value: match[1]!, href: match[2]! });
        i += match[0].length;
        continue;
      }
    }

    // URL with an explicit scheme
    if (rest.startsWith("http://") || rest.startsWith("https://")) {
      const match = /^https?:\/\/[^\s]+/.exec(rest);
      if (match) {
        flush();
        tokens.push({ type: "url", value: match[0], href: match[0] });
        i += match[0].length;
        continue;
      }
    }

    // Bare domain or www host
    const domainMatch =
      /^(?:www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/.exec(rest);
    if (domainMatch && DOMAIN_TAIL.test(domainMatch[0])) {
      flush();
      tokens.push({
        type: "url",
        value: domainMatch[0],
        href: `https://${domainMatch[0]}`,
      });
      i += domainMatch[0].length;
      continue;
    }

    // Hashtag: #tag (ASCII + Bengali)
    if (rawText[i] === "#") {
      const match = /^#[a-zA-Z0-9_\u0980-\u09FF]+/.exec(rest);
      if (match) {
        flush();
        tokens.push({ type: "hashtag", value: match[0] });
        i += match[0].length;
        continue;
      }
    }

    // Mention: @username
    if (rawText[i] === "@") {
      const match = /^@[a-zA-Z0-9_.]+/.exec(rest);
      if (match) {
        flush();
        tokens.push({ type: "mention", value: match[0] });
        i += match[0].length;
        continue;
      }
    }

    buffer += rawText[i];
    i += 1;
  }

  flush();
  return tokens;
}

const HASHTAG_RE = /#([a-zA-Z0-9_\u0980-\u09FF]+)/g;
const MENTION_RE = /@([a-zA-Z0-9_.]+)/g;

/** Extracts unique hashtags (without the leading `#`) from raw post text. */
export function extractHashtags(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  HASHTAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HASHTAG_RE.exec(text || "")) !== null) {
    const tag = m[1]!;
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

/** Extracts unique @usernames referenced in raw post text. */
export function extractMentionUsernames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text || "")) !== null) {
    const username = m[1]!.replace(/[._]+$/, "");
    if (!username) continue;
    const key = username.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(username);
    }
  }
  return out;
}

/** True when the post carries a custom (non-default) background theme. */
export function hasCustomPostBackground(
  post: Pick<SocialPost, "appearance">,
): boolean {
  return !resolvePostAppearance(post.appearance).isDefault;
}