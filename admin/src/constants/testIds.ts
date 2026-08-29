export const ADMIN_TEST_IDS = {
  AUTH: {
    EMAIL_INPUT: "admin.auth.email.input",
    PASSWORD_INPUT: "admin.auth.password.input",
    LOGIN_SUBMIT: "admin.auth.login.submit",
    LOGOUT_BUTTON: "admin.auth.logout.button",
  },
  DASHBOARD: {
    USER_STATS_CARD: "admin.dashboard.user_stats",
    ROOM_STATS_CARD: "admin.dashboard.room_stats",
    SYSTEM_HEALTH_NAV: "admin.dashboard.system_health_nav",
    MODERATION_NAV: "admin.dashboard.moderation_nav",
    AUDIT_LOG_NAV: "admin.dashboard.audit_log_nav",
  },
  USERS: {
    SEARCH_INPUT: "admin.users.search.input",
    TABLE: "admin.users.table",
    ROLE_SELECT: "admin.users.role_select",
    BAN_BUTTON: "admin.users.ban_button",
    UNBAN_BUTTON: "admin.users.unban_button",
  },
  MODERATION: {
    QUEUE_TABLE: "admin.moderation.queue_table",
    APPROVE_BUTTON: "admin.moderation.approve_button",
    REJECT_BUTTON: "admin.moderation.reject_button",
  },
  SYSTEM_HEALTH: {
    REFRESH_BUTTON: "admin.system_health.refresh_button",
    STATUS_BADGE: "admin.system_health.status_badge",
    DB_STATUS: "admin.system_health.db_status",
    REDIS_STATUS: "admin.system_health.redis_status",
  },
} as const;

export default ADMIN_TEST_IDS;
