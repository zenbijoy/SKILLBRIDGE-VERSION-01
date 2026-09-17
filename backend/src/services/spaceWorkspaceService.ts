import { admin } from "../lib/db.js";

// In-memory fallback mapping in case remote Supabase column schema cache has not yet refreshed
const clubRoomCache = new Map<string, string>();
const researchRoomCache = new Map<string, string>();
const campusHelpRoomCache = new Map<string, string>();

/**
 * Idempotently provisions or retrieves a Room OS collaboration workspace for a Club.
 */
export async function ensureClubWorkspace(clubId: string, actorUserId: string): Promise<string> {
  // 1. Check in-memory cache
  if (clubRoomCache.has(clubId)) {
    return clubRoomCache.get(clubId)!;
  }

  // 2. Fetch club from DB
  const { data: club, error: clubErr } = await admin
    .from("clubs")
    .select("id, name, description, university, category, logo_url, room_id")
    .eq("id", clubId)
    .maybeSingle();

  if (clubErr && !clubErr.message?.includes("room_id")) {
    throw clubErr;
  }

  if (club?.room_id) {
    clubRoomCache.set(clubId, club.room_id);
    return club.room_id;
  }

  // If club wasn't found by select with room_id, fetch basic fields
  let clubName = club?.name;
  let clubDesc = club?.description;
  if (!club) {
    const { data: fallbackClub } = await admin
      .from("clubs")
      .select("id, name, description")
      .eq("id", clubId)
      .maybeSingle();
    clubName = fallbackClub?.name || "Club Space";
    clubDesc = fallbackClub?.description || "";
  }

  // 3. Atomically create Room OS room for this Club
  // Check if a room with title already exists for this club
  const { data: existingRoom } = await admin
    .from("rooms")
    .select("id")
    .eq("title", `${clubName} Community`)
    .maybeSingle();

  if (existingRoom) {
    clubRoomCache.set(clubId, existingRoom.id);
    // Attempt to persist to club record if column exists
    await admin.from("clubs").update({ room_id: existingRoom.id } as any).eq("id", clubId);
    return existingRoom.id;
  }

  // Provision new room
  const { data: newRoom, error: roomErr } = await admin
    .from("rooms")
    .insert({
      title: `${clubName} Community`,
      description: clubDesc || `Official collaboration workspace for ${clubName}`,
      topic: "Student Club",
      visibility: "public",
      mode: "hybrid",
      capacity: 500,
      owner_id: actorUserId,
      tags: ["club", "campus-life"],
      enabled_modules: ["posts", "chat", "learn", "media"],
      default_landing_tab: "posts",
    } as any)
    .select("id")
    .single();

  if (roomErr) {
    // If insert failed due to constraint or column, fallback to basic fields
    const { data: basicRoom, error: basicErr } = await admin
      .from("rooms")
      .insert({
        title: `${clubName} Community`,
        description: clubDesc || `Official collaboration workspace for ${clubName}`,
        topic: "Student Club",
        visibility: "public",
        mode: "hybrid",
        capacity: 500,
        owner_id: actorUserId,
      })
      .select("id")
      .single();

    if (basicErr) throw basicErr;
    const roomId = basicRoom.id;
    clubRoomCache.set(clubId, roomId);

    // Auto-add creator as owner in room_members
    await admin.from("room_members").upsert({
      room_id: roomId,
      user_id: actorUserId,
      role: "owner",
    } as any);

    await admin.from("clubs").update({ room_id: roomId } as any).eq("id", clubId);
    return roomId;
  }

  const roomId = newRoom.id;
  clubRoomCache.set(clubId, roomId);

  // Auto-add creator as owner in room_members
  await admin.from("room_members").upsert({
    room_id: roomId,
    user_id: actorUserId,
    role: "owner",
  } as any);

  // Link room_id on club
  await admin.from("clubs").update({ room_id: roomId } as any).eq("id", clubId);

  return roomId;
}

/**
 * Idempotently provisions or retrieves a private Room OS collaboration workspace for a Research Project.
 */
