$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "SkillBridge V2.0.1 Windows setup" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js 22 LTS or newer, then reopen PowerShell."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Reinstall Node.js with npm."
}

Write-Host ("Node: " + (node --version))
Write-Host ("npm:  " + (npm --version))

if (-not (Test-Path "frontend\.env")) {
  Copy-Item "frontend\.env.example" "frontend\.env"
}
if (-not (Test-Path "backend\.env")) {
  Copy-Item "backend\.env.example" "backend\.env"
}

Write-Host "`n[1/2] Installing frontend..." -ForegroundColor Yellow
Push-Location "frontend"
try {
  if (Test-Path "node_modules") { Remove-Item "node_modules" -Recurse -Force }
  if (Test-Path "package-lock.json") { Remove-Item "package-lock.json" -Force }
  npm install --legacy-peer-deps
  if ($LASTEXITCODE -ne 0) { throw "Frontend npm install failed." }

  # npx expo install --fix
  # if ($LASTEXITCODE -ne 0) { throw "Expo dependency alignment failed." }

  npx expo-doctor
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "expo-doctor reported warnings. Setup will continue so you can inspect them."
  }
}
finally {
  Pop-Location
}

Write-Host "`n[2/2] Installing backend..." -ForegroundColor Yellow
Push-Location "backend"
try {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "Backend npm install failed." }
}
finally {
  Pop-Location
}

Write-Host "`nSetup completed." -ForegroundColor Green
Write-Host "Next: edit frontend/.env and backend/.env, configure Supabase, then run START_DEV_WINDOWS.cmd."
