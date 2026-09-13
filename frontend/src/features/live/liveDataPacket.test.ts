import { encodeLivePacket, decodeLivePacket, LiveDataPacket } from "./liveDataPacket";

describe("LiveKit Realtime Data Packet Protocol (v1)", () => {
  it("encodes and decodes chat packets accurately", () => {
    const chatPacket: LiveDataPacket = {
      version: 1,
      type: "chat",
      text: "Hello live study room!",
      senderId: "user-123",
      senderName: "Alice",
      timestamp: 1726200000000,
    };

    const encoded = encodeLivePacket(chatPacket);
    expect(encoded).toBeInstanceOf(Uint8Array);

    const decoded = decodeLivePacket(encoded);
    expect(decoded).toEqual(chatPacket);
  });

  it("encodes and decodes reaction packets accurately", () => {
    const reactionPacket: LiveDataPacket = {
      version: 1,
      type: "reaction",
      emoji: "🔥",
      senderId: "user-456",
      senderName: "Bob",
      timestamp: 1726200005000,
    };

    const encoded = encodeLivePacket(reactionPacket);
    const decoded = decodeLivePacket(encoded);
    expect(decoded).toEqual(reactionPacket);
  });

  it("encodes and decodes hand raise packets accurately", () => {
    const handPacket: LiveDataPacket = {
      version: 1,
      type: "hand_raise",
      senderId: "user-789",
      senderName: "Charlie",
      timestamp: 1726200010000,
    };

    const encoded = encodeLivePacket(handPacket);
    const decoded = decodeLivePacket(encoded);
    expect(decoded).toEqual(handPacket);
  });

  it("supports backwards compatibility for legacy stringified RAISE_HAND", () => {
    const legacyPayload = new TextEncoder().encode(
      JSON.stringify({ type: "RAISE_HAND", timestamp: 1726200000000, senderId: "user-legacy" })
    );

    const decoded = decodeLivePacket(legacyPayload);
    expect(decoded).toEqual({
      version: 1,
      type: "hand_raise",
      timestamp: 1726200000000,
      senderId: "user-legacy",
      senderName: undefined,
    });
  });

  it("safely returns null for malformed or unknown packets", () => {
    const invalidJson = new TextEncoder().encode("not-a-valid-json");
    expect(decodeLivePacket(invalidJson)).toBeNull();

    const unknownType = new TextEncoder().encode(JSON.stringify({ version: 1, type: "unknown" }));
    expect(decodeLivePacket(unknownType)).toBeNull();
  });
});
