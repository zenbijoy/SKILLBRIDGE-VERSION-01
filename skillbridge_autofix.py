#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd()

REQUIRED = [
    "backend/src/routes/rooms.ts",
    "backend/src/routes/sessions.ts",
    "backend/src/routes/account.ts",
    "backend/src/services/push.ts",
    "frontend/app/(tabs)/discover.tsx",
    "infra/supabase/migrations/001_schema.sql",
    "infra/supabase/migrations/005_rpc_security_hardening.sql",
    "infra/supabase/migrations/006_room_transactions.sql",
    "infra/supabase/migrations/007_phase12_final_fixes.sql",
    "scripts/setup-database.ps1",
]

def die(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr)
    raise SystemExit(1)

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, value: str):
    (ROOT / path).write_text(value, encoding="utf-8")

def git_repo() -> bool:
    try:
        p = subprocess.run(
            ["git","rev-parse","--is-inside-work-tree"],
            cwd=ROOT, text=True, capture_output=True
        )
        return p.returncode == 0 and p.stdout.strip() == "true"
    except Exception:
        return False

parser = argparse.ArgumentParser()
parser.add_argument("--allow-dirty", action="store_true")
parser.add_argument("--no-backup", action="store_true")
args = parser.parse_args()

for p in REQUIRED:
    if not (ROOT / p).exists():
        die(f"Run from SkillBridge repository root. Missing {p}")

if git_repo() and not args.allow_dirty:
    p = subprocess.run(["git","status","--porcelain"], cwd=ROOT, text=True, capture_output=True)
    if p.stdout.strip():
        die("Git working tree is dirty. Commit/stash first or use --allow-dirty.")

stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
backup_root = ROOT / ".skillbridge-backup" / stamp
changed = []

def backup(path: str):
    if args.no_backup:
        return
    src = ROOT / path
    if not src.exists():
        return
    dst = backup_root / path
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

