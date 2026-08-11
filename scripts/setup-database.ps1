param(
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
  "010_critical_security_consistency.sql", "011_product_features.sql"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationDir = Join-Path $root "infra\supabase\migrations"

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
