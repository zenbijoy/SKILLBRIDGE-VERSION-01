$ErrorActionPreference = "Stop"

Write-Host "=== SKILLBRIDGE DATABASE SETUP ===" -ForegroundColor Cyan

if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required." -ForegroundColor Red
    Write-Host "Please set them or run this script from a context where they are loaded." -ForegroundColor Yellow
    exit 1
}

Write-Host "Target Database: $env:SUPABASE_URL"

if ($env:SUPABASE_URL -match "supabase\.co" -and $env:ALLOW_PRODUCTION_MIGRATION -ne "true") {
    Write-Host "[ERROR] Detected production Supabase URL. Refusing to run migrations." -ForegroundColor Red
    Write-Host "If you REALLY mean to do this, set ALLOW_PRODUCTION_MIGRATION=true" -ForegroundColor Yellow
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
    "007_phase12_final_fixes.sql"
)

# Extract project ID from URL if using Supabase CLI or just use Postgres connection string if psql is preferred.
# For simplicity without assuming supabase CLI is authenticated, we can assume the user has psql or we just instruct them.
# The prompt asks for a safe script that reads env vars and applies migrations. 
# However, connecting to Supabase programmatically from a script without the Postgres connection string requires either:
# 1) supabase-cli (`supabase db push --db-url ...`)
# 2) psql (`psql $env:DATABASE_URL -f ...`)
# We will check for DATABASE_URL.

if (-not $env:DATABASE_URL) {
    Write-Host "[ERROR] DATABASE_URL (PostgreSQL connection string) is required to run SQL files." -ForegroundColor Red
    Write-Host "Example: postgresql://postgres:password@127.0.0.1:54322/postgres" -ForegroundColor Yellow
    exit 1
}

Write-Host "Executing migrations in explicit order..." -ForegroundColor Cyan

foreach ($file in $migrations) {
    $path = "infra\supabase\migrations\$file"
    if (Test-Path $path) {
        Write-Host "Applying $file ..." -ForegroundColor Green
        # Execute using psql
        psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $path
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed applying $file. Stopping." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[ERROR] Migration file $path not found!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "All migrations applied successfully!" -ForegroundColor Green
