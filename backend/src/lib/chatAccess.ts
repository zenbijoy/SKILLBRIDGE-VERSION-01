import { admin } from "./db.js";

export interface ConversationAccessResult {
  allowed: boolean;
  role?: string;
  isAnnouncementChannel?: boolean;
  isEducator?: boolean;
  error?: string;
}

/**
 * Validates and ensures user access to a conversation.
 * If the conversation belongs to a room or room channel:
 * - Checks room membership and role
 * - Enforces private channel restrictions (teachers/admins only)
 * - Auto-enrolls authorized room members into conversation_members
 * - Identifies announcement channels and educator status
 */
export async function ensureConversationMember(
  convId: string,
  userId: string,
): Promise<ConversationAccessResult> {
  // 1. Direct check in conversation_members
  const { data: existingMember } = await admin
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", convId)
    .eq("user_id", userId)
    .maybeSingle();

  // 2. Check if this conversation is attached to a room channel
  const { data: channel } = await admin
    .from("room_channels")
    .select("id, room_id, type, is_private, allowed_roles, permissions_override")
    .eq("conversation_id", convId)
    .maybeSingle();

  let roomId: string | null = channel?.room_id || null;
  if (!roomId) {
    // Check if it's the primary conversation for a room
    const { data: roomDirect } = await admin
      .from("rooms")
      .select("id, owner_id, visibility")
      .eq("conversation_id", convId)
      .maybeSingle();
    if (roomDirect) {
      roomId = roomDirect.id;
    }
  }

  // 3. If this is a room conversation (channel or main room chat)
  if (roomId) {
    const { data: room } = await admin
      .from("rooms")
      .select("id, owner_id, visibility")
      .eq("id", roomId)
      .maybeSingle();

    const { data: roomMember } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();

    const isOwner = room?.owner_id === userId;
    const userRole = roomMember?.role || (isOwner ? "owner" : null);
    const isEducator = isOwner || ["owner", "teacher", "moderator", "admin", "host"].includes(userRole || "");

    // Check if channel is private (staff/educators only)
    const isPrivate = Boolean(
      channel?.is_private ||
      channel?.type === "private" ||
      channel?.permissions_override?.is_private
    );

    if (isPrivate) {
      const allowedRoles = (channel?.allowed_roles && channel.allowed_roles.length > 0)
        ? channel.allowed_roles
        : (channel?.permissions_override?.allowed_roles || ["owner", "teacher", "moderator", "admin"]);
      
      const hasStaffAccess = isOwner || (userRole && allowedRoles.includes(userRole));
      if (!hasStaffAccess) {
        return {
          allowed: false,
          error: "This is a private channel restricted to room teachers and administrators",
        };
      }
    }

    // Check if user has room access (either joined, public room, or member of attached research project)
    if (!roomMember && !isOwner && room?.visibility !== "public") {
      let isResearchAuthorized = false;
      let researchRole = "member";

      try {
        const { data: project } = await admin
          .from("research_projects")
          .select("id, owner_id")
          .eq("room_id", roomId)
          .maybeSingle();

        if (project) {
          if (project.owner_id === userId) {
            isResearchAuthorized = true;
            researchRole = "owner";
          } else {
            const { data: rm } = await admin
              .from("research_members")
              .select("id, role")
              .eq("project_id", project.id)
              .eq("user_id", userId)
              .maybeSingle();
            if (rm) {
              isResearchAuthorized = true;
              researchRole = rm.role || "member";
            }
          }
        }
      } catch {}

      if (isResearchAuthorized) {
        // Auto-enroll research collaborator into room_members
        try {
          await admin.from("room_members").upsert(
            {
              room_id: roomId,
              user_id: userId,
              role: researchRole === "owner" ? "owner" : "member",
            } as any,
            { onConflict: "room_id,user_id" },
          );
        } catch {}
      } else {
        return {
          allowed: false,
          error: "You must join this room to participate in chat",
        };
      }
    } else if (!roomMember && !isOwner && room?.visibility === "public") {
      // In public rooms, auto-enroll active chatting participant into room_members
      try {
        await admin.from("room_members").upsert(
          {
            room_id: roomId,
            user_id: userId,
            role: "member",
          } as any,
          { onConflict: "room_id,user_id" },
        );
      } catch {}
    }

    const assignedRole = userRole || "member";

    // Auto-enroll into conversation_members if not already there
    if (!existingMember) {
      try {
        await admin.from("conversation_members").upsert(
          {
            conversation_id: convId,
            user_id: userId,
            role: assignedRole,
          },
          { onConflict: "conversation_id,user_id" },
        );
      } catch {
        // Non-fatal if concurrency conflict
      }
    }

    return {
      allowed: true,
      role: existingMember?.role || assignedRole,
      isAnnouncementChannel: channel?.type === "announcement",
      isEducator,
    };
  }

  // 4. Standard DM or Group conversation
  if (!existingMember) {
    return {
      allowed: false,
      error: "Not a conversation member",
    };
  }

  return {
    allowed: true,
    role: existingMember.role,
    isAnnouncementChannel: false,
    isEducator: ["owner", "admin", "teacher"].includes(existingMember.role),
  };
}
