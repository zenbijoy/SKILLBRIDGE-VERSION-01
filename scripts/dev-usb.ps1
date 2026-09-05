# ==============================================================================
# SkillBridge - Daily USB Fast Refresh Launcher (Physical Android Device)
# ==============================================================================
# Workflow:
#   1. Locates ADB from Android SDK platform-tools or PATH
#   2. Detects connected physical Android device (ignoring emulators)
#   3. Establishes ADB Reverse port forwarding (tcp:8081 -> tcp:8081)
#   4. Checks and stops stale Metro instances if necessary
#   5. Launches Expo Development Server targeting localhost + dev-client
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  SkillBridge - USB Metro Fast Refresh Launcher   " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Locate ADB
$adbCmd = "adb"
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    $platformTools = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools"
    $candidate = Join-Path $platformTools "adb.exe"
    if (Test-Path $candidate) {
        $env:Path = "$platformTools;" + $env:Path
        $adbCmd = $candidate
        Write-Host "[+] Found ADB in: $platformTools" -ForegroundColor Green
    } else {
        Write-Error "[-] Could not find adb.exe. Please ensure Android SDK platform-tools is installed."
        exit 1
    }
} else {
    Write-Host "[+] ADB is available in PATH." -ForegroundColor Green
}

# 2. Find connected physical Android device
Write-Host "[*] Checking connected ADB devices..." -ForegroundColor Yellow
$deviceLines = & $adbCmd devices -l | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of devices" }

if (-not $deviceLines) {
    Write-Host "[-] No authorized Android devices found." -ForegroundColor Red
    Write-Host "    Please connect your phone via USB and enable USB Debugging." -ForegroundColor Yellow
    exit 1
}

# Filter out emulators
$physicalDevices = @()
foreach ($line in $deviceLines) {
    $parts = -split $line
    $serial = $parts[0]
    if ($serial -notlike "emulator-*") {
        $physicalDevices += $serial
    }
}

if ($physicalDevices.Count -eq 0) {
    Write-Host "[-] Only emulator devices detected. Please connect a physical Android device." -ForegroundColor Red
    exit 1
}

$targetSerial = $physicalDevices[0]
$model = (& $adbCmd -s $targetSerial shell getprop ro.product.model).Trim()
$mfg = (& $adbCmd -s $targetSerial shell getprop ro.product.manufacturer).Trim()

Write-Host "[+] Selected physical device: $mfg $model ($targetSerial)" -ForegroundColor Green

# 3. Configure USB Port Reverse (8081 for Metro, 5000 for Local Backend)
Write-Host "[*] Configuring USB port reverse (tcp:8081 -> tcp:8081, tcp:5000 -> tcp:5000)..." -ForegroundColor Yellow
& $adbCmd -s $targetSerial reverse tcp:8081 tcp:8081 | Out-Null
& $adbCmd -s $targetSerial reverse tcp:5000 tcp:5000 2>$null | Out-Null

$reverseRules = & $adbCmd -s $targetSerial reverse --list
if ($reverseRules -match "8081") {
    Write-Host "[+] ADB reverse active:" -ForegroundColor Green
    Write-Host "    $reverseRules" -ForegroundColor DarkCyan
} else {
    Write-Host "[-] Warning: Could not verify reverse rule for 8081. Trying removal and retry..." -ForegroundColor Yellow
    & $adbCmd -s $targetSerial reverse --remove tcp:8081 2>$null | Out-Null
    & $adbCmd -s $targetSerial reverse tcp:8081 tcp:8081 | Out-Null
}

# 4. Check if Metro is already running on port 8081
$occupied = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
    Write-Host "[!] Port 8081 is currently in use by PID $($occupied.OwningProcess)." -ForegroundColor Yellow
    Write-Host "    Attempting to clean up stale Metro instance on port 8081..." -ForegroundColor Yellow
    try {
        Stop-Process -Id $occupied.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "[+] Stale process PID $($occupied.OwningProcess) terminated." -ForegroundColor Green
    } catch {
        Write-Host "[-] Could not stop process $($occupied.OwningProcess). Proceeding..." -ForegroundColor Yellow
    }
}

# 5. Start Expo Metro with dev-client and localhost
$frontendDir = Join-Path $PSScriptRoot "..\frontend"
if (-not (Test-Path $frontendDir)) {
    $frontendDir = $PSScriptRoot
}

Set-Location $frontendDir

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  Starting Metro Bundler for Fast Refresh...       " -ForegroundColor Green
Write-Host "  Target: Expo Dev Client (localhost)             " -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""

& npx expo start --dev-client --host lan
