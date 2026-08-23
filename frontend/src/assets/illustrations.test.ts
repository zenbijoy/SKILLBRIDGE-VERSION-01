import {
  growthIllustrations,
  growthIllustrations512,
  spotIllustrations,
  spotIllustrations512,
  onboardingIllustrations,
} from "./illustrations";

describe("Illustrations Asset Catalogue", () => {
  it("exports all 10 required growth illustrations in 256px thumbnail format", () => {
    expect(growthIllustrations.learningGoals).toBeDefined();
    expect(growthIllustrations.studyPlanner).toBeDefined();
    expect(growthIllustrations.unifiedCalendar).toBeDefined();
    expect(growthIllustrations.tutorBooking).toBeDefined();
    expect(growthIllustrations.savedLibrary).toBeDefined();
    expect(growthIllustrations.challengesQuests).toBeDefined();
    expect(growthIllustrations.verifiedAchievement).toBeDefined();
    expect(growthIllustrations.progressAnalytics).toBeDefined();
    expect(growthIllustrations.activityTimeline).toBeDefined();
    expect(growthIllustrations.smartReminders).toBeDefined();

    expect(Object.keys(growthIllustrations)).toHaveLength(10);
  });

  it("exports all 10 required growth illustrations in 512px hero format", () => {
    expect(growthIllustrations512.learningGoals).toBeDefined();
    expect(growthIllustrations512.studyPlanner).toBeDefined();
    expect(growthIllustrations512.unifiedCalendar).toBeDefined();
    expect(growthIllustrations512.tutorBooking).toBeDefined();
    expect(growthIllustrations512.savedLibrary).toBeDefined();
    expect(growthIllustrations512.challengesQuests).toBeDefined();
    expect(growthIllustrations512.verifiedAchievement).toBeDefined();
    expect(growthIllustrations512.progressAnalytics).toBeDefined();
    expect(growthIllustrations512.activityTimeline).toBeDefined();
    expect(growthIllustrations512.smartReminders).toBeDefined();

    expect(Object.keys(growthIllustrations512)).toHaveLength(10);
  });

  it("preserves spot and onboarding illustration catalogues", () => {
    expect(Object.keys(spotIllustrations)).toHaveLength(8);
    expect(Object.keys(spotIllustrations512)).toHaveLength(8);
    expect(Object.keys(onboardingIllustrations)).toHaveLength(4);
  });
});
