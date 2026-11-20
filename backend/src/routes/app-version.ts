import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { admin } from "../lib/db.js";

export const appVersionRouter = Router();

const CURRENT_APP_VERSION = "2.1.0";
const CURRENT_VERSION_CODE = 12;
const APK_FILE_SIZE_BYTES = 67056905;
const APK_FILE_SIZE_FORMATTED = "64.0 MB";
const APK_SHA256 = "4B3949DE15E6C57CF34BE554280D9DEFBC26BFD450B7CB4F29B5947BAF42CEE2";
const APK_FILENAME = "SkillBridge.apk";

// Candidate paths for finding the release APK on VPS or local
const CANDIDATE_APK_PATHS = [
  path.resolve(process.cwd(), "release-apk", APK_FILENAME),
  path.resolve(process.cwd(), "..", "release-apk", APK_FILENAME),
  path.resolve(process.cwd(), APK_FILENAME),
  path.resolve(process.cwd(), "..", APK_FILENAME),
  "/opt/skillbridge/release-apk/SkillBridge.apk",
  "/opt/skillbridge/SkillBridge.apk",
];

function resolveLocalApk(): string | null {
  for (const candidate of CANDIDATE_APK_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// GET /api/v1/app/version (Public, no auth)
appVersionRouter.get("/version", async (_req, res) => {
  try {
    const { data: config } = await admin
      .from("app_version_control")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    const apkPath = resolveLocalApk();
    let fileSizeBytes = APK_FILE_SIZE_BYTES;
    if (apkPath) {
      try {
        const stats = fs.statSync(apkPath);
        fileSizeBytes = stats.size;
      } catch {
        // fallback
      }
    }

    res.json({
      success: true,
      current_version: config?.recommended_version || CURRENT_APP_VERSION,
      version: config?.recommended_version || CURRENT_APP_VERSION,
      version_code: CURRENT_VERSION_CODE,
      min_supported_version: config?.min_supported_version || "2.0.0",
      recommended_version: config?.recommended_version || CURRENT_APP_VERSION,
      maintenance_mode: Boolean(config?.maintenance_mode),
      maintenance_message: config?.maintenance_message || "SkillBridge is operating normally.",
      update_prompt_enabled: config?.update_prompt_enabled ?? true,
      update_title: config?.update_title || `SkillBridge v${CURRENT_APP_VERSION} Available`,
      update_message:
        config?.update_message ||
        "A brand new update is available with Live Video & Audio sessions, Study Vault, Routine Sync, and performance improvements.",
      download_url:
        config?.store_url_android ||
        "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/releases/SkillBridge.apk",
      direct_apk_url: "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/releases/SkillBridge.apk",
      cdn_apk_url: "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/releases/SkillBridge.apk",
      vps_apk_url: "https://skillbridgeapk.duckdns.org/download/SkillBridge.apk",
      showcase_url: "https://skillbridgeapk.duckdns.org",
      web_app_url: "https://ruetskillbridgeweb.duckdns.org",
      admin_url: "https://ruetskillbridgeadmin.duckdns.org",
      apk: {
        filename: APK_FILENAME,
        file_size_bytes: fileSizeBytes,
        file_size_formatted: APK_FILE_SIZE_FORMATTED,
        sha256: APK_SHA256,
        min_android_version: "Android 8.0+ (API 26+)",
        architectures: ["arm64-v8a", "armeabi-v7a", "x86_64"],
      },
      dev_apk: {
        filename: "SkillBridge-DevClient-debug.apk",
        download_url: "https://skillbridgeapk.duckdns.org/download/SkillBridge-DevClient-debug.apk",
        direct_apk_url: "https://skillbridgeapk.duckdns.org/download/SkillBridge-DevClient-debug.apk",
        title: "Developer Client APK",
        description: "Includes Hot Reload & Metro dev tools for campus developers and contributors",
      },
      release_notes: [
        "Interactive Live Study Rooms with WebRTC and LiveKit Audio/Video",
        "Central Academic Study Vault with instant PDF search and category filters",
        "Smart Routine Extractor & Class Calendar integration",
        "Encrypted Peer-to-Peer Calls with background push notifications",
        "Gamified Quizzes, streaks, and university leaderboards",
        "Automatic In-App Update detection and 1-tap download"
      ],
      published_at: "2026-11-20T11:00:00Z",
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve app version metadata",
      fallback_version: CURRENT_APP_VERSION,
      download_url: "https://ruetskillbridgeweb.duckdns.org/download/SkillBridge.apk",
    });
  }
});

// GET /api/v1/app/download (Direct APK download endpoint)
appVersionRouter.get("/download", (_req, res) => {
  const localApk = resolveLocalApk();
  if (localApk) {
    res.setHeader("Content-Disposition", `attachment; filename="${APK_FILENAME}"`);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    return res.sendFile(localApk);
  }

  // High-speed Cloudflare R2 CDN download
  return res.redirect(302, "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/releases/SkillBridge.apk");
});
