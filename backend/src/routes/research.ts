import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
import { assertUuid } from "../lib/query-helpers.js";
import { ensureResearchWorkspace } from "../services/spaceWorkspaceService.js";

export const research = Router();

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
      // Check if user is an accepted member
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

    // Fetch members
    const { data: members } = await admin
      .from("research_members")
      .select("id, role, user:profiles(id, full_name, username, avatar_url)")
      .eq("project_id", id);

    const isOwner = data.owner_id === req.userId;
    const isMember = isOwner || (members ?? []).some((m: any) => m.user?.id === req.userId);

    // If owner or member, resolve or ensure workspace roomId
    let roomId = (data as any).room_id;
    if (!roomId && (isOwner || isMember)) {
      try {
        roomId = await ensureResearchWorkspace(id, data.owner_id);
      } catch {}
    }

    // Check my application status if not a member
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
    res.json({ requests: data ?? [] });
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
    
    // Only project owner can accept/reject, requester can only cancel
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
      // 1. Insert into research_members table
      await admin
        .from("research_members")
        .insert({
          project_id: request.project_id,
          user_id: request.requester_id,
          role: "collaborator",
        })
        .select()
        .maybeSingle();

      // 2. Idempotently ensure private research workspace exists
      const ownerId = (request.project as any).owner_id;
      roomId = await ensureResearchWorkspace(request.project_id, ownerId);

      // 3. Add accepted collaborator into room_members
      if (roomId) {
        await admin.from("room_members").upsert({
          room_id: roomId,
          user_id: request.requester_id,
          role: "member",
        } as any);
      }

      // 4. Notify both parties
      await notifyUser(request.requester_id, "Collaboration Accepted 🎉", "Your collaboration request was accepted! You now have access to the Research Workspace.", "research", { projectId: request.project_id, roomId });
      await notifyUser(ownerId, "New Team Member 🔬", "A new collaborator has joined your research workspace.", "research", { projectId: request.project_id, roomId });
    }
    
    res.json({ ...data, roomId });
  }),
);

// GET /api/v1/research/projects/:id/workspace - Retrieve or lazily provision workspace for members
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

    // Verify caller is owner or accepted collaborator
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
    res.json({ roomId });
  }),
);

// POST /api/v1/research/projects/:id/workspace - Explicitly provision workspace
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
