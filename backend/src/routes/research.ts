import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
import { assertUuid } from "../lib/query-helpers.js";

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
      .select("*, owner:profiles!research_projects_owner_id_fkey(id, full_name, username, avatar_url)")
      .eq("id", id)
      .single();
    if (error) throw error;
    if (data.visibility === "private" && data.owner_id !== req.userId) {
      return res.status(403).json({ error: "Private project" });
    }
    res.json(data);
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

      // 2. Notify user
      await notifyUser(request.requester_id, "Collaboration Accepted", "Your collaboration request was accepted.", "research", { projectId: request.project_id });
    }
    
    res.json(data);
  }),
);