export async function ensureResearchWorkspace(projectId: string, ownerId: string): Promise<string> {
  // 1. Check in-memory cache
  if (researchRoomCache.has(projectId)) {
    return researchRoomCache.get(projectId)!;
  }

  // 2. Fetch research project from DB
  const { data: project } = await admin
    .from("research_projects")
    .select("id, title, description, owner_id, room_id")
    .eq("id", projectId)
    .maybeSingle();

  if (project?.room_id) {
    researchRoomCache.set(projectId, project.room_id);
    return project.room_id;
  }

  const title = project?.title || "Research Project";
  const desc = project?.description || "Private research team collaboration space.";

  // 3. Provision new private room
  const { data: newRoom, error: roomErr } = await admin
    .from("rooms")
    .insert({
      title: `${title} Lab`,
      description: desc,
      topic: "Academic Research",
      visibility: "private",
      mode: "online",
      capacity: 50,
      owner_id: ownerId,
      tags: ["research", "academic"],
      enabled_modules: ["posts", "chat", "learn", "media"],
      default_landing_tab: "posts",
    } as any)
    .select("id")
    .single();

  let roomId = newRoom?.id;

  if (roomErr || !roomId) {
    // Basic insert fallback
    const { data: basicRoom, error: basicErr } = await admin
      .from("rooms")
      .insert({
        title: `${title} Lab`,
        description: desc,
        topic: "Academic Research",
        visibility: "private",
        mode: "online",
        capacity: 50,
        owner_id: ownerId,
      })
      .select("id")
      .single();

    if (basicErr) throw basicErr;
    roomId = basicRoom.id;
  }

  researchRoomCache.set(projectId, roomId);

  // Auto-add project owner as owner in room_members
  await admin.from("room_members").upsert({
    room_id: roomId,
    user_id: ownerId,
    role: "owner",
  } as any);

  // Link room_id on research_project
  await admin.from("research_projects").update({ room_id: roomId } as any).eq("id", projectId);

  return roomId;
}

/**
 * Ensures or retrieves the canonical Campus Help room.
 */
export async function ensureCampusHelpWorkspace(university = "Campus"): Promise<string> {
  const cacheKey = university.toLowerCase().trim();
  if (campusHelpRoomCache.has(cacheKey)) {
    return campusHelpRoomCache.get(cacheKey)!;
  }

  const title = `${university} Academic Help Center`;
  const { data: existing } = await admin
    .from("rooms")
    .select("id")
    .ilike("title", `%${university}%Help%`)
    .maybeSingle();

  if (existing) {
    campusHelpRoomCache.set(cacheKey, existing.id);
    return existing.id;
  }

  // Get any admin/system user to be owner
  const { data: adminUser } = await admin
    .from("profiles")
    .select("id")
    .limit(1)
    .maybeSingle();

  const ownerId = adminUser?.id;
  if (!ownerId) {
    throw new Error("No system profile available to initialize Campus Help workspace");
  }

  const { data: newRoom, error } = await admin
    .from("rooms")
    .insert({
      title,
      description: "University-wide canonical academic questions, peer troubleshooting, and study assistance.",
      topic: "Academic Help",
      visibility: "public",
      mode: "online",
      capacity: 5000,
      owner_id: ownerId,
      tags: ["help", "qa", "academics"],
      enabled_modules: ["posts", "chat", "learn"],
      default_landing_tab: "learn",
    } as any)
    .select("id")
    .single();

  if (error || !newRoom) {
    const { data: basicRoom, error: bErr } = await admin
      .from("rooms")
      .insert({
        title,
        description: "University-wide canonical academic questions and peer troubleshooting.",
        topic: "Academic Help",
        visibility: "public",
        mode: "online",
        capacity: 5000,
        owner_id: ownerId,
      })
      .select("id")
      .single();

    if (bErr) throw bErr;
    campusHelpRoomCache.set(cacheKey, basicRoom.id);
    return basicRoom.id;
  }

  campusHelpRoomCache.set(cacheKey, newRoom.id);
  return newRoom.id;
}

/**
 * Server-side authorization check for cross-space sharing.
 * Critical safety: Private room/research content CANNOT be shared to public campus feed!
 */
export async function canShareSource(
  userId: string,
  sourceType: string,
  sourceId: string,
  destinationType: string,
  destinationId?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // If destination is public campus feed, verify source is strictly public!
  if (destinationType === "campus_feed") {
    if (sourceType === "research") {
      const { data: project } = await admin
        .from("research_projects")
        .select("visibility")
        .eq("id", sourceId)
        .maybeSingle();
      if (project?.visibility === "private") {
        return { allowed: false, reason: "Private research projects cannot be shared publicly to the Campus Feed." };
      }
    } else if (sourceType === "post") {
      const { data: post } = await admin
        .from("room_posts")
        .select("room_id, rooms!room_posts_room_id_fkey(visibility)")
        .eq("id", sourceId)
        .maybeSingle();
      if ((post?.rooms as any)?.visibility === "private") {
        return { allowed: false, reason: "Posts from private rooms cannot be shared to the public Campus Feed." };
      }
    } else if (sourceType === "question") {
      const { data: question } = await admin
        .from("room_questions")
        .select("room_id, rooms!room_questions_room_id_fkey(visibility)")
        .eq("id", sourceId)
        .maybeSingle();
      if ((question?.rooms as any)?.visibility === "private") {
        return { allowed: false, reason: "Questions from private rooms cannot be shared to the public Campus Feed." };
      }
    }
  }

  // If destination is a private room, verify the user is a member of that room
  if (destinationType === "room" && destinationId) {
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", destinationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!member) {
      return { allowed: false, reason: "You must be a member of the destination room to share content there." };
    }
  }

  return { allowed: true };
}
