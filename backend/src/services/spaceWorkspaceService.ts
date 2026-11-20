import { admin } from "../lib/db.js";
import { env } from "../config/env.js";

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
      capacity: Math.min(250, env.MAX_ROOM_CAPACITY || 250),
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
        capacity: Math.min(250, env.MAX_ROOM_CAPACITY || 250),
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
 * Ensures the room, primary conversation, default channels, and all team memberships are fully synced
 * so real-time workspace chat works immediately without permission or missing channel errors.
 */
export async function ensureResearchWorkspace(projectId: string, ownerId: string): Promise<string> {
  // 1. Fetch research project from DB
  const { data: project } = await admin
    .from("research_projects")
    .select("id, title, description, owner_id, room_id")
    .eq("id", projectId)
    .maybeSingle();

  const title = project?.title || "Research Project";
  const desc = project?.description || "Private research team collaboration space.";
  const effectiveOwner = project?.owner_id || ownerId;

  let roomId = project?.room_id || (researchRoomCache.has(projectId) ? researchRoomCache.get(projectId)! : null);

  if (roomId) {
    // Verify room actually exists
    const { data: existingRoom } = await admin
      .from("rooms")
      .select("id, conversation_id")
      .eq("id", roomId)
      .maybeSingle();

    if (!existingRoom) {
      roomId = null;
    }
  }

  // 2. Provision new private room if not present
  if (!roomId) {
    const { data: newRoom, error: roomErr } = await admin
      .from("rooms")
      .insert({
        title: `${title} Lab`,
        description: desc,
        topic: "Academic Research",
        visibility: "private",
        mode: "online",
        capacity: 100,
        owner_id: effectiveOwner,
        tags: ["research", "academic", "workspace"],
        enabled_modules: ["posts", "chat", "learn", "media"],
        default_landing_tab: "chat",
      } as any)
      .select("id")
      .single();

    if (newRoom?.id) {
      roomId = newRoom.id;
    } else {
      // Fallback insert without extra fields
      const { data: basicRoom, error: basicErr } = await admin
        .from("rooms")
        .insert({
          title: `${title} Lab`,
          description: desc,
          topic: "Academic Research",
          visibility: "private",
          mode: "online",
          capacity: 100,
          owner_id: effectiveOwner,
        })
        .select("id")
        .single();

      if (basicErr) throw basicErr;
      roomId = basicRoom.id;
    }

    // Link room_id on research_project
    await admin.from("research_projects").update({ room_id: roomId } as any).eq("id", projectId);
  }

  researchRoomCache.set(projectId, roomId);

  // 3. Ensure primary conversation for the room
  const { data: roomRecord } = await admin
    .from("rooms")
    .select("id, conversation_id")
    .eq("id", roomId)
    .single();

  let roomConvId = roomRecord?.conversation_id;
  if (!roomConvId) {
    const { data: newConv } = await admin
      .from("conversations")
      .insert({
        kind: "room",
        title: `${title} Lab Chat`,
        created_by: effectiveOwner,
      })
      .select("id")
      .single();

    if (newConv?.id) {
      roomConvId = newConv.id;
      await admin.from("rooms").update({ conversation_id: roomConvId }).eq("id", roomId);
    }
  }

  // 4. Ensure default channels (#general & #paper-discussions) exist in room_channels
  const { data: existingChannels } = await admin
    .from("room_channels")
    .select("id, name, is_default, conversation_id")
    .eq("room_id", roomId)
    .eq("is_archived", false);

  if (!existingChannels || existingChannels.length === 0) {
    // Seed default #general channel linked to roomConvId
    await admin.from("room_channels").insert([
      {
        room_id: roomId,
        name: "general",
        slug: "general",
        type: "text",
        description: "General lab discussion and team collaboration",
        position: 0,
        is_default: true,
        conversation_id: roomConvId,
        created_by: effectiveOwner,
        permissions_override: { is_private: false, channel_category: "common" },
      },
      {
        room_id: roomId,
        name: "paper-discussions",
        slug: "paper-discussions",
        type: "text",
        description: "Discuss research papers, methodologies, and literature reviews",
        position: 1,
        is_default: false,
        conversation_id: roomConvId,
        created_by: effectiveOwner,
        permissions_override: { is_private: false, channel_category: "common" },
      },
    ]);
  } else if (roomConvId) {
    // Ensure default channel has conversation_id attached
    const defaultChan = existingChannels.find((c) => c.is_default) || existingChannels[0];
    if (defaultChan && !defaultChan.conversation_id) {
      await admin.from("room_channels").update({ conversation_id: roomConvId }).eq("id", defaultChan.id);
    }
  }

  // 5. Ensure owner membership in room_members and conversation_members
  await admin.from("room_members").upsert(
    {
      room_id: roomId,
      user_id: effectiveOwner,
      role: "owner",
    } as any,
    { onConflict: "room_id,user_id" },
  );

  if (roomConvId) {
    try {
      await admin.from("conversation_members").upsert(
        {
          conversation_id: roomConvId,
          user_id: effectiveOwner,
          role: "owner",
        },
        { onConflict: "conversation_id,user_id" },
      );
    } catch {}
  }

  // 6. Sync all accepted research project members into room_members & conversation_members
  const { data: members } = await admin
    .from("research_members")
    .select("user_id, role")
    .eq("project_id", projectId);

  if (members && members.length > 0) {
    for (const m of members) {
      if (m.user_id && m.user_id !== effectiveOwner) {
        await admin.from("room_members").upsert(
          {
            room_id: roomId,
            user_id: m.user_id,
            role: "member",
          } as any,
          { onConflict: "room_id,user_id" },
        );

        if (roomConvId) {
          try {
            await admin.from("conversation_members").upsert(
              {
                conversation_id: roomConvId,
                user_id: m.user_id,
                role: "member",
              },
              { onConflict: "conversation_id,user_id" },
            );
          } catch {}
        }
      }
    }
  }

  return roomId;
}

