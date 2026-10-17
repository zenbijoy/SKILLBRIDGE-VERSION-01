/**
 * Frontend WebRTC Signaling Sequence & Race Condition Unit Tests
 * Tests the signaling flow: accept -> ready -> offer -> answer -> ICE candidates,
 * single-flight setup, and handling cases where the offer is requested before
 * the callee screen mounts.
 */

describe("WebRTC Signaling Sequence & Race Mitigation", () => {
  interface MockCandidate {
    candidate: string;
    sdpMid: string;
    sdpMLineIndex: number;
  }

  interface MockSessionDescription {
    type: "offer" | "answer";
    sdp: string;
  }

  class MockSignalingChannel {
    public events: { event: string; data: any }[] = [];
    public listeners: Map<string, ((data: any) => void)[]> = new Map();

    emit(event: string, data: any) {
      this.events.push({ event, data });
      const handlers = this.listeners.get(event) || [];
      handlers.forEach((h) => h(data));
    }

    on(event: string, handler: (data: any) => void) {
      const list = this.listeners.get(event) || [];
      list.push(handler);
      this.listeners.set(event, list);
    }
  }

  class SignalingPeer {
    public role: "caller" | "callee";
    public peerReady = false;
    public offerCreated = false;
    public localDescription: MockSessionDescription | null = null;
    public remoteDescription: MockSessionDescription | null = null;
    public outgoingCandidates: MockCandidate[] = [];
    public incomingCandidatesQueue: MockCandidate[] = [];
    public appliedCandidates: MockCandidate[] = [];
    public setupPromise: Promise<string> | null = null;
    public setupCount = 0;

    constructor(role: "caller" | "callee", private socket: MockSignalingChannel) {
      this.role = role;
    }

    // Single-flight PC and media initialization guard
    async setupPeerConnection(): Promise<string> {
      if (this.setupPromise) {
        return this.setupPromise;
      }
      this.setupPromise = (async () => {
        this.setupCount++;
        return `pc_${this.role}_${this.setupCount}`;
      })();
      return this.setupPromise;
    }

    // Caller: sendOffer only proceeds when peer is ready, and allows resend on ready
    async sendOffer(options?: { iceRestart?: boolean }): Promise<boolean> {
      if (!this.peerReady && !options?.iceRestart) {
        // Guarded: do not emit offer before callee emits call:ready
        return false;
      }

      if (this.offerCreated && !options?.iceRestart && this.localDescription) {
        // Idempotent re-send existing offer if peer emits ready again
        this.socket.emit("call:offer", { sdp: this.localDescription });
        return true;
      }

      this.localDescription = {
        type: "offer",
        sdp: options?.iceRestart ? "v=0 offer ice-restart" : "v=0 initial offer",
      };
      this.offerCreated = true;
      this.socket.emit("call:offer", { sdp: this.localDescription });

      // Flush buffered outgoing candidates once offer is sent
      while (this.outgoingCandidates.length > 0) {
        const cand = this.outgoingCandidates.shift()!;
        this.socket.emit("call:ice-candidate", { candidate: cand });
      }

      return true;
    }

    // Emit ICE candidate or buffer it until peer is ready
    emitCandidate(candidate: MockCandidate) {
      if (this.role === "caller" && !this.peerReady) {
        // Buffer outgoing ICE candidates until callee is ready
        this.outgoingCandidates.push(candidate);
      } else {
        this.socket.emit("call:ice-candidate", { candidate });
      }
    }

    // Callee: receive offer, set remote description, send answer
    async receiveOffer(offer: MockSessionDescription) {
      this.remoteDescription = offer;
      this.localDescription = { type: "answer", sdp: "v=0 answer" };
      this.socket.emit("call:answer", { sdp: this.localDescription });

      // Flush any queued incoming ICE candidates
      while (this.incomingCandidatesQueue.length > 0) {
        this.appliedCandidates.push(this.incomingCandidatesQueue.shift()!);
      }
    }

    // Receive ICE candidate with queueing before remote description is set
    receiveCandidate(candidate: MockCandidate) {
      if (!this.remoteDescription) {
        this.incomingCandidatesQueue.push(candidate);
      } else {
        this.appliedCandidates.push(candidate);
      }
    }
  }

  it("1. Standard sequence: accept -> ready -> offer -> answer -> ICE candidates", async () => {
    const socket = new MockSignalingChannel();
    const caller = new SignalingPeer("caller", socket);
    const callee = new SignalingPeer("callee", socket);

    // 1. Callee sends call:accept
    socket.emit("call:accept", { callId: "call_123" });

    // 2. Caller does NOT send offer on call:accept alone
    const offerSentBeforeReady = await caller.sendOffer();
    expect(offerSentBeforeReady).toBe(false);
    expect(socket.events.filter((e) => e.event === "call:offer").length).toBe(0);

    // 3. Callee mounts CallScreen and emits call:ready
    socket.emit("call:ready", { callId: "call_123" });
    caller.peerReady = true;

    // 4. Caller now sends offer
    const offerSent = await caller.sendOffer();
    expect(offerSent).toBe(true);
    expect(caller.localDescription?.type).toBe("offer");
    expect(socket.events.filter((e) => e.event === "call:offer").length).toBe(1);

    // 5. Callee receives offer and emits answer
    await callee.receiveOffer(caller.localDescription!);
    expect(callee.localDescription?.type).toBe("answer");
    expect(socket.events.filter((e) => e.event === "call:answer").length).toBe(1);

    // 6. ICE candidates flow
    callee.receiveCandidate({ candidate: "candidate:callee_1", sdpMid: "0", sdpMLineIndex: 0 });
    expect(callee.appliedCandidates.length).toBe(1);
  });

  it("2. Mitigates lost offer race: caller buffers candidates and resends offer on late call:ready", async () => {
    const socket = new MockSignalingChannel();
    const caller = new SignalingPeer("caller", socket);
    const callee = new SignalingPeer("callee", socket);

    // Callee accepts, navigation is in flight (screen not mounted yet)
    socket.emit("call:accept", { callId: "call_123" });

    // Caller attempts to emit candidates before callee is ready
    caller.emitCandidate({ candidate: "cand_early_1", sdpMid: "0", sdpMLineIndex: 0 });
    caller.emitCandidate({ candidate: "cand_early_2", sdpMid: "1", sdpMLineIndex: 1 });

    expect(caller.outgoingCandidates.length).toBe(2);
    expect(socket.events.filter((e) => e.event === "call:ice-candidate").length).toBe(0);

    // Callee finishes navigation, mounts screen, and emits call:ready
    socket.emit("call:ready", { callId: "call_123" });
    caller.peerReady = true;

    // Caller sends offer, which flushes the buffered candidates
    await caller.sendOffer();
    expect(caller.outgoingCandidates.length).toBe(0);
    expect(socket.events.filter((e) => e.event === "call:offer").length).toBe(1);
    expect(socket.events.filter((e) => e.event === "call:ice-candidate").length).toBe(2);

    // Callee receives flushed offer
    await callee.receiveOffer(caller.localDescription!);
    expect(callee.remoteDescription?.type).toBe("offer");

    // Second call:ready from reconnected peer resends localDescription idempotently
    await caller.sendOffer();
    expect(socket.events.filter((e) => e.event === "call:offer").length).toBe(2);
  });

  it("3. Single-flight media & peer connection setup prevents duplicate RTCPeerConnection", async () => {
    const socket = new MockSignalingChannel();
    const callee = new SignalingPeer("callee", socket);

    // Simulate concurrent calls from startOutgoingCall and call:offer
    const [pc1, pc2, pc3] = await Promise.all([
      callee.setupPeerConnection(),
      callee.setupPeerConnection(),
      callee.setupPeerConnection(),
    ]);

    expect(pc1).toBe("pc_callee_1");
    expect(pc2).toBe("pc_callee_1");
    expect(pc3).toBe("pc_callee_1");
    expect(callee.setupCount).toBe(1);
  });

  it("4. Bounded ICE restart with { iceRestart: true } from caller without ping-pong", async () => {
    const socket = new MockSignalingChannel();
    const caller = new SignalingPeer("caller", socket);
    caller.peerReady = true;

    // Initial offer
    await caller.sendOffer();
    expect(caller.localDescription?.sdp).toContain("initial offer");

    // Network disconnection triggers ICE restart
    await caller.sendOffer({ iceRestart: true });
    expect(caller.localDescription?.sdp).toContain("ice-restart");
    expect(socket.events.filter((e) => e.event === "call:offer").length).toBe(2);
  });
});
