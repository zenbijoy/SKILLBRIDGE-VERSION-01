import http from "node:http";
import { Server as SocketServer } from "socket.io";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { setupSocket, userConnections } from "./socket.js";
import { startPushWorker } from "./workers/pushWorker.js";

const origins = env.WEB_ORIGINS.split(",").map((x) => x.trim());

const server = http.createServer();
const io = new SocketServer(server, {
  cors: { origin: origins, credentials: true },
});

const app = createApp(io);
// Mount app handler on http server
server.on("request", app);

setupSocket(io);

export { app, server, io, userConnections };

if (process.argv[1] === new URL(import.meta.url).pathname || process.env.NODE_ENV !== "test") {
  server.listen(env.PORT, () => {
    console.log(`SkillBridge API listening on :${env.PORT}`);
  });

  startPushWorker();
}
