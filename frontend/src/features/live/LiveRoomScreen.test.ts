import {
  encodeLivePacket,
  decodeLivePacket,
  LivePollPacket,
  LiveQAQueuePacket,
  LiveChatPacket,
  LiveReactionPacket,
  LiveHandRaisePacket,
} from "./liveDataPacket";

describe("Live Room Suite Tests", () => {
  it("formats and parses interactive live poll packets correctly", () => {
    const poll: LivePollPacket = {
      version: 1,
      type: "poll",
      pollId: "test-poll-1",
      question: "Which topic should we deep dive next?",
      options: [
        { id: "opt-1", text: "React Server Components" },
        { id: "opt-2", text: "WebRTC Media Architecture" },
        { id: "opt-3", text: "AI Agent Workflows" },
      ],
      action: "start",
      timestamp: Date.now(),
    };

    const encoded = encodeLivePacket(poll);
    const decoded = decodeLivePacket(encoded);
    expect(decoded).toEqual(poll);
  });

  it("handles live Q&A question submission and resolved state", () => {
    const qaAsk: LiveQAQueuePacket = {
      version: 1,
      type: "qa_queue",
      questionId: "q-101",
      title: "How does the LiveKit dynacast feature conserve participant uplink?",
      senderId: "student-42",
      senderName: "Tanvir",
      action: "ask",
      timestamp: Date.now(),
    };

    const encoded = encodeLivePacket(qaAsk);
    const decoded = decodeLivePacket(encoded) as LiveQAQueuePacket;
    expect(decoded.action).toBe("ask");
    expect(decoded.title).toContain("dynacast");

    const qaAnswered: LiveQAQueuePacket = {
      ...qaAsk,
      action: "answered",
      timestamp: Date.now() + 5000,
    };
    const decodedAnswered = decodeLivePacket(encodeLivePacket(qaAnswered)) as LiveQAQueuePacket;
    expect(decodedAnswered.action).toBe("answered");
  });

  it("handles live chat messages with emojis and rich text", () => {
    const chat: LiveChatPacket = {
      version: 1,
      type: "chat",
      text: "Great explanation on the whiteboard! 🔥",
      senderId: "user-99",
      senderName: "Ayesha",
      timestamp: Date.now(),
    };

    const decoded = decodeLivePacket(encodeLivePacket(chat));
    expect(decoded).toEqual(chat);
  });

  it("handles hand raise toggle states", () => {
    const raise: LiveHandRaisePacket = {
      version: 1,
      type: "hand_raise",
      isRaised: true,
      senderId: "user-100",
      senderName: "Rahim",
      timestamp: Date.now(),
    };

    const decodedRaise = decodeLivePacket(encodeLivePacket(raise)) as LiveHandRaisePacket;
    expect(decodedRaise.isRaised).toBe(true);

    const lower: LiveHandRaisePacket = {
      ...raise,
      isRaised: false,
      timestamp: Date.now() + 1000,
    };
    const decodedLower = decodeLivePacket(encodeLivePacket(lower)) as LiveHandRaisePacket;
    expect(decodedLower.isRaised).toBe(false);
  });
});
