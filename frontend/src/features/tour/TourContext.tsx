import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { triggerHaptic } from "@/components/ui";
import type { Profile } from "@/types";

export type TourChapter = {
  id: string;
  stepNumber: number;
  titleKey?: string;
  bodyKey?: string;
  title?: string;
  body?: string;
  route: string;
};

export const TOUR_CHAPTERS: TourChapter[] = [
  { id: "dashboard", stepNumber: 1, titleKey: "tour.step1Title", bodyKey: "tour.step1Body", route: "/(tabs)" },
  { id: "search", stepNumber: 2, titleKey: "tour.step2Title", bodyKey: "tour.step2Body", route: "/search" },
  { id: "rooms", stepNumber: 3, titleKey: "tour.step3Title", bodyKey: "tour.step3Body", route: "/rooms" },
  { id: "chat", stepNumber: 4, titleKey: "tour.step4Title", bodyKey: "tour.step4Body", route: "/(tabs)/inbox" },
  { id: "livekit", stepNumber: 5, titleKey: "tour.step5Title", bodyKey: "tour.step5Body", route: "/schedule" },
  { id: "quests", stepNumber: 6, titleKey: "tour.step6Title", bodyKey: "tour.step6Body", route: "/leaderboard" },
  { id: "settings", stepNumber: 7, titleKey: "tour.step7Title", bodyKey: "tour.step7Body", route: "/settings" },
];

const TOUR_STORAGE_KEY = "@skillbridge_guided_tour_v3";

type StoredTour = {
  version: number;
  status: "in_progress" | "completed" | "skipped";
  lastStep: string;
};

type ExperienceContentResponse = {
  contentSets: {
    content_type: "tour";
    locale: "en" | "bn";
    version: number;
    content: unknown;
  }[];
};

interface TourContextType {
  isActive: boolean;
  currentStepIndex: number;
  currentChapter: TourChapter;
  chapters: TourChapter[];
  tourVersion: number;
  isLastStep: boolean;
  startTour: () => void;
  nextStep: () => void;
  skipStep: () => void;
  skipTour: () => void;
  restartTour: () => void;
}

const TourContext = createContext<TourContextType | null>(null);

function parseTourChapters(value: unknown): TourChapter[] | null {
  if (!Array.isArray(value)) return null;
  const chapters = value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.title !== "string" || typeof candidate.body !== "string" || typeof candidate.route !== "string") return [];
    return [{
      id: candidate.id,
      title: candidate.title,
      body: candidate.body,
      route: candidate.route,
      stepNumber: index + 1,
    }];
  });
  return chapters.length === value.length && chapters.length > 0 ? chapters : null;
}

function readStoredTour(raw: string | null): StoredTour | null {
  if (!raw) return null;
  if (raw === "completed" || raw === "skipped") return { version: 1, status: raw, lastStep: "settings" };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTour>;
    if (typeof parsed.version !== "number" || typeof parsed.lastStep !== "string") return null;
    if (parsed.status !== "in_progress" && parsed.status !== "completed" && parsed.status !== "skipped") return null;
    return parsed as StoredTour;
  } catch {
    return null;
  }
}

