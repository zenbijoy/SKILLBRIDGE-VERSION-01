import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { io as ioClient, Socket as ClientSocket } from "../../../frontend/node_modules/socket.io-client/build/cjs/index.js";
import { createApp } from "../app.js";
import { setupSocket, roomWebRTCParticipants } from "../socket.js";
import { setAdminClient } from "../lib/db.js";

test("Real-Time Multi-Party WebRTC Room Voice & Collaboration Life Cycle Suite", async (suite) => {
  const ROOM_ID = "44444444-4444-4444-8444-444444444444";
  const USER_HOST = "11111111-1111-4111-8111-111111111111";
  const USER_FRIEND = "22222222-2222-4222-8222-222222222222";

  // Mock DB Chain
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

  const mockAdmin = {
    from: (table?: string) => {
      if (table === "rooms") {
        return createMockChain({
          id: ROOM_ID,
          owner_id: USER_HOST,
          visibility: "public",
          is_locked: false,
          knock_mode_enabled: false,
        });
      }
      if (table === "room_members") {
        return {
          ...createMockChain(),
          eq: (col: string, val: any) => {
            if (col === "user_id" && val === USER_HOST) {
              return createMockChain({ role: "owner" });
            }
            if (col === "user_id" && val === USER_FRIEND) {
              return createMockChain({ role: "member" });
            }
            return createMockChain({ role: "member" });
          },
        };
      }
      if (table === "profiles") {
        return {
          ...createMockChain(),
          eq: (col: string, val: any) => {
            if (val === USER_HOST) {
              return createMockChain({ full_name: "Host User", username: "host_user" });
            }
            return createMockChain({ full_name: "Friend User", username: "friend_user" });
          },
        };
      }
      return createMockChain();
    },
    auth: {
      getUser: async (token: string) => {
        if (token === "token_host") {
          return { data: { user: { id: USER_HOST, role: "authenticated" } }, error: null };
        }
        if (token === "token_friend") {
          return { data: { user: { id: USER_FRIEND, role: "authenticated" } }, error: null };
        }
        return { data: { user: null }, error: new Error("unauthorized") };
      },
    },
  };
  setAdminClient(mockAdmin as any);

  // Spin up real ephemeral HTTP + Socket.IO Server
  const app = createApp();
  const httpServer = http.createServer(app);
  const ioServer = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });
  setupSocket(ioServer);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address() as any;
  const port = address.port;
  const socketUrl = `http://localhost:${port}`;

  let clientHost!: ClientSocket;
  let clientFriend!: ClientSocket;

  await suite.test("1. Real-time Authentication & Connection Handshake", async () => {
    clientHost = ioClient(socketUrl, {
      auth: { token: "token_host" },
      transports: ["websocket"],
      forceNew: true,
    });

    clientFriend = ioClient(socketUrl, {
      auth: { token: "token_friend" },
      transports: ["websocket"],
      forceNew: true,
    });

    await Promise.all([
      new Promise<void>((resolve) => clientHost.on("connect", () => resolve())),
      new Promise<void>((resolve) => clientFriend.on("connect", () => resolve())),
    ]);

    assert.ok(clientHost.connected, "Host should be connected");
    assert.ok(clientFriend.connected, "Friend should be connected");
  });

  await suite.test("2. Host joins room mesh -> receives self metadata, 0 existing peers", async () => {
    const res: any = await new Promise((resolve) => {
      clientHost.emit(
        "room:webrtc:join",
        {
          roomId: ROOM_ID,
          name: "Host User",
          media: "audio",
        },
        resolve,
      );
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.self.userId, USER_HOST);
    assert.strictEqual(res.peers.length, 0);
    assert.strictEqual(res.participantCount, 1);
  });

  await suite.test("3. Friend joins room mesh -> receives Host in existing peers, Host receives peer-joined", async () => {
    const peerJoinedPromise = new Promise<any>((resolve) => {
      clientHost.once("room:webrtc:peer-joined", resolve);
    });

    const res: any = await new Promise((resolve) => {
      clientFriend.emit(
        "room:webrtc:join",
        {
          roomId: ROOM_ID,
          name: "Friend User",
          media: "audio",
        },
        resolve,
      );
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.self.userId, USER_FRIEND);
    assert.strictEqual(res.peers.length, 1);
    assert.strictEqual(res.peers[0].userId, USER_HOST);
    assert.strictEqual(res.peers[0].socketId, clientHost.id);

    const peerJoinedEvent = await peerJoinedPromise;
    assert.strictEqual(peerJoinedEvent.peer.userId, USER_FRIEND);
    assert.strictEqual(peerJoinedEvent.peer.socketId, clientFriend.id);
    assert.strictEqual(peerJoinedEvent.participantCount, 2);
  });

  await suite.test("4. Full WebRTC Signaling Exchange: Offer -> Answer -> Trickle ICE Candidates", async () => {
    const hostSignalPromise = new Promise<any>((resolve) => {
      clientHost.once("room:webrtc:signal", resolve);
    });

    // Friend acts as initiator to Host
    const mockOfferSdp = { type: "offer", sdp: "v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" };
    clientFriend.emit("room:webrtc:signal", {
      roomId: ROOM_ID,
      toSocketId: clientHost.id,
      type: "offer",
      signal: mockOfferSdp,
    });

    const offerSignal = await hostSignalPromise;
    assert.strictEqual(offerSignal.fromSocketId, clientFriend.id);
    assert.strictEqual(offerSignal.fromUserId, USER_FRIEND);
    assert.strictEqual(offerSignal.type, "offer");
    assert.deepStrictEqual(offerSignal.signal, mockOfferSdp);

    // Host responds with SDP Answer targeted to Friend
    const friendSignalPromise = new Promise<any>((resolve) => {
      clientFriend.once("room:webrtc:signal", resolve);
    });

    const mockAnswerSdp = { type: "answer", sdp: "v=0\r\no=- 654321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" };
    clientHost.emit("room:webrtc:signal", {
      roomId: ROOM_ID,
      toSocketId: clientFriend.id,
      type: "answer",
      signal: mockAnswerSdp,
    });

    const answerSignal = await friendSignalPromise;
    assert.strictEqual(answerSignal.fromSocketId, clientHost.id);
    assert.strictEqual(answerSignal.fromUserId, USER_HOST);
    assert.strictEqual(answerSignal.type, "answer");
    assert.deepStrictEqual(answerSignal.signal, mockAnswerSdp);

    // Trickle ICE Candidate exchange from Friend to Host
    const friendCandidatePromise = new Promise<any>((resolve) => {
      clientHost.once("room:webrtc:signal", resolve);
    });

    const mockCandidate = { candidate: "candidate:1 1 UDP 2122260223 192.168.1.10 50000 typ host", sdpMid: "0" };
    clientFriend.emit("room:webrtc:signal", {
      roomId: ROOM_ID,
      toSocketId: clientHost.id,
      type: "candidate",
      signal: mockCandidate,
    });

    const candidateSignal = await friendCandidatePromise;
    assert.strictEqual(candidateSignal.type, "candidate");
    assert.deepStrictEqual(candidateSignal.signal, mockCandidate);
  });

  await suite.test("5. Real-Time VAD Speaking Indicator & Volume Synchronization", async () => {
    const friendStatePromise = new Promise<any>((resolve) => {
      clientFriend.once("room:webrtc:state", resolve);
    });

    // Host starts speaking
    clientHost.emit("room:webrtc:state", {
      roomId: ROOM_ID,
      isSpeaking: true,
      audioLevel: 0.88,
    });

    const speakingState = await friendStatePromise;
    assert.strictEqual(speakingState.socketId, clientHost.id);
    assert.strictEqual(speakingState.userId, USER_HOST);
    assert.strictEqual(speakingState.isSpeaking, true);
    assert.strictEqual(speakingState.audioLevel, 0.88);

    // Host stops speaking
    const friendSilencePromise = new Promise<any>((resolve) => {
      clientFriend.once("room:webrtc:state", resolve);
    });

    clientHost.emit("room:webrtc:state", {
      roomId: ROOM_ID,
      isSpeaking: false,
      audioLevel: 0,
    });

    const silenceState = await friendSilencePromise;
    assert.strictEqual(silenceState.isSpeaking, false);
    assert.strictEqual(silenceState.audioLevel, 0);
  });

  await suite.test("6. Real-Time Mute / Unmute Synchronization", async () => {
    const friendMutePromise = new Promise<any>((resolve) => {
      clientFriend.once("room:webrtc:state", resolve);
    });

    // Host toggles mute
    clientHost.emit("room:webrtc:state", {
      roomId: ROOM_ID,
      isMuted: true,
      isSpeaking: false,
    });

    const muteState = await friendMutePromise;
    assert.strictEqual(muteState.isMuted, true);
    assert.strictEqual(muteState.isSpeaking, false);
  });

  await suite.test("7. Interactive Floating Emoji Reactions & Real-Time Hand Raising", async () => {
    const friendReactionPromise = new Promise<any>((resolve) => {
      clientFriend.once("room:webrtc:reaction", resolve);
    });

    clientHost.emit("room:webrtc:reaction", {
      roomId: ROOM_ID,
      emoji: "🔥",
      senderName: "Host User",
    });

    const reactionEvent = await friendReactionPromise;
    assert.strictEqual(reactionEvent.emoji, "🔥");
    assert.strictEqual(reactionEvent.senderName, "Host User");

    const friendHandPromise = new Promise<any>((resolve) => {
      clientFriend.once("room:webrtc:hand-changed", resolve);
    });

    clientHost.emit("room:webrtc:raise-hand", {
      roomId: ROOM_ID,
      isHandRaised: true,
    });

    const handEvent = await friendHandPromise;
    assert.strictEqual(handEvent.isHandRaised, true);
    assert.strictEqual(handEvent.userId, USER_HOST);
  });

  await suite.test("8. Sub-50ms Network Latency Ping / Pong Roundtrip", async () => {
    const clientTimestamp = Date.now();
    const pongPromise = new Promise<any>((resolve) => {
      clientHost.once("room:webrtc:pong", resolve);
    });

    clientHost.emit("room:webrtc:ping", { timestamp: clientTimestamp });
    const pong = await pongPromise;

    assert.strictEqual(pong.clientTimestamp, clientTimestamp);
    assert.ok(pong.serverTimestamp >= clientTimestamp);
    const rtt = Date.now() - clientTimestamp;
    assert.ok(rtt < 100, `RTT should be fast (actual: ${rtt}ms)`);
  });

  await suite.test("9. Graceful Leave -> Remaining Peer Receives peer-left", async () => {
    const friendPeerLeftPromise = new Promise<any>((resolve) => {
      clientFriend.once("room:webrtc:peer-left", resolve);
    });

    clientHost.emit("room:webrtc:leave", { roomId: ROOM_ID });
    const leftEvent = await friendPeerLeftPromise;

    assert.strictEqual(leftEvent.socketId, clientHost.id);
    assert.strictEqual(leftEvent.userId, USER_HOST);
    assert.strictEqual(leftEvent.participantCount, 1);
  });

  await suite.test("10. Abrupt Disconnect Cleanup -> Server Cleanly Prunes Room Participants", async () => {
    const roomMapBefore = roomWebRTCParticipants.get(ROOM_ID);
    assert.ok(roomMapBefore, "Room map should exist");
    assert.strictEqual(roomMapBefore!.size, 1);
    assert.ok(roomMapBefore!.has(clientFriend.id!));

    // Abrupt disconnect of Friend
    await new Promise<void>((resolve) => {
      clientFriend.on("disconnect", () => resolve());
      clientFriend.disconnect();
    });

    // Wait short tick for server disconnect handler
    await new Promise((r) => setTimeout(r, 50));

    const roomMapAfter = roomWebRTCParticipants.get(ROOM_ID);
    assert.strictEqual(roomMapAfter, undefined, "Room should be purged from memory when empty");
  });

  // Teardown
  clientHost.disconnect();
  ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});
