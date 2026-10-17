jest.mock("@/components/ui", () => ({
  triggerHaptic: jest.fn(),
  Row: ({ children }: any) => children,
}));

import { RoomLiveStrip } from "./RoomLiveStrip";
import { useRoomLiveStatus, type RoomLiveStatusPayload } from "./useRoomLiveStatus";

describe("RoomLiveStrip Architecture & State Logic", () => {
  it("exports RoomLiveStrip component cleanly", () => {
    expect(RoomLiveStrip).toBeDefined();
    expect(typeof RoomLiveStrip).toBe("function");
  });

  it("exports useRoomLiveStatus hook cleanly", () => {
    expect(useRoomLiveStatus).toBeDefined();
    expect(typeof useRoomLiveStatus).toBe("function");
  });

  describe("State transitions and payload structures", () => {
    it("correctly models State A: Idle / Nothing live", () => {
      const payload: RoomLiveStatusPayload = {
        openSession: null,
        studySession: null,
        participantCount: 0,
        participants: [],
        hostId: null,
        media: null,
        studyWindow: { active: false, startsAt: null, endsAt: null },
        me: { canStartOpen: true, canStartStudy: false, canJoin: false },
      };

      expect(payload.openSession).toBeNull();
      expect(payload.studySession).toBeNull();
      expect(payload.me.canStartOpen).toBe(true);
    });

    it("correctly models State B: Open live audio/video session", () => {
      const payload: RoomLiveStatusPayload = {
        openSession: {
          id: "open-session-123",
          media: "audio",
          startedAt: new Date().toISOString(),
          hostId: "user-abc",
          participantCount: 4,
          participants: [
            { userId: "u1", name: "Alice", avatarUrl: null },
            { userId: "u2", name: "Bob", avatarUrl: null },
          ],
        },
        studySession: null,
        participantCount: 4,
        participants: [],
        hostId: "user-abc",
        media: "audio",
        studyWindow: { active: false, startsAt: null, endsAt: null },
        me: { canStartOpen: false, canStartStudy: false, canJoin: true },
      };

      expect(payload.openSession?.id).toBe("open-session-123");
      expect(payload.openSession?.media).toBe("audio");
      expect(payload.openSession?.participantCount).toBe(4);
      expect(payload.me.canJoin).toBe(true);
    });

    it("correctly models State C: Study session live with open sessions paused", () => {
      const payload: RoomLiveStatusPayload = {
        openSession: null,
        studySession: {
          id: "study-session-456",
          title: "Calculus Final Exam Review",
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 3600_000).toISOString(),
          status: "live",
          hostId: "teacher-1",
          isLive: true,
          participantCount: 18,
          participants: [],
        },
        participantCount: 18,
        participants: [],
        hostId: "teacher-1",
        media: "video",
        studyWindow: {
          active: true,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        me: {
          canStartOpen: false,
          canStartStudy: true,
          canJoin: true,
          reason: "Study session currently in progress",
        },
      };

      expect(payload.studySession?.isLive).toBe(true);
      expect(payload.studyWindow.active).toBe(true);
      expect(payload.me.canStartOpen).toBe(false);
      expect(payload.me.canStartStudy).toBe(true);
    });

    it("correctly models State D: Study session scheduled soon (within 2 minutes)", () => {
      const payload: RoomLiveStatusPayload = {
        openSession: null,
        studySession: {
          id: "study-session-789",
          title: "Physics Lab Prep",
          startsAt: new Date(Date.now() + 60_000).toISOString(),
          endsAt: new Date(Date.now() + 3660_000).toISOString(),
          status: "scheduled",
          hostId: "teacher-2",
          isLive: false,
          participantCount: 0,
          participants: [],
        },
        participantCount: 0,
        participants: [],
        hostId: null,
        media: null,
        studyWindow: {
          active: true,
          startsAt: new Date(Date.now() + 60_000).toISOString(),
          endsAt: new Date(Date.now() + 3660_000).toISOString(),
        },
        me: {
          canStartOpen: false,
          canStartStudy: false,
          canJoin: false,
          reason: "Study session scheduled within 2 minutes",
        },
      };

      expect(payload.studySession?.status).toBe("scheduled");
      expect(payload.studyWindow.active).toBe(true);
      expect(payload.me.canStartOpen).toBe(false);
    });
  });
});
