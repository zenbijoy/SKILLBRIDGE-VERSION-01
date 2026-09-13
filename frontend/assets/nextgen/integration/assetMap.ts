// SkillBridge Next-Gen visual asset map
// Copy the selected PNG/GIF files into frontend/assets/nextgen/ and adjust paths if needed.
export const nextGenAssets = {
  illustrations: {
    homeNetwork: require("../assets/nextgen/illustrations/home-network.png"),
    studyRoom: require("../assets/nextgen/illustrations/study-room.png"),
    liveClass: require("../assets/nextgen/illustrations/live-class.png"),
    qna: require("../assets/nextgen/illustrations/qna-board.png"),
    materials: require("../assets/nextgen/illustrations/materials-hub.png"),
    recordings: require("../assets/nextgen/illustrations/recordings.png"),
    clubOS: require("../assets/nextgen/illustrations/club-os.png"),
    clashEngine: require("../assets/nextgen/illustrations/clash-engine.png"),
  },
  animation: {
    loader: require("../assets/nextgen/animations/loader-orbit.gif"),
    live: require("../assets/nextgen/animations/live-pulse.gif"),
    typing: require("../assets/nextgen/animations/typing-dots.gif"),
    success: require("../assets/nextgen/animations/success-confetti.gif"),
  },
} as const;
