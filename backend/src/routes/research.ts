import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";

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
  "/projects",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("research_projects")
      .select("*, owner:profiles!research_projects_owner_id_fkey(id, full_name, username, avatar_url)")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ data });
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
    
    const { data: project } = await admin.from("research_projects").select("owner_id").eq("id", id).single();
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.owner_id === req.userId) return res.status(400).json({ error: "Cannot collaborate with yourself" });

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
    // Get requests sent TO me (for my projects) and FROM me
    const { data: myProjects } = await admin.from("research_projects").select("id").eq("owner_id", req.userId!);
    const projectIds = myProjects?.map(p => p.id) ?? [];
    
    const query = admin.from("research_collaboration_requests").select("*, project:research_projects(id, title), requester:profiles!research_collaboration_requests_requester_id_fkey(id, full_name, username)");
    
    if (projectIds.length > 0) {
      query.or(`requester_id.eq.${req.userId},project_id.in.(${projectIds.join(',')})`);
    } else {
      query.eq("requester_id", req.userId!);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
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
      await notifyUser(request.requester_id, "Collaboration Accepted", "Your collaboration request was accepted.", "research", { projectId: request.project_id });
    }
    
    res.json(data);
  }),
);
