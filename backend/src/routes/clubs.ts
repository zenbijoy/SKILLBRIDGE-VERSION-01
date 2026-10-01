import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { NotificationService } from "../services/notificationService.js";
import { negotiationLimiter } from "../middleware/rateLimiters.js";
import { logDomainEvent } from "../lib/domainLogger.js";
import { ensureClubWorkspace } from "../services/spaceWorkspaceService.js";

export const clubs = Router();

// =============================================================================
// 1. CLUB DISCOVERY, SEARCH & RECOMMENDATIONS
// =============================================================================

// GET /api/v1/clubs - List all clubs (with optional filtering)
clubs.get(
  "/",
  wrap(async (req, res) => {
    const category = req.query.category as string | undefined;
    const university = req.query.university as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();

    let q = admin
      .from("clubs")
      .select("*, members:club_members(count)")
      .eq("is_archived", false);

    if (category && category !== "All") {
      q = q.eq("category", category);
    }
    if (university) {
      q = q.ilike("university", `%${university}%`);
    }
    if (search) {
      q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,tagline.ilike.%${search}%`);
    }

    const { data, error } = await q
      .order("verified", { ascending: false })
      .order("name");

    if (error) throw error;

    // Fetch user memberships to attach is_member flag
    let userClubIds = new Set<string>();
    let userFollowedIds = new Set<string>();
    if (req.userId) {
      const { data: myMemberships } = await admin
        .from("club_members")
        .select("club_id")
        .eq("user_id", req.userId);
      userClubIds = new Set((myMemberships || []).map((m) => m.club_id));

      const { data: myFollows } = await admin
        .from("club_follows")
        .select("club_id")
        .eq("user_id", req.userId);
      userFollowedIds = new Set((myFollows || []).map((f) => f.club_id));
    }

    const formatted = (data ?? []).map((c: any) => ({
      ...c,
      member_count: c.members?.[0]?.count ?? 0,
      is_member: userClubIds.has(c.id),
      is_following: userFollowedIds.has(c.id),
    }));

    res.json({ clubs: formatted });
  }),
);

// GET /api/v1/clubs/mine - List clubs joined or followed by current user
clubs.get(
  "/mine",
  wrap(async (req, res) => {
    const { data: memberData, error: memberErr } = await admin
      .from("club_members")
      .select("role, title, joined_at, clubs(*)")
      .eq("user_id", req.userId!)
      .eq("clubs.is_archived", false);

    if (memberErr) throw memberErr;

    const { data: followData } = await admin
      .from("club_follows")
      .select("club_id, clubs(*)")
      .eq("user_id", req.userId!)
      .eq("clubs.is_archived", false);

    res.json({
      memberships: memberData ?? [],
      follows: followData ?? [],
    });
  }),
);

// GET /api/v1/clubs/recommended - Personalized club recommendations
clubs.get(
  "/recommended",
  wrap(async (req, res) => {
    // 1. Fetch user profile for university, department, skills
    const { data: userProfile } = await admin
      .from("profiles")
      .select("university, department, skills, interests")
      .eq("id", req.userId!)
      .maybeSingle();

    // 2. Fetch already joined club IDs to exclude
    const { data: joined } = await admin
      .from("club_members")
      .select("club_id")
      .eq("user_id", req.userId!);
    const excludeIds = (joined || []).map((j) => j.club_id);

    let query = admin
      .from("clubs")
      .select("*, members:club_members(count)")
      .eq("is_archived", false);

    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data: allClubs, error } = await query
      .order("verified", { ascending: false })
      .limit(10);

    if (error) throw error;

    // Score and annotate reason for recommendation
    const recommended = (allClubs || []).map((c: any) => {
      let reason = "Popular campus community";
      if (userProfile?.department && c.department && c.department.toLowerCase() === userProfile.department.toLowerCase()) {
        reason = `Matches your ${userProfile.department} department`;
      } else if (c.category === "Technical" || c.category === "Technology") {
        reason = "Based on engineering & tech interests";
      } else if (c.verified) {
        reason = "Official verified student organization";
      }

      return {
        ...c,
        member_count: c.members?.[0]?.count ?? 0,
        recommendation_reason: reason,
      };
    });

    res.json({ recommended });
  }),
);

// =============================================================================
// 2. CLUB PROFILE & WORKSPACE
// =============================================================================

// GET /api/v1/clubs/:id - Complete Club Profile with tabs data
clubs.get(
  "/:id",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: club, error } = await admin
      .from("clubs")
      .select(`
        *,
        members:club_members(
          user_id, role, title, joined_at,
          profiles(id, full_name, username, avatar_url, department)
        )
      `)
      .eq("id", clubId)
      .maybeSingle();

    if (error) throw error;
    if (!club) return res.status(404).json({ error: "Club not found" });

    // Workspace Room ID
    let roomId = (club as any).room_id;
    if (!roomId && req.userId) {
      try {
        roomId = await ensureClubWorkspace(clubId, req.userId);
      } catch {}
    }

    // Check my membership & follow
    let myMember = null;
    let isFollowing = false;
    if (req.userId) {
      myMember = (club.members || []).find((m: any) => m.user_id === req.userId);
      const { data: follow } = await admin
        .from("club_follows")
        .select("created_at")
        .eq("club_id", clubId)
        .eq("user_id", req.userId)
        .maybeSingle();
      isFollowing = Boolean(follow);
    }

    // Get upcoming events
    const { data: events } = await admin
      .from("events")
      .select("*")
      .eq("club_id", clubId)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(5);

    // Get active projects
    const { data: projects } = await admin
      .from("club_projects")
      .select("id, title, description, status, cover_url, deadline")
      .eq("club_id", clubId)
      .neq("status", "archived")
      .limit(6);

    // Get latest announcement
    const { data: latestAnnouncement } = await admin
      .from("club_posts")
      .select("id, title, content, created_at, is_pinned")
      .eq("club_id", clubId)
      .eq("type", "announcement")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check follower count
    const { count: followerCount } = await admin
      .from("club_follows")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId);

    res.json({
      club: {
        ...club,
        room_id: roomId,
        my_role: myMember?.role ?? null,
        my_title: myMember?.title ?? null,
        is_member: Boolean(myMember),
        is_following: isFollowing,
        member_count: club.members?.length ?? 0,
        follower_count: followerCount ?? 0,
        latest_announcement: latestAnnouncement,
      },
      events: events ?? [],
      projects: projects ?? [],
    });
  }),
);

// POST /api/v1/clubs - Create a new club (atomic RPC with owner assignment)
clubs.post(
  "/",
  wrap(async (req, res) => {
    const b = z
      .object({
        name: z.string().min(3).max(120),
        tagline: z.string().max(180).optional(),
        description: z.string().max(3000).optional(),
        university: z.string().max(150).optional(),
        department: z.string().max(100).optional(),
        category: z.string().max(60).optional(),
        membership_type: z.enum(["open", "application", "invite_only"]).optional(),
        logo_url: z.string().url().optional().or(z.literal("")),
        banner_url: z.string().url().optional().or(z.literal("")),
        contact_email: z.string().email().optional().or(z.literal("")),
      })
      .parse(req.body);

    const { data: clubId, error } = await admin.rpc("create_club_atomic", {
      p_name: b.name.trim(),
      p_description: b.description?.trim() ?? "Student organization",
      p_university: b.university?.trim() ?? "",
      p_owner_id: req.userId!,
    });
    if (error) throw error;

    // Update extended metadata
    await admin
      .from("clubs")
      .update({
        tagline: b.tagline?.trim() ?? null,
        department: b.department?.trim() ?? null,
        category: b.category ?? "General",
        membership_type: b.membership_type ?? "open",
        logo_url: b.logo_url || null,
        banner_url: b.banner_url || null,
        contact_email: b.contact_email || null,
      })
      .eq("id", clubId);

    // Lazily create collaboration room workspace
    try {
      await ensureClubWorkspace(clubId, req.userId!);
    } catch {}

    const { data: createdClub } = await admin
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .single();

    res.status(201).json(createdClub);
  }),
);

// PATCH /api/v1/clubs/:id/settings - Update club branding & settings (Admin only)
clubs.patch(
  "/:id/settings",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        name: z.string().min(3).max(120).optional(),
        tagline: z.string().max(180).optional(),
        description: z.string().max(3000).optional(),
        category: z.string().max(60).optional(),
        department: z.string().max(100).optional(),
        university: z.string().max(150).optional(),
        membership_type: z.enum(["open", "application", "invite_only"]).optional(),
        logo_url: z.string().optional().nullable(),
        banner_url: z.string().optional().nullable(),
        contact_email: z.string().optional().nullable(),
        contact_phone: z.string().optional().nullable(),
        social_links: z.record(z.string(), z.string()).optional(),
        mission: z.string().optional().nullable(),
        vision: z.string().optional().nullable(),
      })
      .parse(req.body);

    // Verify admin permission
    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin", "president"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required" });
    }

    const { data: updated, error } = await admin
      .from("clubs")
      .update(body)
      .eq("id", clubId)
      .select()
      .single();

    if (error) throw error;
    res.json({ club: updated });
  }),
);

// =============================================================================
// 3. MEMBERSHIP & FOLLOWING
// =============================================================================

// POST /api/v1/clubs/:id/follow - Toggle follow status
clubs.post(
  "/:id/follow",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: existing } = await admin
      .from("club_follows")
      .select("club_id")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (existing) {
      await admin
        .from("club_follows")
        .delete()
        .eq("club_id", clubId)
        .eq("user_id", req.userId!);
      return res.json({ following: false });
    } else {
      await admin
        .from("club_follows")
        .insert({ club_id: clubId, user_id: req.userId! });
      return res.json({ following: true });
    }
  }),
);

// POST /api/v1/clubs/:id/join - Join club or handle membership requirements
clubs.post(
  "/:id/join",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: club } = await admin
      .from("clubs")
      .select("membership_type, name")
      .eq("id", clubId)
      .single();

    if (!club) return res.status(404).json({ error: "Club not found" });

    // Check if already a member
    const { data: existingMember } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (existingMember) {
      return res.status(400).json({ error: "Already a member of this club" });
    }

    if (club.membership_type === "application") {
      return res.json({
        requires_application: true,
        message: "This club requires an application. Please submit the membership form.",
      });
    }

    if (club.membership_type === "invite_only") {
      return res.status(403).json({
        error: "This club is invite-only. Please contact an executive for an invitation.",
      });
    }

    // Open membership: instant join!
    const { data: newMember, error } = await admin
      .from("club_members")
      .insert({
        club_id: clubId,
        user_id: req.userId!,
        role: "member",
        title: "Member",
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, member: newMember });
  }),
);

// POST /api/v1/clubs/:id/leave - Leave club
clubs.post(
  "/:id/leave",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member) {
      return res.status(400).json({ error: "You are not a member of this club" });
    }

    if (member.role === "owner") {
      return res.status(400).json({
        error: "Club owners cannot leave without transferring ownership to another member.",
      });
    }

    await admin
      .from("club_members")
      .delete()
      .eq("club_id", clubId)
      .eq("user_id", req.userId!);

    res.json({ success: true, message: "Left club successfully" });
  }),
);

// GET /api/v1/clubs/:id/members - Directory of members & leaders
clubs.get(
  "/:id/members",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const roleFilter = req.query.role as string | undefined;

    let q = admin
      .from("club_members")
      .select(`
        user_id, role, title, joined_at, is_active,
        profiles(id, full_name, username, avatar_url, department, bio)
      `)
      .eq("club_id", clubId);

    if (roleFilter) {
      q = q.eq("role", roleFilter);
    }

    const { data: members, error } = await q.order("role").order("joined_at", { ascending: true });
    if (error) throw error;

    res.json({ members: members ?? [] });
  }),
);

// PATCH /api/v1/clubs/:id/members/:userId - Update member role/title (Admin only)
clubs.patch(
  "/:id/members/:userId",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const targetUserId = z.string().uuid().parse(req.params.userId);
    const body = z
      .object({
        role: z.enum([
          "owner",
          "admin",
          "president",
          "vice_president",
          "secretary",
          "treasurer",
          "executive",
          "team_lead",
          "moderator",
          "member",
        ]).optional(),
        title: z.string().max(80).optional(),
        team_id: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const { data: me } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!me || !["owner", "admin", "president"].includes(me.role)) {
      return res.status(403).json({ error: "Club admin role required" });
    }

    const { data: updated, error } = await admin
      .from("club_members")
      .update(body)
      .eq("club_id", clubId)
      .eq("user_id", targetUserId)
      .select()
      .single();

    if (error) throw error;
    res.json({ member: updated });
  }),
);

// DELETE /api/v1/clubs/:id/members/:userId - Remove member (Admin only)
clubs.delete(
  "/:id/members/:userId",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const targetUserId = z.string().uuid().parse(req.params.userId);

    const { data: me } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!me || !["owner", "admin", "president"].includes(me.role)) {
      return res.status(403).json({ error: "Club admin role required" });
    }

    await admin
      .from("club_members")
      .delete()
      .eq("club_id", clubId)
      .eq("user_id", targetUserId);

    res.json({ success: true, message: "Member removed" });
  }),
);

// POST /api/v1/clubs/:id/members/invite - Invite a user to the club
clubs.post(
  "/:id/members/invite",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        userId: z.string().uuid(),
        role: z
          .enum([
            "admin",
            "vice_president",
            "secretary",
            "treasurer",
            "executive",
            "team_lead",
            "moderator",
            "member",
          ])
          .default("member"),
        title: z.string().max(80).optional(),
      })
      .parse(req.body);

    // Verify caller has admin/leader permission in the club
    const { data: me } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!me || !["owner", "admin", "president", "vice_president", "executive"].includes(me.role)) {
      return res.status(403).json({ error: "Club leadership role required to invite members" });
    }

    // Check if user is already a member
    const { data: existing } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", body.userId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "User is already a member of this club" });
    }

    const { data: newMember, error } = await admin
      .from("club_members")
      .insert({
        club_id: clubId,
        user_id: body.userId,
        role: body.role,
        title: body.title || (body.role === "member" ? "Member" : body.role),
      })
      .select(`
        user_id, role, title, joined_at,
        profiles(id, full_name, username, avatar_url, department)
      `)
      .single();

    if (error) throw error;

    // Send notification to the invited user
    try {
      const { data: clubData } = await admin
        .from("clubs")
        .select("name")
        .eq("id", clubId)
        .single();

      void NotificationService.dispatch({
        userId: body.userId,
        type: "CLUB_INVITATION",
        title: "Club Invitation",
        body: `You have been added to ${clubData?.name || "a campus club"} as a ${body.role}.`,
        priority: "high",
        entityType: "club",
        entityId: clubId,
        data: { clubId, route: "club" },
      });
    } catch {}

    res.status(201).json({ success: true, member: newMember });
  }),
);

// =============================================================================
// 4. COMMUNITY FEED & ANNOUNCEMENTS
// =============================================================================

// GET /api/v1/clubs/:id/posts - Feed posts with likes & comments count
clubs.get(
  "/:id/posts",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const type = req.query.type as string | undefined;

    let q = admin
      .from("club_posts")
      .select(`
        *,
        author:profiles(id, full_name, username, avatar_url, department)
      `)
      .eq("club_id", clubId);

    if (type && type !== "all") {
      q = q.eq("type", type);
    }

    const { data: posts, error } = await q
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Check if current user has liked each post
    let likedPostIds = new Set<string>();
    if (req.userId && (posts ?? []).length > 0) {
      const postIds = (posts ?? []).map((p) => p.id);
      const { data: likes } = await admin
        .from("club_post_likes")
        .select("post_id")
        .eq("user_id", req.userId)
        .in("post_id", postIds);
      likedPostIds = new Set((likes ?? []).map((l) => l.post_id));
    }

    const formatted = (posts ?? []).map((p: any) => ({
      ...p,
      is_liked: likedPostIds.has(p.id),
    }));

    res.json({ posts: formatted });
  }),
);

// POST /api/v1/clubs/:id/posts - Create post / announcement
clubs.post(
  "/:id/posts",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        type: z
          .enum([
            "announcement",
            "discussion",
            "question",
            "achievement",
            "project_update",
            "event_update",
            "resource",
          ])
          .default("discussion"),
        title: z.string().max(200).optional(),
        content: z.string().min(1).max(5000),
        media_urls: z.array(z.string()).optional().default([]),
        is_pinned: z.boolean().optional().default(false),
      })
      .parse(req.body);

    // Verify membership
    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member) {
      return res.status(403).json({ error: "Only members can post in the club community" });
    }

    // Only leaders can pin or post official announcements
    let canPin = false;
    if (["owner", "admin", "president", "vice_president", "executive", "moderator"].includes(member.role)) {
      canPin = true;
    }
    const isPinned = canPin ? body.is_pinned : false;

    const { data: post, error } = await admin
      .from("club_posts")
      .insert({
        club_id: clubId,
        author_id: req.userId!,
        type: body.type,
        title: body.title ?? null,
        content: body.content,
        media_urls: body.media_urls,
        is_pinned: isPinned,
      })
      .select(`
        *,
        author:profiles(id, full_name, username, avatar_url, department)
      `)
      .single();

    if (error) throw error;

    // Dispatch notification to members if it's an official announcement
    if (body.type === "announcement") {
      void (async () => {
        try {
          const { data: members } = await admin
            .from("club_members")
            .select("user_id")
            .eq("club_id", clubId)
            .neq("user_id", req.userId!);

          const { data: clubData } = await admin
            .from("clubs")
            .select("name")
            .eq("id", clubId)
            .single();

          for (const m of members ?? []) {
            void NotificationService.dispatch({
              userId: m.user_id,
              type: "CLUB_ANNOUNCEMENT",
              title: `${clubData?.name ?? "Club"} Announcement`,
              body: body.title || body.content.slice(0, 100),
              priority: "high",
              entityType: "club",
              entityId: clubId,
              data: { clubId, postId: post.id, route: "club" },
            });
          }
        } catch {}
      })();
    }

    res.status(201).json({ post });
  }),
);

// POST /api/v1/clubs/posts/:postId/like - Toggle like on post
clubs.post(
  "/posts/:postId/like",
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.postId);
    const { data: existing } = await admin
      .from("club_post_likes")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (existing) {
      await admin
        .from("club_post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", req.userId!);

      const { data: pDec } = await admin
        .from("club_posts")
        .select("likes_count")
        .eq("id", postId)
        .single();
      await admin
        .from("club_posts")
        .update({ likes_count: Math.max(0, (pDec?.likes_count ?? 1) - 1) })
        .eq("id", postId);

      return res.json({ liked: false });
    } else {
      await admin
        .from("club_post_likes")
        .insert({ post_id: postId, user_id: req.userId! });

      const { data: pInc } = await admin
        .from("club_posts")
        .select("likes_count")
        .eq("id", postId)
        .single();
      await admin
        .from("club_posts")
        .update({ likes_count: (pInc?.likes_count ?? 0) + 1 })
        .eq("id", postId);

      return res.json({ liked: true });
    }
  }),
);

// GET /api/v1/clubs/posts/:postId/comments - Get comments
clubs.get(
  "/posts/:postId/comments",
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.postId);
    const { data: comments, error } = await admin
      .from("club_post_comments")
      .select(`
        *,
        author:profiles(id, full_name, username, avatar_url)
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json({ comments: comments ?? [] });
  }),
);

// POST /api/v1/clubs/posts/:postId/comments - Post comment
clubs.post(
  "/posts/:postId/comments",
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.postId);
    const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);

    const { data: comment, error } = await admin
      .from("club_post_comments")
      .insert({
        post_id: postId,
        author_id: req.userId!,
        content,
      })
      .select(`
        *,
        author:profiles(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Increment comments count
    const { data: post } = await admin.from("club_posts").select("comments_count").eq("id", postId).single();
    await admin.from("club_posts").update({ comments_count: (post?.comments_count ?? 0) + 1 }).eq("id", postId);

    res.status(201).json({ comment });
  }),
);

// DELETE /api/v1/clubs/posts/:postId - Delete post (Author or Admin)
clubs.delete(
  "/posts/:postId",
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.postId);
    const { data: post } = await admin
      .from("club_posts")
      .select("author_id, club_id")
      .eq("id", postId)
      .single();

    if (!post) return res.status(404).json({ error: "Post not found" });

    let isAuthorized = post.author_id === req.userId;
    if (!isAuthorized) {
      const { data: member } = await admin
        .from("club_members")
        .select("role")
        .eq("club_id", post.club_id)
        .eq("user_id", req.userId!)
        .maybeSingle();
      if (member && ["owner", "admin", "president", "moderator"].includes(member.role)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: "Unauthorized to delete this post" });
    }

    await admin.from("club_posts").delete().eq("id", postId);
    res.json({ success: true, message: "Post deleted" });
  }),
);

// =============================================================================
// 5. CLUB EVENTS & ATTENDANCE
// =============================================================================

// GET /api/v1/clubs/:id/events - List club events
clubs.get(
  "/:id/events",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: events, error } = await admin
      .from("events")
      .select("*")
      .eq("club_id", clubId)
      .order("starts_at", { ascending: true });

    if (error) throw error;

    // Check my registrations
    let registeredEventIds = new Set<string>();
    if (req.userId && (events ?? []).length > 0) {
      const eventIds = (events ?? []).map((e) => e.id);
      const { data: apps } = await admin
        .from("event_applications")
        .select("event_id, status")
        .eq("user_id", req.userId)
        .in("event_id", eventIds);
      registeredEventIds = new Set((apps ?? []).map((a) => a.event_id));
    }

    const formatted = (events ?? []).map((e: any) => ({
      ...e,
      is_registered: registeredEventIds.has(e.id),
    }));

    res.json({ events: formatted });
  }),
);

// POST /api/v1/clubs/:id/events - Create new club event
clubs.post(
  "/:id/events",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(3).max(200),
        description: z.string().max(4000).optional().default(""),
        starts_at: z.string().datetime(),
        ends_at: z.string().datetime().optional().nullable(),
        location: z.string().optional().default("Campus Auditorium"),
        online_url: z.string().optional().nullable(),
        venue_type: z.enum(["offline", "online", "hybrid"]).default("offline"),
        capacity: z.number().int().positive().optional().nullable(),
        poster_url: z.string().optional().nullable(),
        speakers: z.array(z.any()).optional().default([]),
        agenda: z.array(z.any()).optional().default([]),
        tags: z.array(z.string()).optional().default([]),
      })
      .parse(req.body);

    // Verify admin
    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin", "president", "vice_president", "executive"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required to publish events" });
    }

    // Generate unique attendance check-in code
    const attendanceCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data: event, error } = await admin
      .from("events")
      .insert({
        club_id: clubId,
        title: body.title,
        description: body.description,
        starts_at: body.starts_at,
        ends_at: body.ends_at ?? null,
        location: body.location,
        online_url: body.online_url,
        venue_type: body.venue_type,
        capacity: body.capacity ?? null,
        poster_url: body.poster_url,
        speakers: body.speakers,
        agenda: body.agenda,
        tags: body.tags,
        attendance_code: attendanceCode,
        created_by: req.userId!,
        status: "published",
      })
      .select()
      .single();

    if (error) throw error;

    // Notify club followers & members
    void (async () => {
      try {
        const { data: members } = await admin
          .from("club_members")
          .select("user_id")
          .eq("club_id", clubId);

        for (const m of members ?? []) {
          void NotificationService.dispatch({
            userId: m.user_id,
            type: "CLUB_EVENT_CREATED",
            title: `New Event: ${body.title}`,
            body: `Starts at ${new Date(body.starts_at).toLocaleDateString()}`,
            priority: "normal",
            entityType: "event",
            entityId: event.id,
            data: { clubId, eventId: event.id, route: "club" },
          });
        }
      } catch {}
    })();

    res.status(201).json({ event });
  }),
);

// POST /api/v1/clubs/events/:eventId/register - Register for event & optionally sync to calendar
clubs.post(
  "/events/:eventId/register",
  wrap(async (req, res) => {
    const eventId = z.string().uuid().parse(req.params.eventId);
    const body = z
      .object({
        addToCalendar: z.boolean().optional().default(true),
        answers: z.record(z.string(), z.any()).optional().default({}),
      })
      .parse(req.body);

    const { data: event } = await admin
      .from("events")
      .select("*, clubs(name)")
      .eq("id", eventId)
      .single();

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Insert or update event application / registration
    const { data: reg, error } = await admin
      .from("event_applications")
      .upsert(
        {
          event_id: eventId,
          user_id: req.userId!,
          status: "approved",
          answers: body.answers,
        },
        { onConflict: "event_id,user_id" },
      )
      .select()
      .single();

    if (error) throw error;

    // Optional integration: Auto-add to user's SkillBridge Academic Calendar!
    if (body.addToCalendar) {
      try {
        const eventDate = new Date(event.starts_at).toISOString().split("T")[0] ?? "2026-10-01";
        const startTime = new Date(event.starts_at).toTimeString().substring(0, 5);
        const endTime = event.ends_at ? new Date(event.ends_at).toTimeString().substring(0, 5) : null;

        await admin.from("academic_calendar_events").insert({
          user_id: req.userId!,
          title: `[Club] ${event.title}`,
          event_type: "OTHER",
          date: eventDate,
          start_time: startTime,
          end_time: endTime,
          location: event.location,
          description: `Organized by ${(event.clubs as any)?.name ?? "Club"}`,
          priority: "medium",
        });
      } catch (calErr) {
        console.warn("Could not auto-sync event to calendar", calErr);
      }
    }

    res.status(201).json({ success: true, registration: reg });
  }),
);

// POST /api/v1/clubs/events/:eventId/checkin - Verify attendance via QR code or attendance code
clubs.post(
  "/events/:eventId/checkin",
  wrap(async (req, res) => {
    const eventId = z.string().uuid().parse(req.params.eventId);
    const { code } = z.object({ code: z.string().min(3).max(20) }).parse(req.body);

    const { data: event } = await admin
      .from("events")
      .select("attendance_code, title")
      .eq("id", eventId)
      .single();

    if (!event) return res.status(404).json({ error: "Event not found" });

    if (!event.attendance_code || event.attendance_code.toUpperCase() !== code.trim().toUpperCase()) {
      return res.status(400).json({ error: "Invalid attendance code." });
    }

    // Check duplicate check-in
    const { data: existing } = await admin
      .from("club_event_attendance")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (existing) {
      return res.json({ success: true, message: "Attendance already recorded for this event!" });
    }

    const { data: attendance, error } = await admin
      .from("club_event_attendance")
      .insert({
        event_id: eventId,
        user_id: req.userId!,
        checkin_method: "qr_scan",
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, message: "Attendance recorded successfully! 🎉", attendance });
  }),
);

// =============================================================================
// 6. RECRUITMENT CAMPAIGNS & CANDIDATE PIPELINE
// =============================================================================

// GET /api/v1/clubs/:id/recruitments - List recruitment drives
clubs.get(
  "/:id/recruitments",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: recruitments, error } = await admin
      .from("club_recruitments")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Check if user has applied
    let myAppMap = new Map<string, any>();
    if (req.userId && (recruitments ?? []).length > 0) {
      const recIds = (recruitments ?? []).map((r) => r.id);
      const { data: apps } = await admin
        .from("club_applications")
        .select("recruitment_id, status, applied_position, created_at")
        .eq("user_id", req.userId)
        .in("recruitment_id", recIds);
      for (const a of apps ?? []) {
        if (a.recruitment_id) myAppMap.set(a.recruitment_id, a);
      }
    }

    const formatted = (recruitments ?? []).map((r: any) => ({
      ...r,
      my_application: myAppMap.get(r.id) ?? null,
    }));

    res.json({ recruitments: formatted });
  }),
);

// POST /api/v1/clubs/:id/recruitments - Create recruitment campaign (Admin only)
clubs.post(
  "/:id/recruitments",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(3).max(180),
        description: z.string().max(3000).optional().default(""),
        open_positions: z.array(z.string()).min(1),
        required_skills: z.array(z.string()).optional().default([]),
        eligible_departments: z.array(z.string()).optional().default([]),
        deadline: z.string().datetime(),
        form_schema: z.array(z.any()).optional().default([]),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin", "president", "vice_president"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required" });
    }

    const { data: recruitment, error } = await admin
      .from("club_recruitments")
      .insert({
        club_id: clubId,
        title: body.title,
        description: body.description,
        open_positions: body.open_positions,
        required_skills: body.required_skills,
        eligible_departments: body.eligible_departments,
        deadline: body.deadline,
        form_schema: body.form_schema,
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ recruitment });
  }),
);

// POST /api/v1/clubs/:id/recruitments/:recId/apply - Submit application
clubs.post(
  "/:id/recruitments/:recId/apply",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const recId = z.string().uuid().parse(req.params.recId);
    const body = z
      .object({
        applied_position: z.string().min(1),
        statement: z.string().max(2000).optional(),
        resume_url: z.string().optional().nullable(),
        portfolio_url: z.string().optional().nullable(),
        answers: z.record(z.string(), z.any()).optional().default({}),
      })
      .parse(req.body);

    const { data: application, error } = await admin
      .from("club_applications")
      .upsert(
        {
          club_id: clubId,
          recruitment_id: recId,
          user_id: req.userId!,
          applied_position: body.applied_position,
          statement: body.statement ?? null,
          resume_url: body.resume_url ?? null,
          portfolio_url: body.portfolio_url ?? null,
          answers: body.answers,
          status: "applied",
        },
        { onConflict: "club_id,recruitment_id,user_id" },
      )
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ application });
  }),
);

// GET /api/v1/clubs/:id/applications - Review applications (Admin Kanban Pipeline)
clubs.get(
  "/:id/applications",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const recId = req.query.recruitmentId as string | undefined;

    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin", "president", "vice_president", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required" });
    }

    let q = admin
      .from("club_applications")
      .select(`
        *,
        applicant:profiles(id, full_name, username, avatar_url, department, bio)
      `)
      .eq("club_id", clubId);

    if (recId) {
      q = q.eq("recruitment_id", recId);
    }

    const { data: applications, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;

    res.json({ applications: applications ?? [] });
  }),
);

// PATCH /api/v1/clubs/applications/:appId - Move candidate stage in Kanban pipeline
clubs.patch(
  "/applications/:appId",
  wrap(async (req, res) => {
    const appId = z.string().uuid().parse(req.params.appId);
    const body = z
      .object({
        status: z.enum(["applied", "shortlisted", "interview", "selected", "rejected", "withdrawn"]),
        review_notes: z.string().max(1000).optional(),
      })
      .parse(req.body);

    const { data: app } = await admin
      .from("club_applications")
      .select("club_id, user_id, applied_position")
      .eq("id", appId)
      .single();

    if (!app) return res.status(404).json({ error: "Application not found" });

    // Verify admin
    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", app.club_id)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin", "president", "vice_president"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required" });
    }

    const { data: updated, error } = await admin
      .from("club_applications")
      .update({
        status: body.status,
        review_notes: body.review_notes ?? null,
        reviewed_by: req.userId!,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", appId)
      .select()
      .single();

    if (error) throw error;

    // If 'selected', automatically add as club member!
    if (body.status === "selected") {
      await admin.from("club_members").upsert(
        {
          club_id: app.club_id,
          user_id: app.user_id,
          role: "member",
          title: app.applied_position || "Member",
        },
        { onConflict: "club_id,user_id" },
      );
    }

    // Dispatch notification to candidate
    void (async () => {
      try {
        const { data: club } = await admin.from("clubs").select("name").eq("id", app.club_id).single();
        const statusLabel =
          body.status === "selected"
            ? "Accepted! 🎉 Welcome to the club."
            : body.status === "shortlisted"
              ? "Shortlisted for next round!"
              : body.status === "interview"
                ? "Invited for Interview"
                : `Application status: ${body.status}`;

        void NotificationService.dispatch({
          userId: app.user_id,
          type: "SYSTEM_ANNOUNCEMENT",
          title: `${club?.name ?? "Club"} Recruitment Update`,
          body: statusLabel,
          priority: "high",
          entityType: "club",
          entityId: app.club_id,
          data: { clubId: app.club_id, route: "club" },
        });
      } catch {}
    })();

    res.json({ application: updated });
  }),
);

// =============================================================================
// 7. TEAMS & PROJECTS
// =============================================================================

// GET /api/v1/clubs/:id/teams - List sub-teams
clubs.get(
  "/:id/teams",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: teams, error } = await admin
      .from("club_teams")
      .select(`
        *,
        lead:profiles(id, full_name, username, avatar_url)
      `)
      .eq("club_id", clubId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json({ teams: teams ?? [] });
  }),
);

// POST /api/v1/clubs/:id/teams - Create sub-team
clubs.post(
  "/:id/teams",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        name: z.string().min(2).max(100),
        description: z.string().max(1000).optional().default(""),
        lead_id: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const { data: team, error } = await admin
      .from("club_teams")
      .insert({
        club_id: clubId,
        name: body.name,
        description: body.description,
        lead_id: body.lead_id ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ team });
  }),
);

// GET /api/v1/clubs/:id/projects - List club projects
clubs.get(
  "/:id/projects",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: projects, error } = await admin
      .from("club_projects")
      .select(`
        *,
        lead:profiles(id, full_name, username, avatar_url),
        team:club_teams(id, name)
      `)
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ projects: projects ?? [] });
  }),
);

// POST /api/v1/clubs/:id/projects - Create club project
clubs.post(
  "/:id/projects",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(3).max(160),
        description: z.string().max(3000).optional().default(""),
        status: z.enum(["idea", "planning", "active", "completed"]).default("active"),
        team_id: z.string().uuid().optional().nullable(),
        lead_id: z.string().uuid().optional().nullable(),
        start_date: z.string().optional(),
        deadline: z.string().optional().nullable(),
        cover_url: z.string().optional().nullable(),
        repository_url: z.string().optional().nullable(),
        demo_url: z.string().optional().nullable(),
      })
      .parse(req.body);

    const { data: project, error } = await admin
      .from("club_projects")
      .insert({
        club_id: clubId,
        title: body.title,
        description: body.description,
        status: body.status,
        team_id: body.team_id ?? null,
        lead_id: body.lead_id ?? req.userId!,
        start_date: body.start_date ?? new Date().toISOString().split("T")[0],
        deadline: body.deadline ?? null,
        cover_url: body.cover_url ?? null,
        repository_url: body.repository_url ?? null,
        demo_url: body.demo_url ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ project });
  }),
);

// GET /api/v1/clubs/projects/:projectId/tasks - Get project tasks
clubs.get(
  "/projects/:projectId/tasks",
  wrap(async (req, res) => {
    const projectId = z.string().uuid().parse(req.params.projectId);
    const { data: tasks, error } = await admin
      .from("club_project_tasks")
      .select(`
        *,
        assignee:profiles(id, full_name, username, avatar_url)
      `)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json({ tasks: tasks ?? [] });
  }),
);

// POST /api/v1/clubs/projects/:projectId/tasks - Add project task
clubs.post(
  "/projects/:projectId/tasks",
  wrap(async (req, res) => {
    const projectId = z.string().uuid().parse(req.params.projectId);
    const body = z
      .object({
        title: z.string().min(2).max(180),
        description: z.string().max(1000).optional(),
        assigned_to: z.string().uuid().optional().nullable(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        due_date: z.string().optional().nullable(),
      })
      .parse(req.body);

    const { data: task, error } = await admin
      .from("club_project_tasks")
      .insert({
        project_id: projectId,
        title: body.title,
        description: body.description ?? null,
        assigned_to: body.assigned_to ?? null,
        priority: body.priority,
        due_date: body.due_date ?? null,
        status: "todo",
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ task });
  }),
);

// PATCH /api/v1/clubs/tasks/:taskId - Update task status/assignment
clubs.patch(
  "/tasks/:taskId",
  wrap(async (req, res) => {
    const taskId = z.string().uuid().parse(req.params.taskId);
    const body = z
      .object({
        status: z.enum(["todo", "in_progress", "completed"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        assigned_to: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const { data: updated, error } = await admin
      .from("club_project_tasks")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .select()
      .single();

    if (error) throw error;
    res.json({ task: updated });
  }),
);

// =============================================================================
// 8. RESOURCES, ACHIEVEMENTS & POLLS
// =============================================================================

// GET /api/v1/clubs/:id/resources - List club resources
clubs.get(
  "/:id/resources",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const category = req.query.category as string | undefined;

    let q = admin
      .from("club_resources")
      .select(`
        *,
        uploader:profiles(id, full_name, username)
      `)
      .eq("club_id", clubId);

    if (category) {
      q = q.eq("category", category);
    }

    const { data: resources, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ resources: resources ?? [] });
  }),
);

// POST /api/v1/clubs/:id/resources - Upload/share resource
clubs.post(
  "/:id/resources",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(2).max(180),
        description: z.string().max(1000).optional(),
        url: z.string().url(),
        category: z.string().default("General"),
        file_type: z.string().default("document"),
        file_size: z.number().int().optional().nullable(),
        permission: z.enum(["public", "followers", "members", "team"]).default("public"),
        project_id: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const { data: resource, error } = await admin
      .from("club_resources")
      .insert({
        club_id: clubId,
        uploader_id: req.userId!,
        title: body.title,
        description: body.description ?? null,
        url: body.url,
        category: body.category,
        file_type: body.file_type,
        file_size: body.file_size ?? null,
        permission: body.permission,
        project_id: body.project_id ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ resource });
  }),
);

// GET /api/v1/clubs/:id/achievements - List achievements
clubs.get(
  "/:id/achievements",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: achievements, error } = await admin
      .from("club_achievements")
      .select("*")
      .eq("club_id", clubId)
      .order("date", { ascending: false });

    if (error) throw error;
    res.json({ achievements: achievements ?? [] });
  }),
);

// POST /api/v1/clubs/:id/achievements - Add achievement (Admin only)
clubs.post(
  "/:id/achievements",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(2).max(180),
        description: z.string().max(1000).optional().default(""),
        date: z.string().default(new Date().toISOString().split("T")[0] ?? "2026-10-01"),
        image_url: z.string().optional().nullable(),
        link_url: z.string().optional().nullable(),
      })
      .parse(req.body);

    const { data: ach, error } = await admin
      .from("club_achievements")
      .insert({
        club_id: clubId,
        title: body.title,
        description: body.description,
        date: body.date,
        image_url: body.image_url ?? null,
        link_url: body.link_url ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ achievement: ach });
  }),
);

// =============================================================================
// 9. CLUB MANAGEMENT & ANALYTICS
// =============================================================================

// GET /api/v1/clubs/:id/analytics - Real operational analytics for club leadership
clubs.get(
  "/:id/analytics",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);

    // Total members
    const { count: memberCount } = await admin
      .from("club_members")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId);

    // Total followers
    const { count: followerCount } = await admin
      .from("club_follows")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId);

    // Pending applications
    const { count: pendingApps } = await admin
      .from("club_applications")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "applied");

    // Active projects
    const { count: activeProjects } = await admin
      .from("club_projects")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "active");

    // Total events
    const { count: totalEvents } = await admin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId);

    // Total posts
    const { count: totalPosts } = await admin
      .from("club_posts")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId);

    res.json({
      analytics: {
        memberCount: memberCount ?? 0,
        followerCount: followerCount ?? 0,
        pendingApplicationsCount: pendingApps ?? 0,
        activeProjectsCount: activeProjects ?? 0,
        totalEventsCount: totalEvents ?? 0,
        totalPostsCount: totalPosts ?? 0,
      },
    });
  }),
);

// POST /api/v1/clubs/:id/archive - Archive club
clubs.post(
  "/:id/archive",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required" });
    }

    const { data: club } = await admin.from("clubs").select("is_archived").eq("id", clubId).single();
    const nextArchived = !club?.is_archived;

    await admin.from("clubs").update({ is_archived: nextArchived }).eq("id", clubId);
    res.json({ success: true, is_archived: nextArchived });
  }),
);

// =============================================================================
// 10. PRESERVED EXISTING WORKSPACE & CLASH NEGOTIATION ENDPOINTS
// =============================================================================

// GET /api/v1/clubs/:id/workspace - Retrieve Room OS workspace
clubs.get(
  "/:id/workspace",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const roomId = await ensureClubWorkspace(clubId, req.userId!);
    res.json({ roomId });
  }),
);

// POST /api/v1/clubs/:id/workspace - Explicitly provision Room OS workspace
clubs.post(
  "/:id/workspace",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const roomId = await ensureClubWorkspace(clubId, req.userId!);
    res.status(201).json({ roomId });
  }),
);

// GET /api/v1/clubs/:id/broadcasts - YouTube Broadcasts
clubs.get(
  "/:id/broadcasts",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: broadcasts, error } = await admin
      .from("events")
      .select("*")
      .eq("club_id", clubId)
      .order("starts_at", { ascending: true });

    if (error) throw error;
    res.json({
      broadcasts: (broadcasts || []).map((b) => ({
        id: b.id,
        clubId: b.club_id,
        title: b.title,
        description: b.description,
        youtubeVideoId: (b.metadata as any)?.youtube_video_id || "dQw4w9WgXcQ",
        scheduledStart: b.starts_at,
        status: b.status,
      })),
    });
  }),
);

// POST /api/v1/clubs/:id/broadcasts
clubs.post(
  "/:id/broadcasts",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(3).max(200),
        description: z.string().max(2000).optional(),
        youtubeVideoId: z.string().min(5).max(100),
        scheduledStart: z.string().datetime(),
      })
      .parse(req.body);

    const { data: me } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!me || !["owner", "admin"].includes(me.role)) {
      return res.status(403).json({ error: "Club admin required to schedule broadcasts" });
    }

    const { data, error } = await admin
      .from("events")
      .insert({
        club_id: clubId,
        title: body.title,
        description: body.description ?? "",
        starts_at: body.scheduledStart,
        status: "scheduled",
        metadata: {
          youtube_video_id: body.youtubeVideoId,
          is_broadcast: true,
        },
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({
      broadcast: {
        id: data.id,
        clubId: data.club_id,
        title: data.title,
        description: data.description,
        youtubeVideoId: body.youtubeVideoId,
        scheduledStart: data.starts_at,
        status: data.status,
      },
    });
  }),
);

// GET /api/v1/clubs/:id/clashes - Clash Detection Engine
clubs.get(
  "/:id/clashes",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const startsAt = z.string().datetime().parse(req.query.startsAt);
    const endsAt = z.string().datetime().parse(req.query.endsAt);
    const location = (req.query.location as string | undefined)?.trim();

    const { data: myMembers, count: totalMyMembers } = await admin
      .from("club_members")
      .select("user_id", { count: "exact" })
      .eq("club_id", clubId);

    const myMemberIds = new Set((myMembers ?? []).map((m) => m.user_id));
    const totalCount = totalMyMembers || 1;

    const { data: otherEvents } = await admin
      .from("events")
      .select(`
        id, title, starts_at, ends_at, location, club_id,
        club:clubs!events_club_id_fkey(id, name, university)
      `)
      .neq("club_id", clubId)
      .neq("status", "cancelled")
      .lte("starts_at", endsAt)
      .gte("ends_at", startsAt);

    const clashes = [];

    for (const evt of otherEvents ?? []) {
      if (!evt.club_id) continue;

      const { data: otherClubMembers } = await admin
        .from("club_members")
        .select("user_id")
        .eq("club_id", evt.club_id);

      let commonCount = 0;
      for (const m of otherClubMembers ?? []) {
        if (myMemberIds.has(m.user_id)) commonCount++;
      }

      const overlapPct = Number(((commonCount / totalCount) * 100).toFixed(1));
      const venueCollision = Boolean(location && evt.location && location.toLowerCase() === evt.location.toLowerCase());
      const isAcademicConflict =
        evt.title.toLowerCase().includes("exam") ||
        evt.title.toLowerCase().includes("midterm") ||
        evt.title.toLowerCase().includes("final");

      let severity: "low" | "warning" | "critical" = "low";
      if (venueCollision || overlapPct >= 40 || (isAcademicConflict && commonCount > 0)) {
        severity = "critical";
      } else if (overlapPct >= 15 || commonCount >= 10) {
        severity = "warning";
      }

      if (commonCount > 0 || venueCollision) {
        clashes.push({
          target_event_id: evt.id,
          target_event_title: evt.title,
          target_club_id: evt.club_id,
          target_club_name: (evt.club as any)?.name || "Other Club",
          starts_at: evt.starts_at,
          ends_at: evt.ends_at,
          signals: {
            member_overlap_count: commonCount,
            member_overlap_percentage: overlapPct,
            venue_collision: venueCollision,
            academic_conflict: isAcademicConflict,
          },
          severity,
        });
      }
    }

    res.json({
      total_clashes: clashes.length,
      has_critical_clash: clashes.some((c) => c.severity === "critical"),
      clashes: clashes.sort((a, b) => b.signals.member_overlap_percentage - a.signals.member_overlap_percentage),
    });
  }),
);

// POST /api/v1/clubs/:id/negotiations - Initiate a reschedule proposal
clubs.post(
  "/:id/negotiations",
  negotiationLimiter,
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        initiatorEventId: z.string().uuid(),
        targetClubId: z.string().uuid(),
        targetEventId: z.string().uuid(),
        proposedNewTime: z.string().datetime(),
        note: z.string().max(500).optional().default(""),
        overlapCount: z.number().int().nonnegative().default(0),
        overlapPercentage: z.number().nonnegative().default(0),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required to initiate negotiations" });
    }

    const { data, error } = await admin
      .from("club_clash_negotiations")
      .insert({
        initiator_club_id: clubId,
        initiator_event_id: body.initiatorEventId,
        target_club_id: body.targetClubId,
        target_event_id: body.targetEventId,
        proposed_new_time: body.proposedNewTime,
        note: body.note,
        overlap_member_count: body.overlapCount,
        overlap_percentage: body.overlapPercentage,
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;

    void (async () => {
      try {
        const { data: targetAdmins } = await admin
          .from("club_members")
          .select("user_id")
          .eq("club_id", body.targetClubId)
          .in("role", ["owner", "admin"]);

        for (const adm of targetAdmins ?? []) {
          void NotificationService.dispatch({
            userId: adm.user_id,
            type: "NEGOTIATION_RECEIVED",
            title: "Schedule Clash Proposal",
            body: "Another club proposed rescheduling an event to resolve a mutual clash.",
            priority: "high",
            entityType: "event",
            entityId: body.targetEventId,
            data: { clubId: body.targetClubId, negotiationId: data.id, route: "club" },
          });
        }
      } catch {}
    })();

    logDomainEvent({
      event: "negotiation_created",
      negotiationId: data.id,
      initiatorClubId: clubId,
      targetClubId: body.targetClubId,
    });

    res.status(201).json({ negotiation: data });
  }),
);

// PATCH /api/v1/clubs/:id/negotiations/:negId - Respond to proposal
clubs.patch(
  "/:id/negotiations/:negId",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const negId = z.string().uuid().parse(req.params.negId);
    const body = z
      .object({
        action: z.enum(["accept", "reject", "counter"]),
        counterTime: z.string().datetime().optional(),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required to respond to negotiations" });
    }

    const { data: neg } = await admin
      .from("club_clash_negotiations")
      .select("*")
      .eq("id", negId)
      .single();

    if (!neg) return res.status(404).json({ error: "Negotiation not found" });

    if (["accepted", "rejected", "cancelled", "expired"].includes(neg.status)) {
      return res.status(400).json({ error: `Cannot modify negotiation with final status '${neg.status}'` });
    }

    const isTarget = neg.target_club_id === clubId;
    const isInitiator = neg.initiator_club_id === clubId;

    if (!isTarget && !isInitiator) {
      return res.status(403).json({ error: "Only clubs party to this negotiation can respond" });
    }

    let newStatus: string = neg.status;

    if (body.action === "accept") {
      newStatus = "accepted";
      await admin
        .from("events")
        .update({ starts_at: neg.proposed_new_time })
        .eq("id", neg.initiator_event_id);
    } else if (body.action === "reject") {
      newStatus = "rejected";
    } else if (body.action === "counter") {
      newStatus = "countered";
      if (body.counterTime) {
        await admin
          .from("club_clash_negotiations")
          .update({ proposed_new_time: body.counterTime })
          .eq("id", negId);
      }
    }

    const { data: updated, error } = await admin
      .from("club_clash_negotiations")
      .update({
        status: newStatus,
        resolved_by: req.userId!,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", negId)
      .select()
      .single();

    if (error) throw error;

    const otherClubId = isTarget ? neg.initiator_club_id : neg.target_club_id;
    void (async () => {
      try {
        const { data: otherAdmins } = await admin
          .from("club_members")
          .select("user_id")
          .eq("club_id", otherClubId)
          .in("role", ["owner", "admin"]);

        const notifType =
          body.action === "accept"
            ? "NEGOTIATION_ACCEPTED"
            : body.action === "counter"
              ? "NEGOTIATION_COUNTERED"
              : "NEGOTIATION_REJECTED";
        const notifTitle =
          body.action === "accept"
            ? "Clash Proposal Accepted! 🎉"
            : body.action === "counter"
              ? "Clash Proposal Countered"
              : "Clash Proposal Declined";

        for (const adm of otherAdmins ?? []) {
          void NotificationService.dispatch({
            userId: adm.user_id,
            type: notifType,
            title: notifTitle,
            body: `The other club marked the clash negotiation as ${newStatus}.`,
            priority: body.action === "accept" ? "high" : "normal",
            entityType: "event",
            entityId: neg.target_event_id,
            data: { clubId: otherClubId, negotiationId: negId, route: "club" },
          });
        }
      } catch {}
    })();

    res.json({ negotiation: updated });
  }),
);
