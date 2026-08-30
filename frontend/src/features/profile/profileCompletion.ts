import type { Profile } from "@/types";

export type MissingProfileField =
  | "full_name"
  | "username"
  | "university"
  | "department"
  | "study_mode_preference"
  | "teach_skills"
  | "learn_skills";

export type ProfileCompletionResult = {
  completionPercent: number;
  missingFields: MissingProfileField[];
  completedSections: string[];
  nextRecommendedStep: string;
  isComplete: boolean;
};

export function calculateProfileCompletion(
  profile: Partial<Profile> | null | undefined,
  skillsKnown?: { name: string }[] | string[] | null,
  skillsWanted?: { name: string }[] | string[] | null,
): ProfileCompletionResult {
  const missing: MissingProfileField[] = [];
  const completed: string[] = [];

  // 1. Full name
  const name = profile?.full_name?.trim();
  if (name && name.toLowerCase() !== "new member") {
    completed.push("full_name");
  } else {
    missing.push("full_name");
  }

  // 2. Username
  const username = profile?.username?.trim().toLowerCase();
  if (username && !/^user_[0-9a-f]{10}$/.test(username)) {
    completed.push("username");
  } else {
    missing.push("username");
  }

  // 3. University
  const university = profile?.university?.trim();
  if (university) {
    completed.push("university");
  } else {
    missing.push("university");
  }

  // 4. Department
  const department = profile?.department?.trim();
  if (department) {
    completed.push("department");
  } else {
    missing.push("department");
  }

  // 5. Study mode preference
  if (profile?.study_mode_preference) {
    completed.push("study_mode_preference");
  } else {
    missing.push("study_mode_preference");
  }

  // 6. Teach skills
  const knownCount = skillsKnown?.length ?? 0;
  if (knownCount > 0) {
    completed.push("teach_skills");
  } else {
    missing.push("teach_skills");
  }

  // 7. Learn skills
  const wantedCount = skillsWanted?.length ?? 0;
  if (wantedCount > 0) {
    completed.push("learn_skills");
  } else {
    missing.push("learn_skills");
  }

  const completionPercent = Math.round((completed.length / 7) * 100);

  // Determine next recommended step
  let nextRecommendedStep = "review";
  if (missing.includes("full_name") || missing.includes("username")) {
    nextRecommendedStep = "identity";
  } else if (missing.includes("university") || missing.includes("department")) {
    nextRecommendedStep = "academic";
  } else if (missing.includes("teach_skills") || missing.includes("learn_skills")) {
    nextRecommendedStep = "skills";
  } else if (missing.includes("study_mode_preference")) {
    nextRecommendedStep = "preferences";
  }

  return {
    completionPercent,
    missingFields: missing,
    completedSections: completed,
    nextRecommendedStep,
    isComplete: completionPercent === 100,
  };
}

export function getResumeStep(
  profile: Partial<Profile> | null | undefined,
  completion: ProfileCompletionResult,
): string {
  if (profile?.onboarding_status === "in_progress" && profile?.onboarding_step) {
    return profile.onboarding_step;
  }
  return completion.nextRecommendedStep;
}
