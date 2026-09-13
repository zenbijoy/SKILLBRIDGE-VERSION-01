import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { NotificationService } from "../services/notificationService.js";
import { feedPostLimiter, feedReactionLimiter, feedCommentLimiter } from "../middleware/rateLimiters.js";
import { logDomainEvent } from "../lib/domainLogger.js";
import {
  getStorageProvider,
  registerMediaObject,
  resolveMediaObjectPublicUrl,
} from "../services/storage.js";
import {
  extractYouTubeVideoId,
  fetchYouTubeVideoMetadata,
} from "../services/youtubeService.js";

export const feed = Router();

// Helper to generate scoped anonymous handle
function generateAnonymousHandle(userId: string, entityId: string): string {
  const hash = crypto.createHash("sha256").update(`${userId}-${entityId}-salt2026`).digest("hex");
  return `Anonymous Student #${hash.slice(0, 4).toUpperCase()}`;
}

// POST /api/v1/feed/upload-ticket - Presigned direct upload ticket for post images
feed.post(
  "/upload-ticket",
  wrap(async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const schema = z.object({
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      fileSizeBytes: z.number().int().positive().max(10 * 1024 * 1024).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid file type or size. Images must be JPEG, PNG, WEBP, or GIF up to 10MB.",
      });
    }

    const { mimeType, fileSizeBytes } = parsed.data;
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[mimeType] || "jpg";
    const objectKey = `feed/${req.userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const bucket = "resources";

    // Register in media_objects table
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

// GET /api/v1/feed - Keyset-paginated campus feed
feed.get(
  "/",
  wrap(async (req, res) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const cursor = req.query.cursor as string | undefined;

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

    const { data: rawPosts, error } = await query;
    if (error) throw error;

    const posts = rawPosts ?? [];
    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? items[items.length - 1]?.created_at : null;

    // Fetch user reactions if signed in
    const postIds = items.map((p) => p.id);
    const userReactions = new Map<string, string>();

    if (req.userId && postIds.length > 0) {
      const { data: reactions } = await admin
        .from("campus_post_reactions")
        .select("post_id, reaction_type")
        .eq("user_id", req.userId)
        .in("post_id", postIds);

      for (const r of reactions ?? []) {
        userReactions.set(r.post_id, r.reaction_type);
      }
    }

    // Fetch linked rich media from campus_post_media
    const mediaByPost = new Map<string, any[]>();
    if (postIds.length > 0) {
      try {
        const { data: mediaItems } = await admin
          .from("campus_post_media")
          .select(`
            id,
            post_id,
            display_order,
            media_object:media_objects(id, bucket, object_key, mime_type, file_size_bytes, provider, status)
          `)
          .in("post_id", postIds)
          .order("display_order", { ascending: true });

        for (const m of mediaItems ?? []) {
          if (!mediaByPost.has(m.post_id)) {
            mediaByPost.set(m.post_id, []);
          }
          if (m.media_object) {
            const obj = m.media_object as any;
            mediaByPost.get(m.post_id)!.push({
              id: obj.id,
              url: resolveMediaObjectPublicUrl(obj),
              mime_type: obj.mime_type,
              file_size_bytes: obj.file_size_bytes,
              display_order: m.display_order,
            });
          }
        }
      } catch (mediaErr) {
        // Non-blocking fallback if campus_post_media is not yet populated
      }
    }

    // Mask anonymous author data & strip real author_id
    const sanitized = items.map((post) => {
      const myReaction = userReactions.get(post.id) ?? null;
      const attachments = mediaByPost.get(post.id) || [];
      const basePost = {
        ...post,
        attachments,
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

// POST /api/v1/feed - Publish a new post
feed.post(
  "/",
  feedPostLimiter,
  wrap(async (req, res) => {
    const body = z
      .object({
        body: z.string().min(1).max(5000),
        is_anonymous: z.boolean().default(false),
        media_urls: z.array(z.string().url()).max(4).default([]),
        media_object_ids: z.array(z.string().uuid()).max(4).default([]),
        youtube_url: z.string().optional(),
      })
      .parse(req.body);

    const postId = crypto.randomUUID();
    const handle = body.is_anonymous ? generateAnonymousHandle(req.userId!, postId) : null;

    let mediaUrls = [...body.media_urls];
    const postAttachments: any[] = [];

    // Process media objects if provided
    if (body.media_object_ids.length > 0) {
      const { data: mediaObjs, error: mediaErr } = await admin
        .from("media_objects")
        .select("id, bucket, object_key, mime_type, file_size_bytes, provider, uploader_id")
        .in("id", body.media_object_ids)
        .eq("uploader_id", req.userId!);

      if (mediaErr || !mediaObjs || mediaObjs.length !== body.media_object_ids.length) {
        return res.status(400).json({ error: "One or more uploaded attachments could not be validated" });
      }

      // Finalize media objects status to ready and insert campus_post_media rows
      const postMediaRows = [];
      for (let idx = 0; idx < mediaObjs.length; idx++) {
        const obj = mediaObjs[idx];
        if (!obj) continue;

        const pubUrl = resolveMediaObjectPublicUrl(obj);
        if (!mediaUrls.includes(pubUrl)) {
          mediaUrls.push(pubUrl);
        }

        postAttachments.push({
          id: obj.id,
          url: pubUrl,
          mime_type: obj.mime_type,
          file_size_bytes: obj.file_size_bytes,
          display_order: idx,
        });

        postMediaRows.push({
          post_id: postId,
          media_object_id: obj.id,
          display_order: idx,
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
        await admin.from("campus_post_media").insert(postMediaRows);
      }
    }

    // Process YouTube embed metadata if provided
    let ytEmbed: any = null;
    if (body.youtube_url) {
      const ytId = extractYouTubeVideoId(body.youtube_url);
      if (ytId) {
        ytEmbed = await fetchYouTubeVideoMetadata(ytId);
      }
    }

    const { data: post, error } = await admin
      .from("campus_posts")
      .insert({
        id: postId,
        author_id: req.userId!,
        body: body.body,
        is_anonymous: body.is_anonymous,
        anonymous_handle: handle,
        media_urls: mediaUrls,
        ...(ytEmbed ? { post_type: "youtube" } : {}),
      })
      .select(`
        *,
        author:profiles!campus_posts_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Secure audit map record for safety
    if (body.is_anonymous) {
      await admin.from("anonymous_author_map").insert({
        entity_type: "post",
        entity_id: postId,
        real_user_id: req.userId!,
        scoped_handle: handle!,
      });
    }

    logDomainEvent({
      event: "feed_post_created",
      postId,
      postType: ytEmbed ? "youtube" : "standard",
      isAnonymous: body.is_anonymous,
      hasAttachments: mediaUrls.length > 0 || Boolean(ytEmbed),
    });

    const responsePost = {
      ...post,
      attachments: postAttachments,
      ...(ytEmbed ? { youtube: ytEmbed } : {}),
    };

    const sanitized = post.is_anonymous
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

// POST /api/v1/feed/:id/reactions - Toggle reaction
feed.post(
  "/:id/reactions",
  feedReactionLimiter,
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        reaction_type: z.enum(["like", "insightful", "celebrate", "curious"]).default("like"),
      })
      .parse(req.body);

    const { data: existing } = await admin
      .from("campus_post_reactions")
      .select("reaction_type")
      .eq("post_id", postId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (existing && existing.reaction_type === body.reaction_type) {
      // Toggle off
      await admin
        .from("campus_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", req.userId!);
    } else {
      // Upsert
      await admin.from("campus_post_reactions").upsert(
        {
          post_id: postId,
          user_id: req.userId!,
          reaction_type: body.reaction_type,
        },
        { onConflict: "post_id,user_id" },
      );
    }

    // Refresh like count
    const { count } = await admin
      .from("campus_post_reactions")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    await admin
      .from("campus_posts")
      .update({ likes_count: count ?? 0 })
      .eq("id", postId);

    res.json({
      success: true,
      reaction: existing?.reaction_type === body.reaction_type ? null : body.reaction_type,
      likes_count: count ?? 0,
    });
  }),
);

