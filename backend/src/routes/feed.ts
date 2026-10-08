import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { NotificationService } from "../services/notificationService.js";
import { feedPostLimiter, feedReactionLimiter, feedCommentLimiter } from "../middleware/rateLimiters.js";
import { logDomainEvent } from "../lib/domainLogger.js";
import { logger } from "../lib/logger.js";
import {
  getStorageProvider,
  registerMediaObject,
  resolveMediaObjectPublicUrl,
} from "../services/storage.js";
import {
  extractYouTubeVideoId,
  fetchYouTubeVideoMetadata,
} from "../services/youtubeService.js";
import { fetchLinkMetadata } from "../services/linkPreviewService.js";
import { processSocialAiAssist, SocialAiAction } from "../services/socialAiService.js";

export const feed = Router();

// Helper to generate scoped anonymous handle
function generateAnonymousHandle(userId: string, entityId: string): string {
  const hash = crypto.createHash("sha256").update(`${userId}-${entityId}-salt2026`).digest("hex");
  return `Anonymous Student #${hash.slice(0, 4).toUpperCase()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRESIGNED UPLOAD TICKETS (Images, Videos, PDFs/Documents)
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/upload-ticket",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const schema = z.object({
      mimeType: z.enum([
        // Images
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        // Videos
        "video/mp4",
        "video/quicktime",
        "video/webm",
        // Documents
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ]),
      fileSizeBytes: z.number().int().positive().max(50 * 1024 * 1024).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Unsupported file type or size. Allowed: Images (up to 15MB), Videos (up to 50MB), PDFs/Documents (up to 25MB).",
      });
    }

    const { mimeType, fileSizeBytes } = parsed.data;

    // Type-specific size checks
    if (mimeType.startsWith("image/") && fileSizeBytes && fileSizeBytes > 15 * 1024 * 1024) {
      return res.status(400).json({ error: "Image size must not exceed 15MB" });
    }
    if (mimeType.startsWith("application/") && fileSizeBytes && fileSizeBytes > 25 * 1024 * 1024) {
      return res.status(400).json({ error: "Document size must not exceed 25MB" });
    }

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "application/pdf": "pdf",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "text/plain": "txt",
    };

    const ext = extMap[mimeType] || "bin";
    const objectKey = `feed/${req.userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const bucket = "resources";

    const mediaObj = await registerMediaObject({
      bucket,
      objectKey,
      mimeType,
      fileSizeBytes: fileSizeBytes || 0,
      uploaderId: req.userId,
      entityType: "post_attachment",
      status: "pending_upload",
    });

    if (!mediaObj) {
      return res.status(500).json({ error: "Failed to initialize media upload ticket" });
    }

    const storage = getStorageProvider();
    const ticket = await storage.signedUpload(bucket, objectKey);

    res.status(201).json({
      ticket: {
        ...ticket,
        mediaObjectId: mediaObj.id,
      },
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 1b. DIRECT INLINE MEDIA UPLOAD (Base64 for Images & Documents)
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/upload",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { fileBase64, contentType, fileName } = z
      .object({
        fileBase64: z.string().min(10),
        contentType: z
          .string()
          .regex(
            /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/i,
            { message: "Unsupported file type" },
          )
          .default("image/jpeg"),
        fileName: z.string().max(160).optional().default("attachment"),
      })
      .parse(req.body);

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "application/pdf": "pdf",
      "text/plain": "txt",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    };

    const ext = extMap[contentType] || "jpg";
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `feed/${req.userId}/${Date.now()}_${crypto.randomUUID()}_${sanitizedName}.${ext}`;
    const bucket = "resources";

    const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
    // Client-side perceptual compression reduces photos to ~250KB; allow up to 15MB for docs/videos
    const maxBytes = 15 * 1024 * 1024;
    if (buffer.byteLength > maxBytes) {
      return res.status(413).json({ error: "File too large. Maximum size is 15MB." });
    }

    const storage = getStorageProvider();
    let targetBucket = bucket;

    try {
      await storage.uploadBuffer(targetBucket, objectKey, buffer, contentType);
    } catch (uploadError) {
      // Fallback to attachments bucket if resources bucket is unavailable
      try {
        await storage.uploadBuffer("attachments", objectKey, buffer, contentType);
        targetBucket = "attachments";
      } catch {
        throw uploadError;
      }
    }

    let publicUrl: string;
    if (storage.name === "r2") {
      publicUrl = resolveMediaObjectPublicUrl({
        bucket: targetBucket,
        object_key: objectKey,
        provider: "r2",
      });
    } else {
      const { data: urlData } = admin.storage.from(targetBucket).getPublicUrl(objectKey);
      publicUrl = urlData.publicUrl;
    }

    const mediaObj = await registerMediaObject({
      bucket: targetBucket,
      objectKey,
      mimeType: contentType,
      fileSizeBytes: buffer.byteLength,
      uploaderId: req.userId,
      entityType: "post_attachment",
      status: "ready",
    });

    res.status(201).json({
      url: publicUrl,
      mediaObjectId: mediaObj?.id || null,
      mimeType: contentType,
      mediaType: contentType.startsWith("video/")
        ? "video"
        : contentType.startsWith("application/")
          ? "document"
          : "image",
      storagePath: objectKey,
      fileSizeBytes: buffer.byteLength,
      fileName,
    });
  }),
);


