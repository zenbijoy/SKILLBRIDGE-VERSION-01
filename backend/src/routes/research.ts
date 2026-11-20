import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
import { ensureResearchWorkspace } from "../services/spaceWorkspaceService.js";
import {
  searchPapers,
  getPaper,
  getPaperReferences,
  getPaperCitations,
  getAuthor,
  getTrendingPapers,
  formatAPA,
  formatBibtex,
  TRENDING_TOPICS,
} from "../services/semanticScholar.js";
import {
  searchAcademicPapers,
  getLatestRealtimePapers,
  resolvePaper,
  getAvailableSources,
} from "../services/paperSources.js";
import {
  generateUniversalCitation,
  generateAllCitations,
  type CitationStyle,
} from "../services/citationService.js";
import {
  getOrGeneratePaperInsights,
  askPaperQuestion,
} from "../services/paperAiService.js";
import { getSocketServer } from "../socket.js";

export const research = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const projectSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().max(2000).optional(),
  status: z.enum(["draft", "active", "completed", "archived"]).default("active"),
  research_areas: z.array(z.string()).default([]),
  methods: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  looking_for_collaborators: z.boolean().default(false),
  collaboration_requirements: z.string().max(1000).optional(),
  visibility: z.enum(["public", "private"]).default("public"),
});

// ─── EXISTING: Research Projects ─────────────────────────────────────────────

research.get(
  "/stats",
  wrap(async (_req, res) => {
    const [totalProjects, openCalls, completedRes] = await Promise.all([
      admin.from("research_projects").select("*", { count: "exact", head: true }).eq("visibility", "public"),
      admin.from("research_projects").select("*", { count: "exact", head: true }).eq("looking_for_collaborators", true).eq("visibility", "public"),
      admin.from("research_projects").select("*", { count: "exact", head: true }).eq("status", "completed").eq("visibility", "public"),
    ]);

    res.json({
      totalProjects: totalProjects.count ?? 0,
      openCalls: openCalls.count ?? 0,
      completedProjects: completedRes.count ?? 0,
    });
  }),
);

