import { admin } from "../lib/db.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export async function runAdminBootstrap() {
  if (!env.ADMIN_BOOTSTRAP_ENABLED) {
    return;
  }

  logger.info({ event: "admin_bootstrap_started" }, "Starting admin bootstrap process...");

  if (!env.ADMIN_BOOTSTRAP_EMAIL || !env.ADMIN_BOOTSTRAP_TEMP_PASSWORD || !env.ADMIN_BOOTSTRAP_EXPIRES_AT) {
    logger.error(
      { event: "admin_bootstrap_missing_config" },
      "Missing required bootstrap configuration. Bootstrap aborted safely.",
    );
    return;
  }

  const expiresAt = new Date(env.ADMIN_BOOTSTRAP_EXPIRES_AT);
  if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    logger.error(
      { event: "admin_bootstrap_expired_config" },
      "Bootstrap configuration expired or invalid timestamp. Aborting.",
    );
    return;
  }

  try {
    // Check if an Owner already exists in admin_accounts
    const { data: owners, error: ownerError } = await admin
      .from("admin_accounts")
      .select("user_id")
      .eq("role", "owner")
      .limit(1);

    if (ownerError) {
      logger.error(
        { event: "admin_bootstrap_owner_check_error", err: ownerError.message },
        "Error checking for existing owner",
      );
      return;
    }

    if (owners && owners.length > 0) {
      logger.info({ event: "admin_bootstrap_owner_exists" }, "Owner already exists. Bootstrap aborted safely.");
      return;
    }

    // Check bootstrap state singleton
    const { data: state, error: stateError } = await admin
      .from("admin_bootstrap_state")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    if (stateError) {
      logger.error(
        { event: "admin_bootstrap_state_check_error", err: stateError.message },
        "Error fetching bootstrap state",
      );
      return;
    }

    if (state && (state.status === "provisioned" || state.status === "consumed" || state.status === "disabled")) {
      logger.info(
        { event: "admin_bootstrap_already_completed", status: state.status },
        `Bootstrap state is already ${state.status}. Aborting.`,
      );
      return;
    }

    // Insert pending state if it doesn't exist
    if (!state) {
      const { error: insertError } = await admin
        .from("admin_bootstrap_state")
        .insert({
          id: "00000000-0000-0000-0000-000000000001",
          status: "pending",
        });
      if (insertError) {
        logger.error(
          { event: "admin_bootstrap_init_failed", err: insertError.message },
          "Failed to initialize bootstrap state",
        );
        return;
      }
    }

    // Check if the auth user already exists for this email
    const { data: users, error: listUserError } = await admin.auth.admin.listUsers();

    if (listUserError) {
      logger.error(
        { event: "admin_bootstrap_list_users_error", err: listUserError.message },
        "Failed to list auth users",
      );
      return;
    }

    let targetUser = users.users.find((u) => u.email === env.ADMIN_BOOTSTRAP_EMAIL);

    if (targetUser) {
      logger.error(
        { event: "admin_bootstrap_email_conflict" },
        "Auth account already exists for bootstrap email. Will not promote implicitly. Aborting.",
      );
      return;
    }

    // Create the Auth User
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: env.ADMIN_BOOTSTRAP_EMAIL,
      password: env.ADMIN_BOOTSTRAP_TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { is_bootstrap_owner: true },
    });

    if (createUserError || !createdUser.user) {
      logger.error(
        { event: "admin_bootstrap_create_user_error", err: createUserError?.message },
        "Failed to create auth user",
      );
      return;
    }

    targetUser = createdUser.user;

    // Create the admin_account
    const { error: accountError } = await admin
      .from("admin_accounts")
      .insert({
        user_id: targetUser.id,
        role: "owner",
        status: "active",
        must_change_credentials: true,
        mfa_required: env.ADMIN_REQUIRE_MFA,
      });

    if (accountError) {
      logger.error(
        { event: "admin_bootstrap_account_insert_error", err: accountError.message },
        "Failed to create admin account record",
      );
      await admin.auth.admin.deleteUser(targetUser.id);
      return;
    }

    // Mark state as provisioned
    const { error: updateStateError } = await admin
      .from("admin_bootstrap_state")
      .update({
        status: "provisioned",
        provisioned_user_id: targetUser.id,
        provisioned_at: new Date().toISOString(),
      })
      .eq("id", "00000000-0000-0000-0000-000000000001");

    if (updateStateError) {
      logger.error(
        { event: "admin_bootstrap_state_update_error", err: updateStateError.message },
        "Failed to update bootstrap state",
      );
      return;
    }

    logger.info({ event: "admin_bootstrap_success" }, "Successfully provisioned initial Owner account.");
  } catch (error) {
    logger.error(
      { event: "admin_bootstrap_unexpected_error", err: error instanceof Error ? error.message : error },
      "Unexpected error during bootstrap",
    );
  }
}
