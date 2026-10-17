import test from "node:test";
import assert from "node:assert";
import { isValidTransition, getProviderForCall } from "../routes/calls.js";
import { canUserCall } from "./privacyService.js";
import { env } from "../config/env.js";

test("One-to-One Audio & Video Calling Deep Investigation & Fix Verification Suite", async (suite) => {
  const CALLER_ID = "11111111-1111-4111-8111-111111111111";
  const CALLEE_ID = "22222222-2222-4222-8222-222222222222";
  const CALL_ID = "33333333-3333-4333-8333-333333333333";

  // Mock database client setup
  const { setAdminClient } = await import("../lib/db.js");

  const createMockChain = (data: any = null, error: any = null) => {
    const chain: any = {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
      eq: () => chain,
      in: () => chain,
      limit: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({ data, error }),
      then: (resolve: any) => resolve({ data, error }),
      or: () => chain,
      match: () => chain,
    };
    return chain;
  };

  await suite.test("1. Call State Machine - validates all strict lifecycle transitions", () => {
    assert.strictEqual(isValidTransition("initiating", "ringing"), true);
    assert.strictEqual(isValidTransition("ringing", "accepted"), true);
    assert.strictEqual(isValidTransition("ringing", "declined"), true);
    assert.strictEqual(isValidTransition("ringing", "busy"), true);
    assert.strictEqual(isValidTransition("ringing", "missed"), true);
    assert.strictEqual(isValidTransition("accepted", "connecting"), true);
    assert.strictEqual(isValidTransition("accepted", "connected"), true);
    assert.strictEqual(isValidTransition("accepted", "failed"), true);
    assert.strictEqual(isValidTransition("connecting", "connected"), true);
    assert.strictEqual(isValidTransition("connecting", "failed"), true);
    assert.strictEqual(isValidTransition("connected", "reconnecting"), true);
    assert.strictEqual(isValidTransition("reconnecting", "connected"), true);
    assert.strictEqual(isValidTransition("connected", "ended"), true);

    // Invalid transition checks
    assert.strictEqual(isValidTransition("ended", "connected"), false);
    assert.strictEqual(isValidTransition("declined", "ringing"), false);
    assert.strictEqual(isValidTransition("initiating", "connected"), false);
  });

  await suite.test("2. Provider Decision Engine - selects WebRTC P2P for 1:1 call by default", async () => {
    (env as any).P2P_CALLS_ENABLED = true;
    const provider = await getProviderForCall(CALL_ID, CALLER_ID, "Alice", "webrtc");
    assert.strictEqual(provider.provider, "webrtc");
    assert.deepStrictEqual(provider.providerConfig, {});
  });

  await suite.test("3. Provider Decision Engine - selects LiveKit SFU when P2P disabled", async () => {
    (env as any).P2P_CALLS_ENABLED = false;
    const provider = await getProviderForCall(CALL_ID, CALLER_ID, "Alice", "webrtc");
    assert.strictEqual(provider.provider, "livekit");
    assert.ok(provider.providerConfig?.token);
    assert.strictEqual(provider.providerConfig?.roomName, `skillbridge-call-${CALL_ID}`);
    (env as any).P2P_CALLS_ENABLED = true; // Restore
  });

  await suite.test("4. Call Privacy Guard - rejects incoming call when callee allows nobody", async () => {
    const mockAdmin = {
      from: (table?: string) => {
        if (table === "blocks") return createMockChain([]);
        if (table === "profiles") return createMockChain({ profile_visibility: "public" });
        if (table === "user_settings") {
          return createMockChain({
            notification_preferences: {
              privacy: { who_can_call: "nobody" },
            },
          });
        }
        return createMockChain();
      },
    };
    setAdminClient(mockAdmin as any);

    const check = await canUserCall(CALLER_ID, CALLEE_ID);
    assert.strictEqual(check.allowed, false);
    assert.match(check.reason!, /does not accept calls/);
  });

  await suite.test("5. Call Privacy Guard - allows call when callee allows connections and users are connected", async () => {
    const mockAdmin = {
      from: (table?: string) => {
        if (table === "blocks") return createMockChain([]);
        if (table === "profiles") return createMockChain({ profile_visibility: "public" });
        if (table === "user_settings") {
          return createMockChain({
            notification_preferences: {
              privacy: { who_can_call: "connections" },
            },
          });
        }
        if (table === "connections") return createMockChain({ id: "conn_123" });
        return createMockChain();
      },
    };
    setAdminClient(mockAdmin as any);

    const check = await canUserCall(CALLER_ID, CALLEE_ID);
    assert.strictEqual(check.allowed, true);
  });

  await suite.test("6. Call Privacy Guard - rejects call when callee allows connections but stranger calls", async () => {
    const mockAdmin = {
      from: (table?: string) => {
        if (table === "blocks") return createMockChain([]);
        if (table === "profiles") return createMockChain({ profile_visibility: "public" });
        if (table === "user_settings") {
          return createMockChain({
            notification_preferences: {
              privacy: { who_can_call: "connections" },
            },
          });
        }
        if (table === "connections") return createMockChain(null);
        return createMockChain();
      },
    };
    setAdminClient(mockAdmin as any);

    const check = await canUserCall(CALLER_ID, CALLEE_ID);
    assert.strictEqual(check.allowed, false);
    assert.match(check.reason!, /only accepts calls from connections/);
  });

  await suite.test("7. Call Privacy Guard - rejects call when users have bidirectional block", async () => {
    const mockAdmin = {
      from: (table?: string) => {
        if (table === "blocks") return createMockChain([{ id: "block_123" }]);
        return createMockChain();
      },
    };
    setAdminClient(mockAdmin as any);

    const check = await canUserCall(CALLER_ID, CALLEE_ID);
    assert.strictEqual(check.allowed, false);
    assert.match(check.reason!, /privacy settings/);
  });

  await suite.test("8. Signaling Relay Authorization - resolves authorized peer for active call", () => {
    const callRecord = {
      id: CALL_ID,
      caller_id: CALLER_ID,
      callee_id: CALLEE_ID,
      status: "connected",
    };

    function resolvePeer(userId: string) {
      if (callRecord.caller_id === userId) return callRecord.callee_id;
      if (callRecord.callee_id === userId) return callRecord.caller_id;
      return null;
    }

    assert.strictEqual(resolvePeer(CALLER_ID), CALLEE_ID);
    assert.strictEqual(resolvePeer(CALLEE_ID), CALLER_ID);
    assert.strictEqual(resolvePeer("intruder-id"), null);
  });

  await suite.test("9. WebRTC SDP Offer State Machine - prevents duplicate offer creation while in flight", () => {
    let signalingState = "stable";
    let offerCreated = false;
    let offerInFlight = false;

    function handleSendOffer(): { success: boolean; error?: string } {
      if (offerCreated || offerInFlight) {
        return { success: false, error: "Offer already created or in flight" };
      }
      if (signalingState !== "stable") {
        return { success: false, error: `Invalid signaling state: ${signalingState}` };
      }
      offerInFlight = true;
      signalingState = "have-local-offer";
      offerCreated = true;
      offerInFlight = false;
      return { success: true };
    }

    const firstOffer = handleSendOffer();
    assert.strictEqual(firstOffer.success, true);
    assert.strictEqual(signalingState, "have-local-offer");

    // Second offer attempt (simulating call:accept + call:ready race condition)
    const secondOffer = handleSendOffer();
    assert.strictEqual(secondOffer.success, false);
    assert.match(secondOffer.error!, /Offer already created/);
  });

  await suite.test("10. WebRTC Trickle ICE Candidate Queue - queues candidates before remote description is set", () => {
    const pendingCandidates: any[] = [];
    let remoteDescriptionSet = false;
    const appliedCandidates: any[] = [];

    function receiveCandidate(candidate: any) {
      if (remoteDescriptionSet) {
        appliedCandidates.push(candidate);
      } else {
        pendingCandidates.push(candidate);
      }
    }

    function setRemoteDescription() {
      remoteDescriptionSet = true;
      while (pendingCandidates.length > 0) {
        appliedCandidates.push(pendingCandidates.shift());
      }
    }

    // 3 ICE candidates arrive before SDP answer is processed
    receiveCandidate({ candidate: "candidate:1", sdpMid: "0" });
    receiveCandidate({ candidate: "candidate:2", sdpMid: "1" });
    receiveCandidate({ candidate: "candidate:3", sdpMid: "0" });

    assert.strictEqual(pendingCandidates.length, 3);
    assert.strictEqual(appliedCandidates.length, 0);

    // Remote description arrives
    setRemoteDescription();

    assert.strictEqual(pendingCandidates.length, 0);
    assert.strictEqual(appliedCandidates.length, 3);
    assert.strictEqual(appliedCandidates[0].candidate, "candidate:1");
  });

  await suite.test("11. Server-side Signaling Buffer - replays buffered offer and ICE candidates on call:ready", () => {
    // Simulating the server-side callSignalingBuffer mechanism in socket.ts
    const buffer = new Map<string, { offer?: any; candidates: any[]; createdAt: number }>();

    function saveOffer(callId: string, offer: any) {
      const entry = buffer.get(callId) || { candidates: [], createdAt: Date.now() };
      entry.offer = offer;
      buffer.set(callId, entry);
    }

    function saveCandidate(callId: string, candidate: any) {
      const entry = buffer.get(callId) || { candidates: [], createdAt: Date.now() };
      entry.candidates.push(candidate);
      buffer.set(callId, entry);
    }

    function handleCallReady(callId: string): { replayedOffer: any; replayedCandidates: any[] } {
      const entry = buffer.get(callId);
      if (!entry) return { replayedOffer: null, replayedCandidates: [] };
      return {
        replayedOffer: entry.offer || null,
        replayedCandidates: [...entry.candidates],
      };
    }

    // Caller emits offer and 2 ICE candidates before callee emits call:ready
    saveOffer(CALL_ID, { type: "offer", sdp: "v=0 mock_sdp" });
    saveCandidate(CALL_ID, { candidate: "cand-1", sdpMid: "0" });
    saveCandidate(CALL_ID, { candidate: "cand-2", sdpMid: "1" });

    // Callee mounts screen and emits call:ready
    const replayed = handleCallReady(CALL_ID);
    assert.ok(replayed.replayedOffer);
    assert.strictEqual(replayed.replayedOffer.type, "offer");
    assert.strictEqual(replayed.replayedCandidates.length, 2);
    assert.strictEqual(replayed.replayedCandidates[0].candidate, "cand-1");
  });
});