research.get(
  "/projects",
  wrap(async (req, res) => {
    const area = typeof req.query.area === "string" ? req.query.area.trim() : "";
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const openOnly = req.query.openOnly === "true";

    let query = admin
      .from("research_projects")
      .select("*, owner:profiles!research_projects_owner_id_fkey(id, full_name, username, avatar_url, university, department)")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(60);

    if (openOnly) {
      query = query.eq("looking_for_collaborators", true);
    }
    if (area && area !== "all") {
      query = query.contains("research_areas", [area]);
    }
    if (search.length >= 2) {
      query = query.or(`title.ilike.%${search.replace(/[%_]/g, "")}%,description.ilike.%${search.replace(/[%_]/g, "")}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data ?? [] });
  }),
);

research.post(
  "/projects",
  wrap(async (req, res) => {
    const body = projectSchema.parse(req.body);
    const { data, error } = await admin
      .from("research_projects")
      .insert({ ...body, owner_id: req.userId! })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

research.delete(
  "/projects/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { error } = await admin
      .from("research_projects")
      .delete()
      .eq("id", id)
      .eq("owner_id", req.userId!);
    if (error) throw error;
    res.status(204).end();
  }),
);

research.get(
  "/projects/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("research_projects")
      .select("*, owner:profiles!research_projects_owner_id_fkey(id, full_name, username, avatar_url, university, department)")
      .eq("id", id)
      .single();
    if (error) throw error;
    if (data.visibility === "private" && data.owner_id !== req.userId) {
      const { data: member } = await admin
        .from("research_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle();

      if (!member) {
        return res.status(403).json({ error: "Private project" });
      }
    }

    const { data: members } = await admin
      .from("research_members")
      .select("id, role, user:profiles(id, full_name, username, avatar_url)")
      .eq("project_id", id);

    const isOwner = data.owner_id === req.userId;
    const isMember = isOwner || (members ?? []).some((m: any) => m.user?.id === req.userId);

    let roomId = (data as any).room_id;
    if (!roomId && (isOwner || isMember)) {
      try {
        roomId = await ensureResearchWorkspace(id, data.owner_id);
      } catch {}
    }

    let myApplication = null;
    if (!isMember) {
      const { data: app } = await admin
        .from("research_collaboration_requests")
        .select("id, status")
        .eq("project_id", id)
        .eq("requester_id", req.userId!)
        .maybeSingle();
      myApplication = app ?? null;
    }

    res.json({
      project: {
        ...data,
        room_id: roomId,
        is_member: isMember,
        is_owner: isOwner,
        members: members ?? [],
      },
      myApplication,
    });
  }),
);

research.patch(
  "/projects/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = projectSchema.partial().parse(req.body);
    const { data, error } = await admin
      .from("research_projects")
      .update(body)
      .eq("id", id)
      .eq("owner_id", req.userId!)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(403).json({ error: "Not authorized" });
    res.json(data);
  }),
);

research.post(
  "/projects/:id/collaborate",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { message } = z.object({ message: z.string().max(1000).optional() }).parse(req.body);

    const { data: project } = await admin
      .from("research_projects")
      .select("owner_id, visibility, looking_for_collaborators, status")
      .eq("id", id)
      .single();

    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.owner_id === req.userId) return res.status(400).json({ error: "Cannot collaborate with yourself" });
    if (project.visibility === "private") return res.status(403).json({ error: "This project is private" });
    if (!project.looking_for_collaborators) return res.status(400).json({ error: "Project is not currently recruiting collaborators" });

    const { data, error } = await admin
      .from("research_collaboration_requests")
      .insert({ project_id: id, requester_id: req.userId!, message })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return res.status(400).json({ error: "Already requested" });
      throw error;
    }

    await notifyUser(project.owner_id, "New Collaboration Request", "Someone requested to collaborate on your research project.", "research", { projectId: id });
    res.status(201).json(data);
  }),
);

research.get(
  "/collaboration-requests",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("research_collaboration_requests")
      .select("*, project:research_projects(id, title, owner_id), requester:profiles(id, full_name, avatar_url, department, university)")
      .eq("project.owner_id", req.userId!);

    if (error) throw error;
    res.json({ data: data ?? [] });
  }),
);

research.patch(
  "/collaboration-requests/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z.object({ status: z.enum(["accepted", "rejected", "cancelled"]) }).parse(req.body);

    const { data: request } = await admin
      .from("research_collaboration_requests")
      .select("*, project:research_projects(owner_id)")
      .eq("id", id)
      .single();

    if (!request) return res.status(404).json({ error: "Not found" });

    if (["accepted", "rejected"].includes(status)) {
      if ((request.project as any).owner_id !== req.userId) return res.status(403).json({ error: "Not authorized" });
    } else if (status === "cancelled") {
      if (request.requester_id !== req.userId) return res.status(403).json({ error: "Not authorized" });
    }

    const { data, error } = await admin
      .from("research_collaboration_requests")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    let roomId: string | null = null;
    if (status === "accepted") {
      await admin
        .from("research_members")
        .insert({
          project_id: request.project_id,
          user_id: request.requester_id,
          role: "collaborator",
        })
        .select()
        .maybeSingle();

      const ownerId = (request.project as any).owner_id;
      roomId = await ensureResearchWorkspace(request.project_id, ownerId);

      if (roomId) {
        await admin.from("room_members").upsert({
          room_id: roomId,
          user_id: request.requester_id,
          role: "member",
        } as any);
      }

      await notifyUser(request.requester_id, "Collaboration Accepted 🎉", "Your collaboration request was accepted! You now have access to the Research Workspace.", "research", { projectId: request.project_id, roomId });
      await notifyUser(ownerId, "New Team Member 🔬", "A new collaborator has joined your research workspace.", "research", { projectId: request.project_id, roomId });
    }

    res.json({ ...data, roomId });
  }),
);

research.get(
  "/projects/:id/workspace",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: project } = await admin
      .from("research_projects")
      .select("id, owner_id, visibility, room_id")
      .eq("id", id)
      .maybeSingle();

    if (!project) return res.status(404).json({ error: "Project not found" });

    const isOwner = project.owner_id === req.userId;
    const { data: member } = await admin
      .from("research_members")
      .select("role")
      .eq("project_id", id)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!isOwner && !member) {
      return res.status(403).json({ error: "Access denied. Only accepted collaborators can open the research workspace." });
    }

    const roomId = await ensureResearchWorkspace(id, project.owner_id);

    // Ensure requesting user is actively enrolled in room_members & room conversations
    try {
      await admin.from("room_members").upsert(
        {
          room_id: roomId,
          user_id: req.userId!,
          role: isOwner ? "owner" : "member",
        } as any,
        { onConflict: "room_id,user_id" },
      );

      const { data: r } = await admin.from("rooms").select("conversation_id").eq("id", roomId).maybeSingle();
      if (r?.conversation_id) {
        await admin.from("conversation_members").upsert(
          {
            conversation_id: r.conversation_id,
            user_id: req.userId!,
            role: isOwner ? "owner" : "member",
          },
          { onConflict: "conversation_id,user_id" },
        );
      }
    } catch {}

    res.json({ roomId });
  }),
);

research.post(
  "/projects/:id/workspace",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: project } = await admin
      .from("research_projects")
      .select("id, owner_id")
      .eq("id", id)
      .maybeSingle();

    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.owner_id !== req.userId) {
      return res.status(403).json({ error: "Only project owner can provision workspace" });
    }

    const roomId = await ensureResearchWorkspace(id, project.owner_id);
    res.status(201).json({ roomId });
  }),
);

// ─── NEW: Multi-Source Real-Time Academic Paper Search & Reading APIs ────────

research.get(
  "/papers/search",
  wrap(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q || q.length < 2) return res.status(400).json({ error: "Query too short" });

    const offset = parseInt(String(req.query.offset ?? "0"), 10);
    const limit = Math.min(parseInt(String(req.query.limit ?? "15"), 10), 30);
    const field = typeof req.query.field === "string" ? req.query.field : undefined;
    const year = typeof req.query.year === "string" ? req.query.year : undefined;
    const openAccess = req.query.openAccess === "true";
    const source = typeof req.query.source === "string" ? (req.query.source as any) : "all";

    const result = await searchAcademicPapers(q, {
      source,
      offset,
      limit,
      field,
      year,
      openAccess,
    });
    res.json(result);
  }),
);

research.get(
  "/papers/latest",
  wrap(async (req, res) => {
    const discipline = typeof req.query.discipline === "string" ? req.query.discipline : undefined;
    const papers = await getLatestRealtimePapers(discipline);
    res.json({ data: papers, discipline: discipline || "AI & Machine Learning" });
  }),
);

research.get(
  "/papers/sources",
  wrap(async (_req, res) => {
    res.json({ sources: getAvailableSources() });
  }),
);

research.get(
  "/papers/:paperId/read-url",
  wrap(async (req, res) => {
    const paperId = String(req.params.paperId);
    const paper = await resolvePaper(paperId);
    res.json({
      paperId,
      readUrl: paper.readUrl,
      pdfUrl: paper.pdfUrl,
      isOpenAccess: paper.isOpenAccess,
      source: paper.source,
      sourceLabel: paper.sourceLabel,
    });
  }),
);

research.get(
  "/papers/:paperId",
  wrap(async (req, res) => {
    const paperId = String(req.params.paperId);
    const paper = await resolvePaper(paperId);
    res.json(paper);
  }),
);

research.get(
  "/papers/:paperId/references",
  wrap(async (req, res) => {
    const paperId = String(req.params.paperId);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);
    const result = await getPaperReferences(paperId, { offset, limit: 10 });
    res.json(result);
  }),
);

research.get(
  "/papers/:paperId/citations",
  wrap(async (req, res) => {
    const paperId = String(req.params.paperId);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);
    const result = await getPaperCitations(paperId, { offset, limit: 10 });
    res.json(result);
  }),
);

research.get(
  "/papers/:paperId/cite",
  wrap(async (req, res) => {
    const paperId = String(req.params.paperId);
    const requestedFormat = (String(req.query.format || "apa").toLowerCase()) as CitationStyle;
    const paper = await resolvePaper(paperId);
    const allFormats = generateAllCitations(paper);
    const citation = allFormats[requestedFormat] || allFormats.apa;
    res.json({
      citation,
      format: requestedFormat,
      allFormats,
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      doi: paper.externalIds?.DOI,
      url: paper.readUrl || paper.url,
    });
  }),
);

// ─── AI Paper Assistant & Key Insights ──────────────────────────────────────

research.get(
  "/papers/:paperId/ai-insights",
  wrap(async (req, res) => {
    const paperId = String(req.params.paperId);
    const paper = await resolvePaper(paperId);
    const insights = await getOrGeneratePaperInsights(paper);
    res.json(insights);
  }),
);

research.post(
  "/papers/:paperId/ai-qa",
  wrap(async (req, res) => {
    const paperId = String(req.params.paperId);
    const { question } = z.object({ question: z.string().min(2).max(500) }).parse(req.body);
    const paper = await resolvePaper(paperId);
    const answer = await askPaperQuestion(paper, question);
    res.json(answer);
  }),
);

// ─── Workspace Integration ───────────────────────────────────────────────────

research.get(
  "/user/workspaces",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { data: owned } = await admin
      .from("research_projects")
      .select("id, title, status, room_id")
      .eq("owner_id", userId);

    const { data: memberProjects } = await admin
      .from("research_members")
      .select("project_id, research_projects(id, title, status, room_id)")
      .eq("user_id", userId)
      .eq("status", "accepted");

    const projectsMap = new Map<string, { id: string; title: string; roomId: string | null }>();
    (owned || []).forEach((p: any) => {
      projectsMap.set(p.id, { id: p.id, title: p.title, roomId: p.room_id || null });
    });
    (memberProjects || []).forEach((mp: any) => {
      const p = mp.research_projects;
      if (p && !projectsMap.has(p.id)) {
        projectsMap.set(p.id, { id: p.id, title: p.title, roomId: p.room_id || null });
      }
    });

    const workspaces = [];
    for (const [projId, p] of projectsMap.entries()) {
      const roomId = p.roomId || (await ensureResearchWorkspace(projId, userId));
      const { data: room } = await admin
        .from("rooms")
        .select("id, name, conversation_id")
        .eq("id", roomId)
        .maybeSingle();

      if (room) {
        workspaces.push({
          projectId: projId,
          projectTitle: p.title,
          roomId: room.id,
          roomName: room.name,
          conversationId: room.conversation_id,
        });
      }
    }

    res.json({ data: workspaces });
  }),
);

research.post(
  "/papers/:paperId/share-to-workspace",
  wrap(async (req, res) => {
    const paperId = String(req.params.paperId);
    const userId = req.userId!;
    const { roomId, comment } = z
      .object({
        roomId: z.string().uuid(),
        comment: z.string().max(1000).optional(),
      })
      .parse(req.body);

    // Verify room membership
    const { data: membership } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "You are not a member of this workspace" });
    }

    const { data: room } = await admin
      .from("rooms")
      .select("id, conversation_id, name")
      .eq("id", roomId)
      .maybeSingle();

    if (!room?.conversation_id) {
      return res.status(400).json({ error: "Workspace has no active conversation" });
    }

    const paper = await resolvePaper(paperId);
    const authorsStr = (paper.authors || []).slice(0, 3).map((a) => a.name).join(", ");
    const readLink = paper.readUrl || paper.pdfUrl || paper.url || "";

    let messageBody = `📄 **Research Paper Shared**: [${paper.title}](${readLink})\n` +
      `*Authors*: ${authorsStr || "Academic Authors"} (${paper.year || "Recent"})\n` +
      `*Source*: ${paper.sourceLabel || paper.source}`;

    if (comment && comment.trim()) {
      messageBody += `\n\n> 💬 **Note**: ${comment.trim()}`;
    }

    const { data: insertedMsg, error: msgErr } = await admin
      .from("messages")
      .insert({
        conversation_id: room.conversation_id,
        sender_id: userId,
        body: messageBody,
        attachment: {
          type: "paper_share",
          paperId: paper.paperId,
          title: paper.title,
          pdfUrl: paper.pdfUrl,
          readUrl: readLink,
          authors: authorsStr,
          year: paper.year,
          source: paper.source,
        },
      })
      .select()
      .single();

    if (msgErr) throw msgErr;

    // Broadcast via Socket.IO
    const io = getSocketServer();
    if (io && insertedMsg) {
      io.to(`conversation:${room.conversation_id}`).emit("message:new", insertedMsg);
      io.to(`room:${roomId}`).emit("room:paper_shared", {
        roomId,
        paperId: paper.paperId,
        title: paper.title,
      });
    }

    res.status(201).json({ success: true, message: insertedMsg });
  }),
);

// ─── NEW: Author Profiles ─────────────────────────────────────────────────────

research.get(
  "/authors/:authorId",
  wrap(async (req, res) => {
    const author = await getAuthor(String(req.params.authorId));
    res.json(author);
  }),
);

// ─── NEW: Trending Papers ─────────────────────────────────────────────────────

research.get(
  "/trending",
  wrap(async (req, res) => {
    const topic = typeof req.query.topic === "string" ? req.query.topic : undefined;
    const results = await getTrendingPapers(topic);
    res.json({ topics: results, allTopics: TRENDING_TOPICS });
  }),
);

// ─── NEW: Saved Papers ────────────────────────────────────────────────────────

research.get(
  "/saved-papers",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("saved_papers")
      .select("*")
      .eq("user_id", req.userId!)
      .order("saved_at", { ascending: false });
    if (error) throw error;
    res.json({ data: data ?? [] });
  }),
);

research.post(
  "/saved-papers",
  wrap(async (req, res) => {
    const body = z
      .object({
        paper_id: z.string().min(1),
        paper_data: z.object({}).passthrough(),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("saved_papers")
      .upsert(
        { user_id: req.userId!, paper_id: body.paper_id, paper_data: body.paper_data },
        { onConflict: "user_id,paper_id" },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

research.delete(
  "/saved-papers/:paperId",
  wrap(async (req, res) => {
    const { error } = await admin
      .from("saved_papers")
      .delete()
      .eq("user_id", req.userId!)
      .eq("paper_id", req.params.paperId);
    if (error) throw error;
    res.status(204).end();
  }),
);

// ─── NEW: Collections ─────────────────────────────────────────────────────────

research.get(
  "/collections",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("research_collections")
      .select("*, papers:collection_papers(count)")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ data: data ?? [] });
  }),
);

research.post(
  "/collections",
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(80),
        description: z.string().max(300).optional(),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("research_collections")
      .insert({ ...body, user_id: req.userId! })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

research.get(
  "/collections/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("research_collections")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Collection not found" });
    res.json(data);
  }),
);

research.patch(
  "/collections/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(300).optional(),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("research_collections")
      .update(body)
      .eq("id", id)
      .eq("user_id", req.userId!)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(403).json({ error: "Not found" });
    res.json(data);
  }),
);

research.delete(
  "/collections/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { error } = await admin
      .from("research_collections")
      .delete()
      .eq("id", id)
      .eq("user_id", req.userId!);
    if (error) throw error;
    res.status(204).end();
  }),
);

research.get(
  "/collections/:id/papers",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    // Verify ownership
    const { data: col } = await admin.from("research_collections").select("id").eq("id", id).eq("user_id", req.userId!).maybeSingle();
    if (!col) return res.status(403).json({ error: "Not found" });

    const { data, error } = await admin
      .from("collection_papers")
      .select("*")
      .eq("collection_id", id)
      .order("added_at", { ascending: false });
    if (error) throw error;
    res.json({ data: data ?? [] });
  }),
);

research.post(
  "/collections/:id/papers",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        paper_id: z.string().min(1),
        paper_data: z.object({}).passthrough(),
      })
      .parse(req.body);

    const { data: col } = await admin.from("research_collections").select("id").eq("id", id).eq("user_id", req.userId!).maybeSingle();
    if (!col) return res.status(403).json({ error: "Not found" });

    const { data, error } = await admin
      .from("collection_papers")
      .upsert(
        { collection_id: id, paper_id: body.paper_id, paper_data: body.paper_data },
        { onConflict: "collection_id,paper_id" },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

research.delete(
  "/collections/:id/papers/:paperId",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: col } = await admin.from("research_collections").select("id").eq("id", id).eq("user_id", req.userId!).maybeSingle();
    if (!col) return res.status(403).json({ error: "Not found" });

    const { error } = await admin
      .from("collection_papers")
      .delete()
      .eq("collection_id", id)
      .eq("paper_id", req.params.paperId);
    if (error) throw error;
    res.status(204).end();
  }),
);

// ─── NEW: Research Notes ──────────────────────────────────────────────────────

research.get(
  "/notes",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("research_notes")
      .select("*")
      .eq("user_id", req.userId!)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    res.json({ data: data ?? [] });
  }),
);

research.post(
  "/notes",
  wrap(async (req, res) => {
    const body = z
      .object({
        title: z.string().max(200).optional().default(""),
        body: z.string().max(50000).optional().default(""),
        paper_id: z.string().optional(),
        paper_title: z.string().max(300).optional(),
        tags: z.array(z.string()).default([]),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("research_notes")
      .insert({ ...body, user_id: req.userId! })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

research.get(
  "/notes/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("research_notes")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Note not found" });
    res.json(data);
  }),
);

research.patch(
  "/notes/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().max(200).optional(),
        body: z.string().max(50000).optional(),
        tags: z.array(z.string()).optional(),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("research_notes")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", req.userId!)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(403).json({ error: "Not found" });
    res.json(data);
  }),
);

research.delete(
  "/notes/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { error } = await admin
      .from("research_notes")
      .delete()
      .eq("id", id)
      .eq("user_id", req.userId!);
    if (error) throw error;
    res.status(204).end();
  }),
);

// ─── NEW: Reading History ─────────────────────────────────────────────────────

research.post(
  "/reading-history",
  wrap(async (req, res) => {
    const body = z
      .object({
        paper_id: z.string().min(1),
        paper_title: z.string().max(400),
        paper_year: z.number().optional(),
        paper_authors: z.array(z.string()).default([]),
      })
      .parse(req.body);

    await admin.from("paper_reading_history").upsert(
      { user_id: req.userId!, paper_id: body.paper_id, paper_title: body.paper_title, paper_year: body.paper_year, paper_authors: body.paper_authors, read_at: new Date().toISOString() },
      { onConflict: "user_id,paper_id" },
    );
    res.status(201).json({ ok: true });
  }),
);

research.get(
  "/reading-history",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("paper_reading_history")
      .select("*")
      .eq("user_id", req.userId!)
      .order("read_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ data: data ?? [] });
  }),
);
