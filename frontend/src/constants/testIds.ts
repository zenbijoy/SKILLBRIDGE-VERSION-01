export const TEST_IDS = {
  AUTH: {
    EMAIL_INPUT: "auth.email.input",
    PASSWORD_INPUT: "auth.password.input",
    LOGIN_SUBMIT: "auth.login.submit",
    SIGNUP_SUBMIT: "auth.signup.submit",
    LOGOUT_BUTTON: "auth.logout.button",
    FORGOT_PASSWORD_BUTTON: "auth.forgot_password.button",
    PASSWORD_VISIBILITY_TOGGLE: "auth.password.toggle_visibility",
  },
  DASHBOARD: {
    PROFILE_BUTTON: "dashboard.profile.button",
    SEARCH_BAR: "dashboard.search.bar",
    EXPLORE_ROOMS: "dashboard.explore.rooms",
    NOTIFICATIONS_BUTTON: "dashboard.notifications.button",
    LEARN_TAB: "dashboard.tab.learn",
    TEACH_TAB: "dashboard.tab.teach",
  },
  PROFILE: {
    AVATAR: "profile.avatar",
    EDIT_BUTTON: "profile.edit.button",
    SAVE_BUTTON: "profile.save.button",
    NAME_INPUT: "profile.name.input",
    BIO_INPUT: "profile.bio.input",
    HEADLINE_INPUT: "profile.headline.input",
  },
  CHAT: {
    CONVERSATION_LIST: "chat.conversation.list",
    MESSAGE_INPUT: "chat.message.input",
    MESSAGE_SEND: "chat.message.send",
    ATTACHMENT_BUTTON: "chat.attachment.button",
  },
  ROOM: {
    ROOM_CARD: "room.card",
    JOIN_BUTTON: "room.join.button",
    LEAVE_BUTTON: "room.leave.button",
    CREATE_BUTTON: "room.create.button",
    TITLE_INPUT: "room.title.input",
  },
  CALL: {
    ACCEPT_BUTTON: "call.accept.button",
    DECLINE_BUTTON: "call.decline.button",
    END_BUTTON: "call.end.button",
    MUTE_BUTTON: "call.mute.button",
    VIDEO_TOGGLE_BUTTON: "call.video_toggle.button",
  },
  SEARCH: {
    INPUT: "search.input",
    FILTER_BUTTON: "search.filter.button",
    RESULT_ITEM: "search.result.item",
  },
  SETTINGS: {
    LANGUAGE_SELECTOR: "settings.language.selector",
    THEME_SELECTOR: "settings.theme.selector",
    NOTIFICATIONS_SWITCH: "settings.notifications.switch",
    HAPTICS_SWITCH: "settings.haptics.switch",
  },
} as const;

export default TEST_IDS;