export function TourProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  const { language } = useI18n();
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [chapters, setChapters] = useState<TourChapter[]>(TOUR_CHAPTERS);
  const [tourVersion, setTourVersion] = useState(1);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const [storedRaw, me, contentResponse] = await Promise.all([
        AsyncStorage.getItem(TOUR_STORAGE_KEY).catch(() => null),
        api<{ profile: Profile }>("/profiles/me").catch(() => null),
        api<ExperienceContentResponse>(`/experience/content?type=tour&locale=${language}`).catch(() => null),
      ]);
      if (cancelled) return;

      const activeContent = contentResponse?.contentSets[0];
      const serverChapters = parseTourChapters(activeContent?.content);
      const nextChapters = serverChapters ?? TOUR_CHAPTERS;
      const nextVersion = activeContent?.version ?? 1;
      setChapters(nextChapters);
      setTourVersion(nextVersion);

      const profile = me?.profile;
      const stored = readStoredTour(storedRaw);
      const serverStatus = profile?.guided_tour_status ?? "pending";
      const serverVersion = profile?.guided_tour_version ?? 1;
      const lastStep = profile?.guided_tour_last_step || stored?.lastStep || nextChapters[0]?.id;
      const resumeIndex = Math.max(0, nextChapters.findIndex((chapter) => chapter.id === lastStep));
      const knownVersion = Math.max(serverVersion, stored?.version ?? 0);
      const hasNewVersion = knownVersion < nextVersion;
      const locallyFinishedCurrent = stored?.version === nextVersion && (stored.status === "completed" || stored.status === "skipped");

      if (hasNewVersion || (!locallyFinishedCurrent && (serverStatus === "pending" || serverStatus === "in_progress"))) {
        const nextIndex = hasNewVersion ? 0 : resumeIndex;
        setCurrentStepIndex(nextIndex);
        setIsActive(true);
        const initialChapter = nextChapters[nextIndex];
        if (initialChapter) {
          const initialState: StoredTour = { version: nextVersion, status: "in_progress", lastStep: initialChapter.id };
          void AsyncStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(initialState));
          void api("/profiles/me/tour/progress", {
            method: "POST",
            body: JSON.stringify({ step: initialChapter.id, isLast: false, skipped: false, version: nextVersion }),
          }).catch(() => undefined);
          router.replace(initialChapter.route as never);
        }
      } else {
        setIsActive(false);
      }

      if (locallyFinishedCurrent && (serverStatus === "pending" || serverStatus === "in_progress") && stored) {
        const finalChapter = nextChapters.find((chapter) => chapter.id === stored.lastStep) ?? nextChapters.at(-1);
        if (finalChapter) {
          void api("/profiles/me/tour/progress", {
            method: "POST",
            body: JSON.stringify({
              step: finalChapter.id,
              isLast: stored.status === "completed",
              skipped: stored.status === "skipped",
              version: nextVersion,
            }),
          }).catch(() => undefined);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, language]);

  const saveProgress = useCallback(async (stepIndex: number, status: StoredTour["status"]) => {
    const chapter = chapters[stepIndex];
    if (!chapter) return;
    const stored: StoredTour = { version: tourVersion, status, lastStep: chapter.id };
    await AsyncStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(stored)).catch(() => undefined);
    try {
      await api("/profiles/me/tour/progress", {
        method: "POST",
        body: JSON.stringify({
          step: chapter.id,
          isLast: status === "completed",
          skipped: status === "skipped",
          version: tourVersion,
        }),
      });
    } catch (error) {
      console.warn("Failed to sync tour progress", error);
    }
  }, [chapters, tourVersion]);

  const navigateTo = useCallback((index: number) => {
    const route = chapters[index]?.route;
    if (route) router.replace(route as never);
  }, [chapters]);

  const startTour = useCallback(() => {
    triggerHaptic();
    setCurrentStepIndex(0);
    setIsActive(true);
    navigateTo(0);
    void saveProgress(0, "in_progress");
  }, [navigateTo, saveProgress]);

  const nextStep = useCallback(() => {
    triggerHaptic();
    if (currentStepIndex < chapters.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      navigateTo(nextIndex);
      void saveProgress(nextIndex, "in_progress");
      return;
    }
    void saveProgress(currentStepIndex, "completed");
    setIsActive(false);
  }, [chapters.length, currentStepIndex, navigateTo, saveProgress]);

  const skipStep = useCallback(() => {
    triggerHaptic();
    if (currentStepIndex < chapters.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      navigateTo(nextIndex);
      void saveProgress(nextIndex, "in_progress");
    } else {
      void saveProgress(currentStepIndex, "completed");
      setIsActive(false);
    }
  }, [chapters.length, currentStepIndex, navigateTo, saveProgress]);

  const skipTour = useCallback(() => {
    triggerHaptic();
    void saveProgress(currentStepIndex, "skipped");
    setIsActive(false);
  }, [currentStepIndex, saveProgress]);

  const restartTour = useCallback(() => {
    void AsyncStorage.removeItem(TOUR_STORAGE_KEY).finally(startTour);
  }, [startTour]);

  const currentChapter = chapters[currentStepIndex] ?? chapters[0] ?? TOUR_CHAPTERS[0]!;
  const value = useMemo<TourContextType>(() => ({
    isActive: enabled && isActive,
    currentStepIndex,
    currentChapter,
    chapters,
    tourVersion,
    isLastStep: currentStepIndex === chapters.length - 1,
    startTour,
    nextStep,
    skipStep,
    skipTour,
    restartTour,
  }), [chapters, currentChapter, currentStepIndex, enabled, isActive, nextStep, restartTour, skipStep, skipTour, startTour, tourVersion]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) throw new Error("useTour must be used within a TourProvider");
  return context;
}
