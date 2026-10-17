import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";

/**
 * Startup schema integrity check for Room Live Sessions & atomic creation.
 * Fails loudly if required migration 048 has not been applied to the database.
 */
export async function verifyRoomSchema(): Promise<void> {
  logger.info({ event: "room_schema_check_started" }, "Verifying database room schema and live session tables...");

  try {
    // 1. Verify rooms table columns (cover_image_url, is_teacher_mode, knock_mode_enabled, is_locked)
    const { error: roomsError } = await admin
      .from("rooms")
      .select("id, cover_image_url, is_teacher_mode, knock_mode_enabled, is_locked")
      .limit(1);

    if (roomsError) {
      const msg = `[CRITICAL SCHEMA DRIFT] rooms table is missing required columns from migrations 041/046/048: ${roomsError.message}`;
      logger.fatal({ event: "room_schema_drift", err: roomsError.message }, msg);
      throw new Error(msg);
    }

    // 2. Verify room_open_sessions table
    const { error: openSessionsError } = await admin
      .from("room_open_sessions")
      .select("id, room_id, status, media, host_id, last_empty_at")
      .limit(1);

    if (openSessionsError) {
      const msg = `[CRITICAL SCHEMA DRIFT] room_open_sessions table is missing (Migration 048): ${openSessionsError.message}`;
      logger.fatal({ event: "room_open_sessions_missing", err: openSessionsError.message }, msg);
      throw new Error(msg);
    }

    // 3. Verify room_open_participants table
    const { error: participantsError } = await admin
      .from("room_open_participants")
      .select("session_id, user_id, joined_at, is_host")
      .limit(1);

    if (participantsError) {
      const msg = `[CRITICAL SCHEMA DRIFT] room_open_participants table is missing (Migration 048): ${participantsError.message}`;
      logger.fatal({ event: "room_open_participants_missing", err: participantsError.message }, msg);
      throw new Error(msg);
    }

    // 4. Verify room_study_permissions table
    const { error: permsError } = await admin
      .from("room_study_permissions")
      .select("room_id, user_id, granted_by")
      .limit(1);

    if (permsError) {
      const msg = `[CRITICAL SCHEMA DRIFT] room_study_permissions table is missing (Migration 048): ${permsError.message}`;
      logger.fatal({ event: "room_study_permissions_missing", err: permsError.message }, msg);
      throw new Error(msg);
    }

    logger.info({ event: "room_schema_check_passed" }, "Room schema verification completed successfully.");
  } catch (err) {
    logger.fatal(
      { event: "room_schema_verification_failed", err: (err as Error).message },
      "Database schema check failed. Run migration 048_room_live_sessions.sql in Supabase SQL Editor.",
    );
    throw err;
  }
}
