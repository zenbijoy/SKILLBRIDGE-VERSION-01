export const spotIllustrations = {
  dashboardBoost: require("../../assets/spot/thumb-256/01-dashboard-boost.png"),
  createRoom: require("../../assets/spot/thumb-256/02-create-room.png"),
  liveClass: require("../../assets/spot/thumb-256/03-live-class.png"),
  chatTogether: require("../../assets/spot/thumb-256/04-chat-together.png"),
  searchDiscovery: require("../../assets/spot/thumb-256/05-search-discovery.png"),
  leaderboardVictory: require("../../assets/spot/thumb-256/06-leaderboard-victory.png"),
  researchInnovation: require("../../assets/spot/thumb-256/07-research-innovation.png"),
  profileControl: require("../../assets/spot/thumb-256/08-profile-control.png"),
} as const;

export const spotIllustrations512 = {
  dashboardBoost: require("../../assets/spot/app-512/01-dashboard-boost.png"),
  createRoom: require("../../assets/spot/app-512/02-create-room.png"),
  liveClass: require("../../assets/spot/app-512/03-live-class.png"),
  chatTogether: require("../../assets/spot/app-512/04-chat-together.png"),
  searchDiscovery: require("../../assets/spot/app-512/05-search-discovery.png"),
  leaderboardVictory: require("../../assets/spot/app-512/06-leaderboard-victory.png"),
  researchInnovation: require("../../assets/spot/app-512/07-research-innovation.png"),
  profileControl: require("../../assets/spot/app-512/08-profile-control.png"),
} as const;

export const onboardingIllustrations = {
  discover: require("../../assets/onboarding/discover.png"),
  connect: require("../../assets/onboarding/connect.png"),
  levelUp: require("../../assets/onboarding/level-up.png"),
  launch: require("../../assets/onboarding/launch.png"),
} as const;

export const growthIllustrations = {
  learningGoals: require("../../assets/growth/thumb-256/01-learning-goals.png"),
  studyPlanner: require("../../assets/growth/thumb-256/02-study-planner.png"),
  unifiedCalendar: require("../../assets/growth/thumb-256/03-unified-calendar.png"),
  tutorBooking: require("../../assets/growth/thumb-256/04-tutor-booking.png"),
  savedLibrary: require("../../assets/growth/thumb-256/05-saved-library.png"),
  challengesQuests: require("../../assets/growth/thumb-256/06-challenges-quests.png"),
  verifiedAchievement: require("../../assets/growth/thumb-256/07-verified-achievement.png"),
  progressAnalytics: require("../../assets/growth/thumb-256/08-progress-analytics.png"),
  activityTimeline: require("../../assets/growth/thumb-256/09-activity-timeline.png"),
  smartReminders: require("../../assets/growth/thumb-256/10-smart-reminders.png"),
} as const;

export const growthIllustrations512 = {
  learningGoals: require("../../assets/growth/app-512/01-learning-goals.png"),
  studyPlanner: require("../../assets/growth/app-512/02-study-planner.png"),
  unifiedCalendar: require("../../assets/growth/app-512/03-unified-calendar.png"),
  tutorBooking: require("../../assets/growth/app-512/04-tutor-booking.png"),
  savedLibrary: require("../../assets/growth/app-512/05-saved-library.png"),
  challengesQuests: require("../../assets/growth/app-512/06-challenges-quests.png"),
  verifiedAchievement: require("../../assets/growth/app-512/07-verified-achievement.png"),
  progressAnalytics: require("../../assets/growth/app-512/08-progress-analytics.png"),
  activityTimeline: require("../../assets/growth/app-512/09-activity-timeline.png"),
  smartReminders: require("../../assets/growth/app-512/10-smart-reminders.png"),
} as const;

export type GrowthIllustrationKey = keyof typeof growthIllustrations;
export type SpotIllustrationKey = keyof typeof spotIllustrations;
export type OnboardingIllustrationKey = keyof typeof onboardingIllustrations;
