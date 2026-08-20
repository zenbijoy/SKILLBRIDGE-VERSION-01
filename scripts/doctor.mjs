#!/usr/bin/env node
/**
 * SkillBridge V3 Production Health & Diagnostic Pre-flight
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

console.log("\n🔍 Starting SkillBridge Production Pre-flight Diagnostic...\n");

const checks = [];

function check(title, fn) {
  try {
    fn();
    checks.push({ title, status: "PASS" });
    console.log(`  ✅ [PASS] ${title}`);
  } catch (err) {
    checks.push({ title, status: "FAIL", error: err.message });
    console.log(`  ❌ [FAIL] ${title} — ${err.message}`);
  }
}

// 1. Node.js version
check("Node.js Runtime Version >= 20", () => {
  const v = parseInt(process.versions.node.split(".")[0], 10);
  if (v < 20) throw new Error(`Found Node v${process.version}, requires >= 20`);
});

// 2. Directory Structure
check("Required Directories Exist", () => {
  const dirs = ["backend", "frontend", "admin", "infra/supabase"];
  for (const d of dirs) {
    if (!fs.existsSync(path.resolve(d))) throw new Error(`Missing ${d}`);
  }
});

// 3. Env Examples
check("Environment Templates Exist", () => {
  const envFiles = [
    "backend/.env.example",
    "frontend/.env.example",
    "admin/.env.example",
  ];
  for (const f of envFiles) {
    if (!fs.existsSync(path.resolve(f))) throw new Error(`Missing ${f}`);
  }
});

// 4. Git Ignore Protection
check("Security: .gitignore Protects Production Secrets", () => {
  const gitignore = fs.readFileSync(path.resolve(".gitignore"), "utf8");
  if (!gitignore.includes(".env")) throw new Error(".gitignore does not ignore .env files!");
});

// 5. Backend Typescript
check("Backend Typecheck Verification", () => {
  execSync("npx tsc --noEmit", { cwd: path.resolve("backend"), stdio: "pipe" });
});

// 6. Frontend Typescript
check("Frontend Typecheck Verification", () => {
  execSync("npx tsc --noEmit", { cwd: path.resolve("frontend"), stdio: "pipe" });
});

// 7. Admin Build
check("Admin Control Plane Build Verification", () => {
  execSync("npx vite build", { cwd: path.resolve("admin"), stdio: "pipe" });
});

const failed = checks.filter((c) => c.status === "FAIL");

console.log("\n" + "=".repeat(60));
if (failed.length === 0) {
  console.log(`🎉 ALL ${checks.length} PRODUCTION PRE-FLIGHT CHECKS PASSED! SkillBridge is ready for deployment.`);
} else {
  console.log(`⚠️ ${failed.length} / ${checks.length} CHECKS FAILED.`);
  process.exit(1);
}
console.log("=" .repeat(60) + "\n");