def replace_exact(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        die(f"{label}: expected exactly one source match, got {count}")
    return text.replace(old,new,1)

def patch(path: str, func):
    before = read(path)
    after = func(before)
    if after == before:
        print(f"[SKIP] {path}")
        return
    backup(path)
    write(path, after)
    changed.append(path)
    print(f"[FIX]  {path}")

# 1) Add rooms.rules to fresh base schema.
def fix_001(text: str):
    if "rules text not null default ''" in text:
        return text
    old = "title text not null, description text not null default '', topic text not null, tags text[] not null default '{}',"
    new = "title text not null, description text not null default '', topic text not null, rules text not null default '', tags text[] not null default '{}',"
    return replace_exact(text,old,new,"001_schema rooms.rules")
patch("infra/supabase/migrations/001_schema.sql", fix_001)

# 2) Fix exact PostgreSQL function signature in 005.
def fix_005(text: str):
    text = text.replace(
        "REVOKE EXECUTE ON FUNCTION public.recompute_reputation() FROM PUBLIC, anon, authenticated;",
        "REVOKE EXECUTE ON FUNCTION public.recompute_reputation(uuid) FROM PUBLIC, anon, authenticated;"
    )
    text = text.replace(
        "GRANT EXECUTE ON FUNCTION public.recompute_reputation() TO service_role;",
        "GRANT EXECUTE ON FUNCTION public.recompute_reputation(uuid) TO service_role;"
    )
    return text
patch("infra/supabase/migrations/005_rpc_security_hardening.sql", fix_005)

ROOM_RPC = """CREATE OR REPLACE FUNCTION public.create_room_atomic(
    p_title text,
    p_description text,
    p_topic text,
    p_visibility text,
    p_mode text,
    p_capacity int,
    p_rules text,
    p_tags text[],
    p_campus_location text,
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation_id uuid;
    v_room_id uuid;
BEGIN
    IF p_visibility NOT IN ('public','private','invite_only') THEN
        RAISE EXCEPTION 'Invalid room visibility';
    END IF;

    IF p_mode NOT IN ('online','offline','hybrid') THEN
        RAISE EXCEPTION 'Invalid room mode';
    END IF;

    IF p_capacity < 2 OR p_capacity > 250 THEN
        RAISE EXCEPTION 'Invalid room capacity';
    END IF;

    INSERT INTO public.conversations (kind, title, created_by)
    VALUES ('room', p_title, p_owner_id)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.rooms (
        title, description, topic, visibility, mode, capacity, rules, tags,
        campus_location, owner_id, conversation_id, member_count
    )
    VALUES (
        p_title, p_description, p_topic, p_visibility, p_mode, p_capacity,
        COALESCE(p_rules, ''), COALESCE(p_tags, '{}'), p_campus_location,
        p_owner_id, v_conversation_id, 1
    )
    RETURNING id INTO v_room_id;

    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, p_owner_id, 'owner');

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conversation_id, p_owner_id, 'owner');

    RETURN v_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_room_atomic(
    text, text, text, text, text, int, text, text[], text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_room_atomic(
    text, text, text, text, text, int, text, text[], text, uuid
) TO service_role;"""

def fix_room_rpc(text: str, label: str):
    pattern = (
        r"CREATE OR REPLACE FUNCTION public\.create_room_atomic\([\s\S]*?"
        r"GRANT EXECUTE ON FUNCTION public\.create_room_atomic\([^;]+;\s*"
    )
    out,count = re.subn(pattern, ROOM_RPC+"\n", text, count=1)
    if count != 1:
        die(f"{label}: expected exactly one create_room_atomic block, got {count}")
    return out

patch("infra/supabase/migrations/006_room_transactions.sql",
      lambda t: fix_room_rpc(t,"006_room_transactions"))
patch("infra/supabase/migrations/007_phase12_final_fixes.sql",
      lambda t: fix_room_rpc(t,"007_phase12_final_fixes"))

# 3) Fix backend room RPC arguments.
def fix_rooms_ts(text: str):
    if "p_topic: body.topic" in text:
        return text
    old = """      p_title: body.title,
      p_description: body.description,
      p_visibility: body.visibility,
      p_capacity: body.capacity,
      p_rules: body.rules,
      p_tags: body.tags,
      p_owner_id: req.userId!,"""
    new = """      p_title: body.title,
      p_description: body.description,
      p_topic: body.topic,
      p_visibility: body.visibility,
      p_mode: body.mode,
      p_capacity: body.capacity,
      p_rules: body.rules,
      p_tags: body.tags,
      p_campus_location: body.campus_location ?? null,
      p_owner_id: req.userId!,"""
    return replace_exact(text,old,new,"backend rooms RPC args")
patch("backend/src/routes/rooms.ts", fix_rooms_ts)

# 4) Canonicalize session state and stop self-attendance marking.
def fix_sessions_ts(text: str):
    text = text.replace(
        'status: z.enum(["confirmed", "declined", "attended", "missed"]),',
        'status: z.enum(["confirmed", "declined"]),'
    )
    text = text.replace(
        """          attendance_status: ["attended", "missed"].includes(status)
            ? status
            : null,""",
        "          attendance_status: null,"
    )
    text = text.replace(
        'z.enum(["scheduled", "in_progress", "completed", "cancelled"])',
        'z.enum(["scheduled", "live", "completed", "cancelled"])'
    )
    text = text.replace(
        '"scheduled": ["in_progress", "cancelled"]',
        '"scheduled": ["live", "cancelled"]'
    )
    text = text.replace(
        '"in_progress": ["completed"]',
        '"live": ["completed"]'
    )
    return text
patch("backend/src/routes/sessions.ts", fix_sessions_ts)

# 5) Correct voluntary account deactivation.
def fix_account_ts(text: str):
    text = text.replace(
        '.update({ account_status: "suspended" })',
        '.update({ account_status: "deactivated" })',
        1
    )

    filtered = []
    for line in text.splitlines():
        if "ban_duration" in line:
            continue
        if "We could also ban the user" in line:
            continue
        filtered.append(line)
    text = "\n".join(filtered)+"\n"

    if '"/reactivate"' not in text:
        marker = 'account.get(\n  "/blocks",'
        if marker not in text:
            die("account.ts: could not locate insertion point for reactivate")
        reactivate = """account.patch(
  "/reactivate",
  wrap(async (req, res) => {
    const uid = req.userId!;
    const { error } = await admin
      .from("profiles")
      .update({ account_status: "active" })
      .eq("id", uid)
      .eq("account_status", "deactivated");
    if (error) throw error;
    res.json({ success: true });
  }),
);

"""
        text = text.replace(marker,reactivate+marker,1)
    return text
patch("backend/src/routes/account.ts", fix_account_ts)

# 6) Consolidate old push helper into the canonical PushService.
PUSH_WRAPPER = """import { admin } from "../lib/db.js";
import { PushService } from "./PushService.js";

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  kind = "general",
  data: Record<string, string> = {},
) {
  const { error } = await admin
    .from("notifications")
    .insert({ user_id: userId, title, body, kind, data });

  if (error) throw error;

  await PushService.sendNotification(userId, {
    title,
    body,
    data,
  });
}
"""
patch("backend/src/services/push.ts", lambda _text: PUSH_WRAPPER)

# 7) Make Discover filters actually interactive.
def fix_discover_ts(text: str):
    if "setKind" in text and "onPress={() => setKind" in text:
        return text
    text = text.replace(
        'import { useState } from "react";',
        'import { useState } from "react";\nimport { Pressable } from "react-native";'
    )
    text = text.replace(
        'const [kind] = useState<"people" | "rooms" | "clubs" | "posts">("people");',
        'const [kind, setKind] = useState<"all" | "people" | "rooms" | "events" | "skills">("all");'
    )
    old = """        {["all", "people", "rooms", "events", "skills"].map((x) => (
          <Pill key={x} tone={kind === x ? "accent" : "default"}>
            {x}
          </Pill>
        ))}"""
    new = """        {(["all", "people", "rooms", "events", "skills"] as const).map((x) => (
          <Pressable key={x} onPress={() => setKind(x)}>
            <Pill tone={kind === x ? "accent" : "default"}>
              {x}
            </Pill>
          </Pressable>
        ))}"""
    return replace_exact(text,old,new,"discover filters")
patch("frontend/app/(tabs)/discover.tsx", fix_discover_ts)

# 8) Add new security/consistency backstop migration.
m10 = ROOT/"infra/supabase/migrations/010_critical_security_consistency.sql"
if not m10.exists():
    m10.write_text("""-- 010_critical_security_consistency.sql

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS rules text NOT NULL DEFAULT '';

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (
  full_name,
  username,
  avatar_url,
  bio,
  university,
  department,
  batch,
  research_interests,
  profile_visibility,
  updated_at
) ON TABLE public.profiles TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS livekit_attendance_one_open_segment
ON public.livekit_attendance(session_id,user_id)
WHERE left_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_livekit_join(
  p_session_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  INSERT INTO public.livekit_attendance(session_id,user_id,joined_at)
  SELECT p_session_id,p_user_id,now()
  WHERE NOT EXISTS(
    SELECT 1 FROM public.livekit_attendance
    WHERE session_id=p_session_id
      AND user_id=p_user_id
      AND left_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_livekit_leave(
  p_session_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_id uuid;
  v_joined timestamptz;
BEGIN
  SELECT id,joined_at INTO v_id,v_joined
  FROM public.livekit_attendance
  WHERE session_id=p_session_id
    AND user_id=p_user_id
    AND left_at IS NULL
  ORDER BY joined_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN RETURN; END IF;

  UPDATE public.livekit_attendance
  SET left_at=now(),
      duration_seconds=GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM(now()-v_joined)))::int
      )
  WHERE id=v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_livekit_join(uuid,uuid)
FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_livekit_leave(uuid,uuid)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.record_livekit_join(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_livekit_leave(uuid,uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.message_delivery_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(message_id,user_id)
);

ALTER TABLE public.message_delivery_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_delivery_receipts_self_read
ON public.message_delivery_receipts;

CREATE POLICY message_delivery_receipts_self_read
ON public.message_delivery_receipts
FOR SELECT
USING(user_id=auth.uid());

REVOKE INSERT,UPDATE,DELETE
ON TABLE public.message_delivery_receipts
FROM anon,authenticated;
""", encoding="utf-8")
    changed.append(str(m10.relative_to(ROOT)))
    print("[ADD]  infra/supabase/migrations/010_critical_security_consistency.sql")

# 9) Update migration order.
order_path = ROOT/"docs/MIGRATION_ORDER.md"
if order_path.exists():
    text = order_path.read_text(encoding="utf-8")
    if "010_critical_security_consistency.sql" not in text:
        backup("docs/MIGRATION_ORDER.md")
        text = text.rstrip()+"\n12. `010_critical_security_consistency.sql` - Critical security and consistency backstop.\n"
        order_path.write_text(text,encoding="utf-8")
        changed.append("docs/MIGRATION_ORDER.md")
        print("[FIX]  docs/MIGRATION_ORDER.md")

# 10) Rewrite stale DB setup with explicit history/checksums.
DB_SETUP = """param(
  [switch]$AllowProduction,
  [switch]$AllowChecksumMismatch
)

$ErrorActionPreference = "Stop"
Write-Host "=== SKILLBRIDGE DATABASE SETUP ===" -ForegroundColor Cyan

if (-not $env:DATABASE_URL) {
  Write-Host "[ERROR] DATABASE_URL is required." -ForegroundColor Red
  exit 1
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] psql is required." -ForegroundColor Red
  exit 1
}

if (($env:NODE_ENV -eq "production" -or $env:APP_ENV -eq "production") -and
    -not $AllowProduction -and
    $env:ALLOW_PRODUCTION_MIGRATION -ne "true") {
  Write-Host "[ERROR] Refusing production migration without explicit approval." -ForegroundColor Red
  exit 1
}

$migrations = @(
  "001_schema.sql",
  "002_functions_rls.sql",
  "003_research.sql",
  "003_seed.sql",
  "004_hardening.sql",
  "004_transactions.sql",
  "005_rpc_security_hardening.sql",
  "006_room_transactions.sql",
  "007_phase12_final_fixes.sql",
  "008_phase_2_realtime.sql",
  "009_phase_2_1_completion.sql",
  "010_critical_security_consistency.sql"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationDir = Join-Path $root "infra\\supabase\\migrations"

& psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -c @"
CREATE SCHEMA IF NOT EXISTS skillbridge_meta;
CREATE TABLE IF NOT EXISTS skillbridge_meta.schema_migrations (
  filename text PRIMARY KEY,
  checksum_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
"@
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

foreach ($file in $migrations) {
  $path = Join-Path $migrationDir $file
  if (-not (Test-Path $path)) {
    Write-Host "[ERROR] Missing migration: $path" -ForegroundColor Red
    exit 1
  }

  $checksum = (Get-FileHash -Algorithm SHA256 $path).Hash.ToLowerInvariant()
  $existing = (& psql $env:DATABASE_URL -tA -v ON_ERROR_STOP=1 -c "SELECT checksum_sha256 FROM skillbridge_meta.schema_migrations WHERE filename='$file';").Trim()

  if ($existing) {
    if ($existing -eq $checksum) {
      Write-Host "[SKIP] $file" -ForegroundColor DarkGray
      continue
    }

    Write-Host "[ERROR] Applied migration changed: $file" -ForegroundColor Red
    if (-not $AllowChecksumMismatch) {
      Write-Host "Create a NEW corrective migration instead." -ForegroundColor Yellow
      exit 1
    }
  }

  Write-Host "[APPLY] $file" -ForegroundColor Green
  & psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -1 -f $path
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -c "INSERT INTO skillbridge_meta.schema_migrations(filename,checksum_sha256) VALUES('$file','$checksum') ON CONFLICT(filename) DO UPDATE SET checksum_sha256=EXCLUDED.checksum_sha256, applied_at=now();"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "[PASS] Migration chain applied." -ForegroundColor Green
"""
patch("scripts/setup-database.ps1", lambda _text: DB_SETUP)

# 11) Remove stale lint artifact.
lint = ROOT/"frontend/lint_out.txt"
if lint.exists():
    backup("frontend/lint_out.txt")
    lint.unlink()
    changed.append("frontend/lint_out.txt (removed)")
    print("[DEL]  frontend/lint_out.txt")

report = ROOT/"docs/AUTOFIX_CRITICAL_FOUNDATION.md"
report.write_text(
    "# SkillBridge Critical Autofix\n\n"
    f"Generated: {dt.datetime.now().isoformat()}\n\n"
    "This script applies deterministic critical fixes only. "
    "It does NOT implement the full admin dashboard, RBAC, receipt worker, "
    "event transactions, complete LiveKit attendance wiring, or product expansion. "
    "Continue with SKILLBRIDGE_MASTER_FIX_ANTIGRAVITY.txt.\n\n"
    "## Changed\n\n" + "\n".join(f"- {x}" for x in changed) + "\n",
    encoding="utf-8"
)
changed.append("docs/AUTOFIX_CRITICAL_FOUNDATION.md")

print("\n=== AUTOFIX COMPLETE ===")
for item in changed:
    print(" -",item)

if git_repo():
    p = subprocess.run(["git","diff","--stat"],cwd=ROOT,text=True,capture_output=True)
    print("\nGit diff summary:\n"+p.stdout)

print("\nREVIEW BEFORE COMMIT:")
print("  git diff --check")
print("  git diff")
print("\nThen validate and use SKILLBRIDGE_MASTER_FIX_ANTIGRAVITY.txt.")