// GET /api/v1/feed/:id/comments - List post comments
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

// POST /api/v1/feed/:id/comments - Add comment
feed.post(
  "/:id/comments",
  feedCommentLimiter,
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        body: z.string().min(1).max(2000),
        is_anonymous: z.boolean().default(false),
      })
      .parse(req.body);

    const commentId = crypto.randomUUID();
    const handle = body.is_anonymous ? generateAnonymousHandle(req.userId!, commentId) : null;

    const { data: comment, error } = await admin
      .from("campus_post_comments")
      .insert({
        id: commentId,
        post_id: postId,
        author_id: req.userId!,
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

    // Refresh comment count
    const { count } = await admin
      .from("campus_post_comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    await admin
      .from("campus_posts")
      .update({ comments_count: count ?? 0 })
      .eq("id", postId);

    // Notify post author if not self and not anonymous
    void (async () => {
      try {
        const { data: p } = await admin
          .from("campus_posts")
          .select("author_id, is_anonymous")
          .eq("id", postId)
          .maybeSingle();

        if (p && !p.is_anonymous && p.author_id !== req.userId!) {
          void NotificationService.dispatch({
            userId: p.author_id,
            type: "POST_COMMENT",
            title: "New Comment on Your Post",
            body: `${body.is_anonymous ? "An anonymous student" : "Someone"} commented on your campus wall post.`,
            entityType: "post",
            entityId: postId,
            data: { postId, route: "feed" },
          });
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

// DELETE /api/v1/feed/:id - Delete post
feed.delete(
  "/:id",
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.id);

    const { data: post } = await admin
      .from("campus_posts")
      .select("author_id")
      .eq("id", postId)
      .maybeSingle();

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.author_id !== req.userId!) {
      // Check admin status
      const { data: profile } = await admin
        .from("profiles")
        .select("roles")
        .eq("id", req.userId!)
        .maybeSingle();

      const roles: string[] = profile?.roles ?? [];
      if (!roles.includes("admin")) {
        return res.status(403).json({ error: "Not authorized to delete this post" });
      }
    }

    await admin.from("campus_posts").delete().eq("id", postId);
    res.json({ success: true, deleted_id: postId });
  }),
);
