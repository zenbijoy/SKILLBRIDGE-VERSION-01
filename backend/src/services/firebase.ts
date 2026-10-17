import { initializeApp, cert, type App, getApps } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { logger } from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseApp: App | null = null;
let messagingInstance: Messaging | null = null;

export function initializeFirebase(): { app: App | null; messaging: Messaging | null } {
  if (firebaseApp && messagingInstance) {
    return { app: firebaseApp, messaging: messagingInstance };
  }

  try {
    const credPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      path.resolve(__dirname, "../../firebase-service-account.json");

    if (!fs.existsSync(credPath)) {
      logger.warn(
        { credPath, fcmActive: false, expoActive: true },
        "Firebase service account credentials file not found, FCM push provider inactive (Expo push provider active)",
      );
      return { app: null, messaging: null };
    }

    const raw = fs.readFileSync(credPath, "utf-8");
    const serviceAccount = JSON.parse(raw);

    const apps = getApps();
    if (apps.length > 0 && apps[0]) {
      firebaseApp = apps[0];
    } else {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || "skillbridge-7cb48",
      });
    }

    messagingInstance = getMessaging(firebaseApp);
    logger.info(
      {
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        fcmActive: true,
        expoActive: true,
      },
      "Firebase Admin & Cloud Messaging (FCM) initialized successfully (Dual FCM + Expo push active)",
    );

    return { app: firebaseApp, messaging: messagingInstance };
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err, fcmActive: false, expoActive: true },
      "Failed to initialize Firebase Admin SDK, continuing with Expo push only",
    );
    return { app: null, messaging: null };
  }
}

export function getFirebaseMessaging(): Messaging | null {
  if (!messagingInstance) {
    initializeFirebase();
  }
  return messagingInstance;
}
