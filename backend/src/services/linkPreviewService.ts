/**
 * SkillBridge Link Preview Service
 * --------------------------------
 * Securely extracts OpenGraph and meta preview data from external URLs.
 * Strict SSRF protection and timeouts.
 */

import { logger } from "../lib/logger.js";

export interface LinkMetadata {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

// Private/reserved IPv4 & IPv6 patterns for SSRF prevention
const BLOCKED_IP_REGEX = /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1|fe80:|fc00:|fd00:)/i;
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "instance-data"]);

function isPrivateIpOrHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (BLOCKED_HOSTS.has(lower)) return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  if (BLOCKED_IP_REGEX.test(lower)) return true;

  // Check 172.16.0.0 - 172.31.255.255
  const parts = lower.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const num0 = parseInt(parts[0]!, 10);
    const num1 = parseInt(parts[1]!, 10);
    if (num0 === 172 && num1 >= 16 && num1 <= 31) return true;
  }

  return false;
}

function sanitizeMetaString(text: string | null | undefined, maxLen = 300): string | null {
  if (!text) return null;
  // Strip HTML tags and normalize whitespace
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, maxLen) : null;
}

export async function fetchLinkMetadata(rawUrl: string): Promise<LinkMetadata | null> {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    if (isPrivateIpOrHost(parsed.hostname)) {
      logger.warn({ hostname: parsed.hostname }, "SSRF prevention blocked URL fetch");
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "SkillBridge-SocialBot/2.0 (+https://skillbridge.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    // Limit read to 512KB
    const reader = res.body?.getReader();
    if (!reader) return null;

    let html = "";
    let bytesRead = 0;
    const maxBytes = 512 * 1024;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      bytesRead += value.length;
      html += new TextDecoder().decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }

    // Extract tags
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i);
    const standardTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const title = ogTitleMatch?.[1] || twitterTitleMatch?.[1] || standardTitleMatch?.[1] || null;

    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    const twitterDescMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i);
    const standardDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

    const description = ogDescMatch?.[1] || twitterDescMatch?.[1] || standardDescMatch?.[1] || null;

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);

    let rawImage = ogImageMatch?.[1] || twitterImageMatch?.[1] || null;
    let image: string | null = null;
    if (rawImage) {
      try {
        image = new URL(rawImage, parsed.origin).toString();
      } catch {
        image = null;
      }
    }

    const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
    const site_name = siteNameMatch?.[1] || parsed.hostname.replace(/^www\./, "");

    return {
      url: parsed.toString(),
      title: sanitizeMetaString(title, 200),
      description: sanitizeMetaString(description, 300),
      image,
      site_name: sanitizeMetaString(site_name, 80),
    };
  } catch (err) {
    logger.debug({ err, rawUrl }, "Link preview fetch failed or timed out");
    return null;
  }
}
