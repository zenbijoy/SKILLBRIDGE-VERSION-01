import {
  deriveStatus,
  filterQuestions,
  formatRelativeTime,
  getUrgencyMeta,
  HelpQuestionSummary,
  matchesSearch,
  roomLabel,
  summarizeQuestions,
} from "./helpUtils";

describe("helpUtils", () => {
  describe("getUrgencyMeta", () => {
    it("returns warning metadata for 'today'", () => {
      const meta = getUrgencyMeta("today");
      expect(meta.label).toBe("Due Today");
      expect(meta.tone).toBe("warning");
      expect(meta.icon).toBe("alert-circle-outline");
    });

    it("returns danger metadata for 'exam_soon'", () => {
      const meta = getUrgencyMeta("exam_soon");
      expect(meta.label).toBe("Exam Soon");
      expect(meta.tone).toBe("danger");
      expect(meta.icon).toBe("fire");
    });

    it("returns default normal metadata for 'normal' and fallback", () => {
      const normal = getUrgencyMeta("normal");
      expect(normal.label).toBe("Normal");
      expect(normal.tone).toBe("default");

      const fallback = getUrgencyMeta(undefined);
      expect(fallback.label).toBe("Normal");
      expect(fallback.tone).toBe("default");

      const unknown = getUrgencyMeta("something_else");
      expect(unknown.label).toBe("Normal");
    });
  });

  describe("deriveStatus", () => {
    it("returns 'resolved' when isResolved is true", () => {
      expect(deriveStatus({ isResolved: true, hasAcceptedAnswer: false, answersCount: 0 })).toBe("resolved");
    });

    it("returns 'resolved' when hasAcceptedAnswer is true", () => {
      expect(deriveStatus({ isResolved: false, hasAcceptedAnswer: true, answersCount: 2 })).toBe("resolved");
    });

    it("returns 'answered' when not resolved but answersCount > 0", () => {
      expect(deriveStatus({ isResolved: false, hasAcceptedAnswer: false, answersCount: 3 })).toBe("answered");
    });

    it("returns 'open' when not resolved and answersCount is 0", () => {
      expect(deriveStatus({ isResolved: false, hasAcceptedAnswer: false, answersCount: 0 })).toBe("open");
    });
  });

  const mockQuestions: HelpQuestionSummary[] = [
    {
      id: "q-1",
      roomId: "room-1",
      roomTitle: "Math Hall",
      title: "How to solve differential equations?",
      body: "Need help with second order ODEs.",
      isResolved: false,
      upvotesCount: 5,
      createdAt: new Date().toISOString(),
      answersCount: 0,
      hasAcceptedAnswer: false,
      subject: "Calculus",
      topic: "ODEs",
      urgency: "today",
      author: { id: "u-1", full_name: "Alice", username: "alice" },
    },
    {
      id: "q-2",
      roomId: "room-2",
      roomTitle: "Physics Lab",
      title: "Quantum tunneling question",
      body: "What is the wave function decay rate?",
      isResolved: false,
      upvotesCount: 2,
      createdAt: new Date().toISOString(),
      answersCount: 3,
      hasAcceptedAnswer: false,
      subject: "Physics",
      topic: "Quantum",
      urgency: "exam_soon",
      author: { id: "u-2", full_name: "Bob", username: "bob" },
    },
    {
      id: "q-3",
      roomId: "room-3",
      roomTitle: "CS Study",
      title: "Binary Search Tree balanced rotation",
      body: "AVL tree left-right rotation question",
      isResolved: true,
      upvotesCount: 8,
      createdAt: new Date().toISOString(),
      answersCount: 1,
      hasAcceptedAnswer: true,
      subject: "CS",
      topic: "Trees",
      urgency: "normal",
      author: { id: "u-1", full_name: "Alice", username: "alice" },
    },
  ];

  describe("matchesSearch", () => {
    it("returns true on empty needle", () => {
      expect(matchesSearch(mockQuestions[0], "")).toBe(true);
      expect(matchesSearch(mockQuestions[0], "   ")).toBe(true);
    });

    it("matches against title, body, subject, topic, and roomTitle case-insensitively", () => {
      expect(matchesSearch(mockQuestions[0], "differential")).toBe(true);
      expect(matchesSearch(mockQuestions[0], "ODES")).toBe(true);
      expect(matchesSearch(mockQuestions[0], "calculus")).toBe(true);
      expect(matchesSearch(mockQuestions[0], "math hall")).toBe(true);
      expect(matchesSearch(mockQuestions[0], "not-found-term")).toBe(false);
    });
  });

  describe("filterQuestions", () => {
    it("returns all questions when status is 'all' and no filter applied", () => {
      const res = filterQuestions(mockQuestions, { status: "all" });
      expect(res.length).toBe(3);
    });

    it("filters by status correctly", () => {
      const openOnly = filterQuestions(mockQuestions, { status: "open" });
      expect(openOnly.map((q) => q.id)).toEqual(["q-1"]);

      const answeredOnly = filterQuestions(mockQuestions, { status: "answered" });
      expect(answeredOnly.map((q) => q.id)).toEqual(["q-2", "q-3"]);

      const resolvedOnly = filterQuestions(mockQuestions, { status: "resolved" });
      expect(resolvedOnly.map((q) => q.id)).toEqual(["q-3"]);
    });

    it("filters by onlyMine", () => {
      const mine = filterQuestions(mockQuestions, { onlyMine: true, userId: "u-1" });
      expect(mine.map((q) => q.id)).toEqual(["q-1", "q-3"]);

      const notMine = filterQuestions(mockQuestions, { onlyMine: true, userId: "u-2" });
      expect(notMine.map((q) => q.id)).toEqual(["q-2"]);
    });

    it("combines status and search filter", () => {
      const filtered = filterQuestions(mockQuestions, { status: "all", search: "quantum" });
      expect(filtered.map((q) => q.id)).toEqual(["q-2"]);
    });
  });

  describe("summarizeQuestions", () => {
    it("accurately summarizes questions breakdown", () => {
      const summary = summarizeQuestions(mockQuestions);
      expect(summary.total).toBe(3);
      expect(summary.open).toBe(1);
      expect(summary.answered).toBe(1);
      expect(summary.resolved).toBe(1);
    });
  });

  describe("formatRelativeTime", () => {
    it("handles missing or invalid inputs", () => {
      expect(formatRelativeTime(undefined)).toBe("");
      expect(formatRelativeTime("invalid-date")).toBe("");
    });

    it("formats just now, minutes, hours, and days ago", () => {
      const now = 1_700_000_000_000;
      expect(formatRelativeTime(new Date(now - 10_000).toISOString(), now)).toBe("just now");
      expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5m ago");
      expect(formatRelativeTime(new Date(now - 3 * 3600_000).toISOString(), now)).toBe("3h ago");
      expect(formatRelativeTime(new Date(now - 2 * 86400_000).toISOString(), now)).toBe("2d ago");

      // Older than 7 days returns month and day
      const oldDate = new Date(now - 10 * 86400_000).toISOString();
      const formattedOld = formatRelativeTime(oldDate, now);
      expect(formattedOld.length).toBeGreaterThan(0);
    });
  });

  describe("roomLabel", () => {
    it("returns formatted room title or fallback", () => {
      expect(roomLabel("  Study Space 101  ")).toBe("Study Space 101");
      expect(roomLabel("")).toBe("Study Space");
      expect(roomLabel(null)).toBe("Study Space");
      expect(roomLabel(undefined)).toBe("Study Space");
    });
  });
});
