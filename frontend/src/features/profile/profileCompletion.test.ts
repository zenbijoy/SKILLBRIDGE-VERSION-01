import { describe, it, expect } from "@jest/globals";
import { calculateProfileCompletion, getResumeStep } from "./profileCompletion";
import type { Profile } from "@/types";

describe("calculateProfileCompletion", () => {
  it("calculates 0% completion for newly provisioned profile", () => {
    const minimalProfile: Partial<Profile> = {
      full_name: "New member",
      username: "user_0123456789",
      university: "",
      department: "",
      study_mode_preference: undefined,
    };

    const result = calculateProfileCompletion(minimalProfile, [], []);
    expect(result.completionPercent).toBe(0);
    expect(result.missingFields).toHaveLength(7);
    expect(result.isComplete).toBe(false);
    expect(result.nextRecommendedStep).toBe("identity");
  });

  it("calculates 100% completion when all 7 fields are completed", () => {
    const completeProfile: Partial<Profile> = {
      full_name: "John Doe",
      username: "johndoe",
      university: "Dhaka University",
      department: "Computer Science",
      study_mode_preference: "hybrid",
    };

    const result = calculateProfileCompletion(
      completeProfile,
      [{ name: "Python" }],
      [{ name: "Data Science" }],
    );

    expect(result.completionPercent).toBe(100);
    expect(result.missingFields).toHaveLength(0);
    expect(result.isComplete).toBe(true);
    expect(result.nextRecommendedStep).toBe("review");
  });

  it("calculates partial completion and recommends correct missing section", () => {
    const partialProfile: Partial<Profile> = {
      full_name: "Alice Smith",
      username: "alicesmith",
      university: "MIT",
      department: "Physics",
      study_mode_preference: "online",
    };

    // Missing teaching and learning skills (5 out of 7 completed = 71%)
    const result = calculateProfileCompletion(partialProfile, [], []);
    expect(result.completionPercent).toBe(71);
    expect(result.missingFields).toEqual(["teach_skills", "learn_skills"]);
    expect(result.nextRecommendedStep).toBe("skills");
  });

  it("identifies academic section when university or department is missing", () => {
    const profile: Partial<Profile> = {
      full_name: "Bob Builder",
      username: "bobbuilder",
      university: "",
      department: "",
      study_mode_preference: "offline",
    };

    const result = calculateProfileCompletion(
      profile,
      [{ name: "Architecture" }],
      [{ name: "Civil Engineering" }],
    );
    expect(result.missingFields).toContain("university");
    expect(result.missingFields).toContain("department");
    expect(result.nextRecommendedStep).toBe("academic");
  });
});

describe("getResumeStep", () => {
  it("resumes at explicitly saved in_progress onboarding_step", () => {
    const profile: Partial<Profile> = {
      onboarding_status: "in_progress",
      onboarding_step: "academic",
    };
    const completion = calculateProfileCompletion(profile, [], []);
    const step = getResumeStep(profile, completion);
    expect(step).toBe("academic");
  });

  it("falls back to first missing section if onboarding_step is not in_progress", () => {
    const profile: Partial<Profile> = {
      onboarding_status: "deferred",
      full_name: "New member",
    };
    const completion = calculateProfileCompletion(profile, [], []);
    const step = getResumeStep(profile, completion);
    expect(step).toBe("identity");
  });
});