/**
 * Ensures or retrieves the canonical Campus Help room.
 */
export async function ensureCampusHelpWorkspace(
  university = "Campus",
  fallbackUserId?: string,
): Promise<string> {
  const cacheKey = university.toLowerCase().trim();
  if (campusHelpRoomCache.has(cacheKey)) {
    return campusHelpRoomCache.get(cacheKey)!;
  }

  const title = `${university} Academic Help Center`;
  const { data: existing } = await admin
    .from("rooms")
    .select("id")
    .or(`title.ilike.%${university}%Help%,title.ilike.%Academic Help%,title.ilike.%Campus Help%`)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    campusHelpRoomCache.set(cacheKey, existing.id);
    return existing.id;
  }

  // Get any admin/system user to be owner
  const { data: adminUser } = await admin
    .from("profiles")
    .select("id")
    .limit(1)
    .maybeSingle();

  const ownerId = adminUser?.id || fallbackUserId;
  if (!ownerId) {
    throw new Error("No profile available to initialize Campus Help workspace");
  }

  const maxCapacity = Math.min(250, env.MAX_ROOM_CAPACITY || 250);

  const { data: newRoom, error } = await admin
    .from("rooms")
    .insert({
      title,
      description: "University-wide canonical academic questions, peer troubleshooting, and study assistance.",
      topic: "Academic Help",
      visibility: "public",
      mode: "online",
      capacity: maxCapacity,
      owner_id: ownerId,
      tags: ["help", "qa", "academics"],
      enabled_modules: ["posts", "chat", "learn"],
      default_landing_tab: "learn",
    } as any)
    .select("id")
    .maybeSingle();

  let roomId = newRoom?.id;

  if (error || !roomId) {
    const { data: basicRoom, error: bErr } = await admin
      .from("rooms")
      .insert({
        title,
        description: "University-wide canonical academic questions and peer troubleshooting.",
        topic: "Academic Help",
        visibility: "public",
        mode: "online",
        capacity: maxCapacity,
        owner_id: ownerId,
      })
      .select("id")
      .single();

    if (bErr) throw bErr;
    roomId = basicRoom.id;
  }

  // Auto-add owner to room_members
  await admin.from("room_members").upsert(
    {
      room_id: roomId,
      user_id: ownerId,
      role: "owner",
    } as any,
    { onConflict: "room_id,user_id" },
  );

  campusHelpRoomCache.set(cacheKey, roomId);
  return roomId;
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