// ─────────────────────────────────────────────────────────────────────────────
// 2. LINK PREVIEW (SSRF Protected)
// ─────────────────────────────────────────────────────────────────────────────
feed.get(
  "/link-preview",
  wrap(async (req, res) => {
    const rawUrl = req.query.url as string | undefined;
    if (!rawUrl) {
      return res.status(400).json({ error: "URL query parameter is required" });
    }

    const metadata = await fetchLinkMetadata(rawUrl);
    if (!metadata) {
      return res.status(422).json({ error: "Unable to retrieve metadata for this URL" });
    }

    res.json({ preview: metadata });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI WRITING ASSIST (Non-authoritative, advisory only)
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/ai-assist",
  wrap(async (req, res) => {
    const schema = z.object({
      action: z.enum(["improve", "concise", "professional", "grammar", "hashtags", "summarize", "title"]),
      text: z.string().min(3).max(4000),
      context: z.string().max(500).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid AI assist request payload" });
    }

    const { action, text, context } = parsed.data;
    const result = await processSocialAiAssist(action as SocialAiAction, text, context);

    res.json(result);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. USER POST DRAFTS (Cross-device sync & recovery)
// ─────────────────────────────────────────────────────────────────────────────
feed.get(
  "/draft",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { data, error } = await admin
        .from("campus_post_drafts")
        .select("*")
        .eq("user_id", req.userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && !error.message?.includes("does not exist")) throw error;
      res.json({ draft: data || null });
    } catch {
      res.json({ draft: null });
    }
  }),
);

feed.post(
  "/draft",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const body = z
      .object({
        post_type: z.string().default("standard"),
        title: z.string().optional().nullable(),
        body: z.string().max(10000).default(""),
        appearance: z.record(z.string(), z.unknown()).default({}),
        structured_content: z.record(z.string(), z.unknown()).default({ blocks: [] }),
        type_metadata: z.record(z.string(), z.unknown()).default({}),
        attachments: z.array(z.record(z.string(), z.unknown())).default([]),
        visibility: z.string().default("public"),
        is_anonymous: z.boolean().default(false),
      })
      .parse(req.body);

    try {
      // Upsert draft by user_id
      const { data: existing } = await admin
        .from("campus_post_drafts")
        .select("id")
        .eq("user_id", req.userId)
        .maybeSingle();

      let result;
      if (existing) {
        const { data, error } = await admin
          .from("campus_post_drafts")
          .update({
            ...body,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await admin
          .from("campus_post_drafts")
          .insert({
            user_id: req.userId,
            ...body,
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      res.status(200).json({ draft: result });
    } catch (err) {
      // Non-blocking fallback if drafts table is not yet migrated
      res.status(200).json({ draft: { ...body, user_id: req.userId, updated_at: new Date().toISOString() } });
    }
  }),
);

feed.delete(
  "/draft",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      await admin.from("campus_post_drafts").delete().eq("user_id", req.userId);
    } catch {}
    res.json({ success: true });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /api/v1/feed - Keyset-paginated campus feed with rich filters
// ─────────────────────────────────────────────────────────────────────────────
feed.get(
  "/",
  wrap(async (req, res) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const cursor = req.query.cursor as string | undefined;
    const typeFilter = req.query.type as string | undefined;
    const hashtagFilter = req.query.hashtag as string | undefined;
    const authorFilter = req.query.author_id as string | undefined;
    const clubFilter = req.query.club_id as string | undefined;

    let query = admin
      .from("campus_posts")
      .select(`
        *,
        author:profiles!campus_posts_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .eq("status", "active")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    if (typeFilter && typeFilter !== "all") {
      try {
        query = query.eq("post_type", typeFilter);
      } catch {}
    }

    if (authorFilter) {
      query = query.eq("author_id", authorFilter);
    }

    if (clubFilter) {
      try {
        query = query.eq("club_id", clubFilter);
      } catch {}
    }

    const { data: rawPosts, error } = await query;
    if (error) throw error;

    let posts = rawPosts ?? [];

    // Filter by hashtag in-memory if requested (matches hashtags array or in text)
    if (hashtagFilter) {
      const cleanTag = hashtagFilter.replace(/^#/, "").toLowerCase();
      posts = posts.filter((p) => {
        const tags = Array.isArray(p.hashtags) ? p.hashtags.map((t: string) => t.toLowerCase()) : [];
        const inTags = tags.some((t: string) => t.includes(cleanTag));
        const inBody = typeof p.body === "string" && p.body.toLowerCase().includes(`#${cleanTag}`);
        return inTags || inBody;
      });
    }

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? items[items.length - 1]?.created_at : null;

    const postIds = items.map((p) => p.id);
    const userReactions = new Map<string, string>();
    const savedPostIds = new Set<string>();

    if (req.userId && postIds.length > 0) {
      // 1. User Reactions
      const { data: reactions } = await admin
        .from("campus_post_reactions")
        .select("post_id, reaction_type")
        .eq("user_id", req.userId)
        .in("post_id", postIds);

      for (const r of reactions ?? []) {
        userReactions.set(r.post_id, r.reaction_type);
      }

      // 2. Saved Status
      try {
        const { data: savedItems } = await admin
          .from("saved_items")
          .select("entity_id")
          .eq("user_id", req.userId)
          .in("entity_id", postIds);

        for (const s of savedItems ?? []) {
          savedPostIds.add(s.entity_id);
        }
      } catch {}
    }

    // 3. Linked Media Attachments
    const mediaByPost = new Map<string, any[]>();
    if (postIds.length > 0) {
      try {
        const { data: mediaItems } = await admin
          .from("campus_post_media")
          .select(`
            id,
            post_id,
            media_type,
            media_url,
            thumbnail_url,
            sort_order,
            metadata,
            media_object:media_objects(id, bucket, object_key, mime_type, file_size_bytes, provider, status)
          `)
          .in("post_id", postIds)
          .order("sort_order", { ascending: true });

        for (const m of mediaItems ?? []) {
          if (!mediaByPost.has(m.post_id)) {
            mediaByPost.set(m.post_id, []);
          }
          const obj = m.media_object as any;
          const url = m.media_url || (obj ? resolveMediaObjectPublicUrl(obj) : "");
          mediaByPost.get(m.post_id)!.push({
            id: m.id,
            url,
            thumbnail_url: m.thumbnail_url || null,
            media_type: m.media_type || (obj?.mime_type?.startsWith("video/") ? "video" : obj?.mime_type?.startsWith("application/") ? "document" : "image"),
            mime_type: obj?.mime_type || "application/octet-stream",
            file_size_bytes: obj?.file_size_bytes || 0,
            sort_order: m.sort_order,
            metadata: m.metadata || {},
          });
        }
      } catch {}
    }

    // 4. Linked Polls
    const pollsByPost = new Map<string, any>();
    if (postIds.length > 0) {
      try {
        const { data: polls } = await admin
          .from("campus_post_polls")
          .select(`
            id,
            post_id,
            question,
            is_multiple,
            is_anonymous,
            expires_at,
            total_votes,
            options:campus_post_poll_options(id, poll_id, option_text, image_url, display_order, votes_count)
          `)
          .in("post_id", postIds);

        if (polls && polls.length > 0) {
          const pollIds = polls.map((p) => p.id);
          const userVotedOptionIds = new Map<string, string[]>();

          if (req.userId && pollIds.length > 0) {
            const { data: userVotes } = await admin
              .from("campus_post_poll_votes")
              .select("poll_id, option_id")
              .eq("user_id", req.userId)
              .in("poll_id", pollIds);

            for (const v of userVotes ?? []) {
              if (!userVotedOptionIds.has(v.poll_id)) {
                userVotedOptionIds.set(v.poll_id, []);
              }
              userVotedOptionIds.get(v.poll_id)!.push(v.option_id);
            }
          }

          for (const p of polls) {
            const sortedOpts = (p.options || []).sort(
              (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0),
            );
            pollsByPost.set(p.post_id, {
              id: p.id,
              question: p.question,
              is_multiple: p.is_multiple,
              is_anonymous: p.is_anonymous,
              expires_at: p.expires_at,
              total_votes: p.total_votes,
              options: sortedOpts,
              user_voted_options: userVotedOptionIds.get(p.id) || [],
              has_voted: (userVotedOptionIds.get(p.id) || []).length > 0,
            });
          }
        }
      } catch {}
    }

    // Mask anonymous author data & return rich canonical posts
    const sanitized = items.map((post) => {
      const myReaction = userReactions.get(post.id) ?? null;
      const attachments = mediaByPost.get(post.id) || [];
      const poll = pollsByPost.get(post.id) || null;
      const isSaved = savedPostIds.has(post.id);

      // Gracefully unpack embedded metadata envelope if present in body
      let displayBody = post.body;
      let postType = post.post_type || "standard";
      let appearance = post.appearance || {};
      let structuredContent = post.structured_content || { blocks: [] };
      let typeMetadata = post.type_metadata || {};
      let mentions = post.mentions || [];
      let hashtags = post.hashtags || [];
      let visibility = post.visibility || "public";

      if (displayBody.startsWith("<!--SKILLBRIDGE_POST_META:")) {
        try {
          const endIdx = displayBody.indexOf("-->");
          if (endIdx > 0) {
            const metaJson = displayBody.slice("<!--SKILLBRIDGE_POST_META:".length, endIdx);
            const parsedMeta = JSON.parse(metaJson);
            displayBody = displayBody.slice(endIdx + 3).trim();
            postType = parsedMeta.post_type || postType;
            appearance = parsedMeta.appearance || appearance;
            structuredContent = parsedMeta.structured_content || structuredContent;
            typeMetadata = parsedMeta.type_metadata || typeMetadata;
            mentions = parsedMeta.mentions || mentions;
            hashtags = parsedMeta.hashtags || hashtags;
            visibility = parsedMeta.visibility || visibility;
          }
        } catch {}
      }

      const basePost = {
        ...post,
        body: displayBody,
        post_type: postType,
        appearance,
        structured_content: structuredContent,
        type_metadata: typeMetadata,
        mentions,
        hashtags,
        visibility,
        attachments,
        poll,
        is_saved: isSaved,
        my_reaction: myReaction,
      };

      if (post.is_anonymous) {
        return {
          ...basePost,
          author_id: null,
          author: {
            id: null,
            full_name: post.anonymous_handle || "Anonymous Student",
            username: "anonymous",
            avatar_url: null,
          },
        };
      }
      return basePost;
    });

    res.json({
      posts: sanitized,
      next_cursor: nextCursor,
      has_more: hasMore,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. POST /api/v1/feed - Publish a new rich post
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/",
  feedPostLimiter,
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postSchema = z.object({
      body: z.string().min(1).max(10000),
      post_type: z
        .enum([
          "standard",
          "text_art",
          "question",
          "poll",
          "achievement",
          "announcement",
          "study_note",
          "event",
          "opportunity",
          "project",
          "code",
          "quote",
          "resource",
          "gallery",
          "video",
          "document",
          "youtube",
        ])
        .default("standard"),
      appearance: z
        .object({
          theme: z.string().optional(),
          backgroundType: z.enum(["solid", "gradient", "mesh", "glass", "pattern"]).optional(),
          backgroundValue: z.string().optional(),
          textColor: z.string().optional(),
          alignment: z.enum(["left", "center", "right"]).optional(),
        })
        .optional()
        .default({}),
      structured_content: z
        .object({
          blocks: z.array(z.record(z.string(), z.unknown())).default([]),
        })
        .optional()
        .default({ blocks: [] }),
      visibility: z
        .enum(["public", "university", "department", "section", "club", "connections", "only_me"])
        .default("public"),
      club_id: z.string().uuid().optional().nullable(),
      department: z.string().optional().nullable(),
      section: z.string().optional().nullable(),
      is_anonymous: z.boolean().default(false),
      media_urls: z.array(z.string().url()).max(10).default([]),
      media_object_ids: z.array(z.string().uuid()).max(10).default([]),
      youtube_url: z.string().optional(),
      mentions: z
        .array(
          z.object({
            id: z.string().uuid(),
            username: z.string(),
            full_name: z.string(),
          }),
        )
        .default([]),
      hashtags: z.array(z.string()).default([]),
      type_metadata: z.record(z.string(), z.unknown()).default({}),
      poll: z
        .object({
          question: z.string().min(1).max(500),
          options: z.array(z.string().min(1).max(200)).min(2).max(10),
          is_multiple: z.boolean().default(false),
          is_anonymous: z.boolean().default(false),
          expires_at: z.string().optional().nullable(),
        })
        .optional(),
    });

    const body = postSchema.parse(req.body);
    const postId = crypto.randomUUID();
    const handle = body.is_anonymous ? generateAnonymousHandle(req.userId, postId) : null;

    let mediaUrls = [...body.media_urls];
    const postAttachments: any[] = [];

    // Process media objects if provided
    if (body.media_object_ids.length > 0) {
      const { data: mediaObjs, error: mediaErr } = await admin
        .from("media_objects")
        .select("id, bucket, object_key, mime_type, file_size_bytes, provider, uploader_id")
        .in("id", body.media_object_ids)
        .eq("uploader_id", req.userId);

      if (mediaErr || !mediaObjs || mediaObjs.length !== body.media_object_ids.length) {
        return res.status(400).json({ error: "One or more uploaded attachments could not be validated" });
      }

      const postMediaRows = [];
      for (let idx = 0; idx < mediaObjs.length; idx++) {
        const obj = mediaObjs[idx];
        if (!obj) continue;

        const pubUrl = resolveMediaObjectPublicUrl(obj);
        if (!mediaUrls.includes(pubUrl)) {
          mediaUrls.push(pubUrl);
        }

        const mediaType = obj.mime_type.startsWith("video/")
          ? "video"
          : obj.mime_type.startsWith("application/")
            ? "document"
            : "image";

        postAttachments.push({
          id: obj.id,
          url: pubUrl,
          media_type: mediaType,
          mime_type: obj.mime_type,
          file_size_bytes: obj.file_size_bytes,
          sort_order: idx,
        });

        postMediaRows.push({
          post_id: postId,
          media_object_id: obj.id,
          media_type: mediaType,
          media_url: pubUrl,
          sort_order: idx,
          metadata: { mime_type: obj.mime_type, file_size_bytes: obj.file_size_bytes },
        });

        await admin
          .from("media_objects")
          .update({
            status: "ready",
            entity_type: "post_attachment",
            entity_id: postId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", obj.id);
      }

      if (postMediaRows.length > 0) {
        try {
          await admin.from("campus_post_media").insert(postMediaRows);
        } catch {}
      }
    }

    // Process YouTube embed metadata if provided
    let ytEmbed: any = null;
    let actualPostType = body.post_type;
    if (body.youtube_url) {
      const ytId = extractYouTubeVideoId(body.youtube_url);
      if (ytId) {
        ytEmbed = await fetchYouTubeVideoMetadata(ytId);
        if (actualPostType === "standard") actualPostType = "youtube";
      }
    }

    // Attempt rich insert into campus_posts
    let insertedPost: any = null;
    try {
      const { data: post, error } = await admin
        .from("campus_posts")
        .insert({
          id: postId,
          author_id: req.userId,
          body: body.body,
          post_type: actualPostType,
          appearance: body.appearance,
          structured_content: body.structured_content,
          visibility: body.visibility,
          club_id: body.club_id || null,
          department: body.department || null,
          section: body.section || null,
          mentions: body.mentions,
          hashtags: body.hashtags,
          type_metadata: body.type_metadata,
          is_anonymous: body.is_anonymous,
          anonymous_handle: handle,
          media_urls: mediaUrls,
        })
        .select(`
          *,
          author:profiles!campus_posts_author_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (error) throw error;
      insertedPost = post;
    } catch (insertErr: any) {
      // Graceful fallback if new database columns haven't been applied yet:
      // Store rich data inside a metadata envelope at the start of body
      const metaEnvelope = JSON.stringify({
        post_type: actualPostType,
        appearance: body.appearance,
        structured_content: body.structured_content,
        type_metadata: body.type_metadata,
        mentions: body.mentions,
        hashtags: body.hashtags,
        visibility: body.visibility,
      });
      const envelopeBody = `<!--SKILLBRIDGE_POST_META:${metaEnvelope}-->\n${body.body}`;

      const { data: postFallback, error: fallbackErr } = await admin
        .from("campus_posts")
        .insert({
          id: postId,
          author_id: req.userId,
          body: envelopeBody,
          is_anonymous: body.is_anonymous,
          anonymous_handle: handle,
          media_urls: mediaUrls,
        })
        .select(`
          *,
          author:profiles!campus_posts_author_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (fallbackErr) throw fallbackErr;
      insertedPost = {
        ...postFallback,
        body: body.body,
        post_type: actualPostType,
        appearance: body.appearance,
        structured_content: body.structured_content,
        type_metadata: body.type_metadata,
        mentions: body.mentions,
        hashtags: body.hashtags,
        visibility: body.visibility,
      };
    }

    // Process Poll if provided
    let createdPoll: any = null;
    if (body.poll) {
      try {
        const pollId = crypto.randomUUID();
        const { data: pollRow, error: pollErr } = await admin
          .from("campus_post_polls")
          .insert({
            id: pollId,
            post_id: postId,
            question: body.poll.question,
            is_multiple: body.poll.is_multiple,
            is_anonymous: body.poll.is_anonymous,
            expires_at: body.poll.expires_at || null,
            total_votes: 0,
          })
          .select()
          .single();

        if (!pollErr && pollRow) {
          const optRows = body.poll.options.map((optText, idx) => ({
            id: crypto.randomUUID(),
            poll_id: pollId,
            option_text: optText,
            display_order: idx,
            votes_count: 0,
          }));

          const { data: createdOpts } = await admin
            .from("campus_post_poll_options")
            .insert(optRows)
            .select();

          createdPoll = {
            ...pollRow,
            options: createdOpts || optRows,
            total_votes: 0,
            user_voted_options: [],
            has_voted: false,
          };
        }
      } catch (pollEx) {
        logger.warn({ err: pollEx }, "Failed to insert poll record");
      }
    }

    // Secure audit map record for anonymous posts
    if (body.is_anonymous) {
      try {
        await admin.from("anonymous_author_map").insert({
          entity_type: "post",
          entity_id: postId,
          real_user_id: req.userId,
          scoped_handle: handle!,
        });
      } catch {}
    }

    // Discard draft on successful publish
    try {
      await admin.from("campus_post_drafts").delete().eq("user_id", req.userId);
    } catch {}

    // Dispatch notifications for @mentions
    if (body.mentions.length > 0) {
      const authorName = body.is_anonymous ? handle : (insertedPost.author?.full_name || "Someone");
      for (const m of body.mentions) {
        if (m.id !== req.userId) {
          void NotificationService.dispatch({
            userId: m.id,
            type: "MENTION",
            title: "You were mentioned in a post",
            body: `${authorName} mentioned you: "${body.body.slice(0, 80)}"`,
            entityType: "post",
            entityId: postId,
            data: { postId, route: "feed" },
          });
        }
      }
    }

    // Dispatch notification if official club announcement
    if (body.post_type === "announcement" && body.club_id) {
      void (async () => {
        try {
          const { data: clubMembers } = await admin
            .from("club_memberships")
            .select("user_id")
            .eq("club_id", body.club_id)
            .neq("user_id", req.userId);

          for (const mem of clubMembers ?? []) {
            void NotificationService.dispatch({
              userId: mem.user_id,
              type: "CLUB_ANNOUNCEMENT",
              title: "New Club Announcement",
              body: body.body.slice(0, 100),
              entityType: "post",
              entityId: postId,
              data: { postId, clubId: body.club_id || "", route: "feed" },
            });
          }
        } catch {}
      })();
    }

    logDomainEvent({
      event: "feed_post_created",
      postId,
      postType: actualPostType,
      isAnonymous: body.is_anonymous,
      hasAttachments: mediaUrls.length > 0 || Boolean(ytEmbed),
    });

    const responsePost = {
      ...insertedPost,
      attachments: postAttachments,
      poll: createdPoll,
      is_saved: false,
      my_reaction: null,
      ...(ytEmbed ? { youtube: ytEmbed } : {}),
    };

    const sanitized = insertedPost.is_anonymous
      ? {
          ...responsePost,
          author_id: null,
          author: {
            id: null,
            full_name: handle,
            username: "anonymous",
            avatar_url: null,
          },
        }
      : responsePost;

    res.status(201).json({ post: sanitized });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. PATCH /api/v1/feed/:id - Edit an existing post
// ─────────────────────────────────────────────────────────────────────────────
feed.patch(
  "/:id",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);
    const editSchema = z.object({
      body: z.string().min(1).max(10000),
      appearance: z.record(z.string(), z.unknown()).optional(),
      structured_content: z.record(z.string(), z.unknown()).optional(),
      type_metadata: z.record(z.string(), z.unknown()).optional(),
    });

    const parsed = editSchema.parse(req.body);

    const { data: post, error: findErr } = await admin
      .from("campus_posts")
      .select("author_id, is_anonymous, anonymous_handle")
      .eq("id", postId)
      .maybeSingle();

    if (findErr || !post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.author_id !== req.userId) {
      return res.status(403).json({ error: "Only the author can edit this post" });
    }

    const now = new Date().toISOString();
    let updatedPost: any = null;

    try {
      const { data, error } = await admin
        .from("campus_posts")
        .update({
          body: parsed.body,
          appearance: parsed.appearance || {},
          structured_content: parsed.structured_content || { blocks: [] },
          type_metadata: parsed.type_metadata || {},
          is_edited: true,
          edited_at: now,
          updated_at: now,
        })
        .eq("id", postId)
        .select(`
          *,
          author:profiles!campus_posts_author_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (error) throw error;
      updatedPost = data;
    } catch {
      // Fallback
      const { data, error } = await admin
        .from("campus_posts")
        .update({
          body: parsed.body,
          updated_at: now,
        })
        .eq("id", postId)
        .select(`
          *,
          author:profiles!campus_posts_author_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();
      if (error) throw error;
      updatedPost = {
        ...data,
        is_edited: true,
        edited_at: now,
        appearance: parsed.appearance,
        structured_content: parsed.structured_content,
        type_metadata: parsed.type_metadata,
      };
    }

    const sanitized = post.is_anonymous
      ? {
          ...updatedPost,
          author_id: null,
          author: {
            id: null,
            full_name: post.anonymous_handle,
            username: "anonymous",
            avatar_url: null,
          },
        }
      : updatedPost;

    res.json({ post: sanitized });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. DELETE /api/v1/feed/:id - Delete post
// ─────────────────────────────────────────────────────────────────────────────
feed.delete(
  "/:id",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);

    const { data: post } = await admin
      .from("campus_posts")
      .select("author_id")
      .eq("id", postId)
      .maybeSingle();

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.author_id !== req.userId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("roles")
        .eq("id", req.userId)
        .maybeSingle();

      const roles: string[] = profile?.roles ?? [];
      if (!roles.includes("admin") && !roles.includes("moderator")) {
        return res.status(403).json({ error: "Not authorized to delete this post" });
      }
    }

    await admin.from("campus_posts").delete().eq("id", postId);
    res.json({ success: true, deleted_id: postId });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. POST /api/v1/feed/:id/reactions - Rich Facebook-like reactions
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/:id/reactions",
  feedReactionLimiter,
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        reaction_type: z
          .enum(["like", "love", "insightful", "celebrate", "curious", "sad"])
          .default("like"),
      })
      .parse(req.body);

    const { data: existing } = await admin
      .from("campus_post_reactions")
      .select("reaction_type")
      .eq("post_id", postId)
      .eq("user_id", req.userId)
      .maybeSingle();

    let newReaction: string | null = body.reaction_type;

    if (existing && existing.reaction_type === body.reaction_type) {
      // Toggle off
      await admin
        .from("campus_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", req.userId);
      newReaction = null;
    } else {
      // Upsert
      await admin.from("campus_post_reactions").upsert(
        {
          post_id: postId,
          user_id: req.userId,
          reaction_type: body.reaction_type,
        },
        { onConflict: "post_id,user_id" },
      );
    }

    // Refresh count
    const { count } = await admin
      .from("campus_post_reactions")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    await admin
      .from("campus_posts")
      .update({ likes_count: count ?? 0 })
      .eq("id", postId);

    // Notify post author on positive reaction
    if (newReaction && newReaction !== existing?.reaction_type) {
      void (async () => {
        try {
          const { data: p } = await admin
            .from("campus_posts")
            .select("author_id, is_anonymous")
            .eq("id", postId)
            .maybeSingle();

          if (p && !p.is_anonymous && p.author_id !== req.userId) {
            void NotificationService.dispatch({
              userId: p.author_id,
              type: "POST_REACTION",
              title: "Reaction on Your Post",
              body: `Someone reacted to your post with ${body.reaction_type}.`,
              entityType: "post",
              entityId: postId,
              data: { postId, reactionType: body.reaction_type, route: "feed" },
            });
          }
        } catch {}
      })();
    }

    res.json({
      success: true,
      reaction: newReaction,
      likes_count: count ?? 0,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 10. POST /api/v1/feed/:id/poll/vote - Server-authoritative Poll Voting
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/:id/poll/vote",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        option_id: z.string().uuid(),
      })
      .parse(req.body);

    // 1. Fetch Poll
    const { data: poll, error: pollErr } = await admin
      .from("campus_post_polls")
      .select("id, post_id, is_multiple, expires_at, total_votes")
      .eq("post_id", postId)
      .maybeSingle();

    if (pollErr || !poll) {
      return res.status(404).json({ error: "Poll not found for this post" });
    }

    // Check expiration
    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      return res.status(400).json({ error: "This poll has concluded and is no longer accepting votes" });
    }

    // 2. Validate option belongs to poll
    const { data: option, error: optErr } = await admin
      .from("campus_post_poll_options")
      .select("id, votes_count")
      .eq("id", body.option_id)
      .eq("poll_id", poll.id)
      .maybeSingle();

    if (optErr || !option) {
      return res.status(400).json({ error: "Invalid poll option selected" });
    }

    // 3. Check for existing votes
    const { data: existingVotes } = await admin
      .from("campus_post_poll_votes")
      .select("option_id")
      .eq("poll_id", poll.id)
      .eq("user_id", req.userId);

    const alreadyVotedOption = existingVotes?.some((v) => v.option_id === body.option_id);
    if (alreadyVotedOption) {
      return res.status(400).json({ error: "You have already cast a vote for this option" });
    }

    if (!poll.is_multiple && existingVotes && existingVotes.length > 0) {
      // Single choice poll: replace old vote
      const oldOptionId = existingVotes[0]?.option_id;
      if (oldOptionId) {
        await admin
          .from("campus_post_poll_votes")
          .delete()
          .eq("poll_id", poll.id)
          .eq("user_id", req.userId);

        // Decrement old option votes count
        const { count: oldOptCount } = await admin
          .from("campus_post_poll_votes")
          .select("*", { count: "exact", head: true })
          .eq("option_id", oldOptionId);
        await admin
          .from("campus_post_poll_options")
          .update({ votes_count: oldOptCount ?? 0 })
          .eq("id", oldOptionId);
      }
    }

    // 4. Insert new vote
    await admin.from("campus_post_poll_votes").insert({
      poll_id: poll.id,
      option_id: body.option_id,
      user_id: req.userId,
    });

    // 5. Update counts
    const { count: newOptCount } = await admin
      .from("campus_post_poll_votes")
      .select("*", { count: "exact", head: true })
      .eq("option_id", body.option_id);

    await admin
      .from("campus_post_poll_options")
      .update({ votes_count: newOptCount ?? 0 })
      .eq("id", body.option_id);

    const { count: totalPollVotes } = await admin
      .from("campus_post_poll_votes")
      .select("*", { count: "exact", head: true })
      .eq("poll_id", poll.id);

    await admin
      .from("campus_post_polls")
      .update({ total_votes: totalPollVotes ?? 0 })
      .eq("id", poll.id);

    // 6. Return updated options & user vote list
    const { data: updatedOptions } = await admin
      .from("campus_post_poll_options")
      .select("id, poll_id, option_text, image_url, display_order, votes_count")
      .eq("poll_id", poll.id)
      .order("display_order", { ascending: true });

    const { data: userVotes } = await admin
      .from("campus_post_poll_votes")
      .select("option_id")
      .eq("poll_id", poll.id)
      .eq("user_id", req.userId);

    const votedIds = (userVotes ?? []).map((v) => v.option_id);

    res.json({
      success: true,
      poll: {
        id: poll.id,
        total_votes: totalPollVotes ?? 0,
        options: updatedOptions ?? [],
        user_voted_options: votedIds,
        has_voted: true,
      },
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 11. POST /api/v1/feed/:id/save and DELETE /:id/save - Save / Bookmark post
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/:id/save",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);

    try {
      // 1. Try upserting as 'post'
      const { error: primaryErr } = await admin.from("saved_items").upsert(
        {
          user_id: req.userId,
          entity_type: "post",
          entity_id: postId,
        },
        { onConflict: "user_id,entity_type,entity_id" },
      );

      // 2. Fallback to 'resource' if legacy constraint ('room','event','resource','profile') is active
      if (primaryErr) {
        await admin.from("saved_items").upsert(
          {
            user_id: req.userId,
            entity_type: "resource",
            entity_id: postId,
            note: "post_save",
          },
          { onConflict: "user_id,entity_type,entity_id" },
        );
      }

      // Count total saves for this post
      const { count } = await admin
        .from("saved_items")
        .select("*", { count: "exact", head: true })
        .eq("entity_id", postId);

      const finalCount = count && count > 0 ? count : 1;
      await admin
        .from("campus_posts")
        .update({ saves_count: finalCount })
        .eq("id", postId);

      res.json({ success: true, is_saved: true, saves_count: finalCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to save post" });
    }
  }),
);

feed.delete(
  "/:id/save",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);

    try {
      await admin
        .from("saved_items")
        .delete()
        .eq("user_id", req.userId)
        .eq("entity_id", postId);

      const { count } = await admin
        .from("saved_items")
        .select("*", { count: "exact", head: true })
        .eq("entity_id", postId);

      const finalCount = count ?? 0;
      await admin
        .from("campus_posts")
        .update({ saves_count: finalCount })
        .eq("id", postId);

      res.json({ success: true, is_saved: false, saves_count: finalCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to unsave post" });
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 12. POST /api/v1/feed/:id/share - Increment shares count & track
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/:id/share",
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.id);

    try {
      const { data: post } = await admin
        .from("campus_posts")
        .select("shares_count")
        .eq("id", postId)
        .maybeSingle();

      const newCount = (post?.shares_count ?? 0) + 1;
      await admin.from("campus_posts").update({ shares_count: newCount }).eq("id", postId);

      res.json({ success: true, shares_count: newCount });
    } catch {
      res.json({ success: true });
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 13. COMMENTS & NESTED REPLIES
// ─────────────────────────────────────────────────────────────────────────────
feed.get(
  "/:id/comments",
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("campus_post_comments")
      .select(`
        *,
        author:profiles!campus_post_comments_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const sanitized = (data ?? []).map((c) => {
      if (c.is_anonymous) {
        return {
          ...c,
          author_id: null,
          author: {
            id: null,
            full_name: c.anonymous_handle || "Anonymous Student",
            username: "anonymous",
            avatar_url: null,
          },
        };
      }
      return c;
    });

    res.json({ comments: sanitized });
  }),
);

feed.post(
  "/:id/comments",
  feedCommentLimiter,
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        body: z.string().min(1).max(2000),
        parent_id: z.string().uuid().optional().nullable(),
        media_url: z.string().url().optional().nullable(),
        is_anonymous: z.boolean().default(false),
      })
      .parse(req.body);

    const commentId = crypto.randomUUID();
    const handle = body.is_anonymous ? generateAnonymousHandle(req.userId, commentId) : null;

    let comment: any;
    try {
      const { data, error } = await admin
        .from("campus_post_comments")
        .insert({
          id: commentId,
          post_id: postId,
          author_id: req.userId,
          body: body.body,
          parent_id: body.parent_id || null,
          media_url: body.media_url || null,
          is_anonymous: body.is_anonymous,
          anonymous_handle: handle,
        })
        .select(`
          *,
          author:profiles!campus_post_comments_author_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (error) throw error;
      comment = data;
    } catch {
      // Fallback without parent_id/media_url if columns not yet migrated
      const { data, error } = await admin
        .from("campus_post_comments")
        .insert({
          id: commentId,
          post_id: postId,
          author_id: req.userId,
          body: body.body,
          is_anonymous: body.is_anonymous,
          anonymous_handle: handle,
        })
        .select(`
          *,
          author:profiles!campus_post_comments_author_id_fkey(id, full_name, username, avatar_url)
        `)
        .single();

      if (error) throw error;
      comment = data;
    }

    // Refresh comment count
    const { count } = await admin
      .from("campus_post_comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    await admin
      .from("campus_posts")
      .update({ comments_count: count ?? 0 })
      .eq("id", postId);

    // Notify post author & parent comment author
    void (async () => {
      try {
        const { data: p } = await admin
          .from("campus_posts")
          .select("author_id, is_anonymous")
          .eq("id", postId)
          .maybeSingle();

        const commenterName = body.is_anonymous ? "An anonymous student" : (comment.author?.full_name || "Someone");

        if (p && !p.is_anonymous && p.author_id !== req.userId) {
          void NotificationService.dispatch({
            userId: p.author_id,
            type: "POST_COMMENT",
            title: "New Comment on Your Post",
            body: `${commenterName} commented: "${body.body.slice(0, 80)}"`,
            entityType: "post",
            entityId: postId,
            data: { postId, route: "feed" },
          });
        }

        // If nested reply, notify parent author
        if (body.parent_id) {
          const { data: parentComment } = await admin
            .from("campus_post_comments")
            .select("author_id, is_anonymous")
            .eq("id", body.parent_id)
            .maybeSingle();

          if (parentComment && !parentComment.is_anonymous && parentComment.author_id !== req.userId) {
            void NotificationService.dispatch({
              userId: parentComment.author_id,
              type: "POST_COMMENT",
              title: "Reply to your comment",
              body: `${commenterName} replied: "${body.body.slice(0, 80)}"`,
              entityType: "comment",
              entityId: body.parent_id,
              data: { postId, commentId, route: "feed" },
            });
          }
        }
      } catch {}
    })();

    const sanitized = comment.is_anonymous
      ? {
          ...comment,
          author_id: null,
          author: {
            id: null,
            full_name: handle,
            username: "anonymous",
            avatar_url: null,
          },
        }
      : comment;

    res.status(201).json({ comment: sanitized });
  }),
);

// Delete comment
feed.delete(
  "/:id/comments/:commentId",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);
    const commentId = z.string().uuid().parse(req.params.commentId);

    const { data: comment } = await admin
      .from("campus_post_comments")
      .select("author_id")
      .eq("id", commentId)
      .eq("post_id", postId)
      .maybeSingle();

    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (comment.author_id !== req.userId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("roles")
        .eq("id", req.userId)
        .maybeSingle();

      const roles: string[] = profile?.roles ?? [];
      if (!roles.includes("admin") && !roles.includes("moderator")) {
        return res.status(403).json({ error: "Not authorized to delete this comment" });
      }
    }

    await admin.from("campus_post_comments").delete().eq("id", commentId);

    const { count } = await admin
      .from("campus_post_comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    await admin
      .from("campus_posts")
      .update({ comments_count: count ?? 0 })
      .eq("id", postId);

    res.json({ success: true, deleted_comment_id: commentId });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 14. POST /api/v1/feed/:id/report - Report a post
// ─────────────────────────────────────────────────────────────────────────────
feed.post(
  "/:id/report",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const postId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        reason: z.string().min(1).max(200),
        details: z.string().max(1000).optional(),
      })
      .parse(req.body);

    try {
      await admin.from("reports").insert({
        reporter_id: req.userId,
        target_type: "post",
        target_id: postId,
        reason: body.reason,
        details: body.details || null,
        status: "pending",
      });
    } catch {
      // In case reports table has different column naming
      try {
        await admin.from("reports").insert({
          user_id: req.userId,
          entity_type: "post",
          entity_id: postId,
          reason: body.reason,
        });
      } catch {}
    }

    res.json({ success: true, message: "Report submitted successfully." });
  }),
);

