# ==============================================================================
# SkillBridge - Build Native Development Client for Physical Android Device
# ==============================================================================
# Workflow:
#   1. Validates Java JDK and Android SDK
#   2. Locates connected physical device (rejects emulators)
#   3. Uses virtual drive mapping (S:) to bypass Windows 260-char MAX_PATH limit in Ninja/CMake
#   4. Runs `npx expo run:android --device` to build and install the debug APK
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  SkillBridge - Native Dev Client Build Script     " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Locate Java and Android SDK
if (-not $env:JAVA_HOME) {
    $jbrPath = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $jbrPath) {
        $env:JAVA_HOME = $jbrPath
        $env:Path = "$jbrPath\bin;" + $env:Path
        Write-Host "[+] JAVA_HOME set to: $jbrPath" -ForegroundColor Green
    }
}

if (-not $env:ANDROID_HOME) {
    $androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $androidSdk) {
        $env:ANDROID_HOME = $androidSdk
        $env:Path = "$androidSdk\platform-tools;" + $env:Path
        Write-Host "[+] ANDROID_HOME set to: $androidSdk" -ForegroundColor Green
    }
}

# 2. Locate ADB and find physical device
$adbCmd = "adb"
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    $platformTools = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools"
    $candidate = Join-Path $platformTools "adb.exe"
    if (Test-Path $candidate) {
        $env:Path = "$platformTools;" + $env:Path
        $adbCmd = $candidate
    }
}

$deviceLines = & $adbCmd devices -l | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of devices" }
$physicalDevices = @()
foreach ($line in $deviceLines) {
    $parts = -split $line
    $serial = $parts[0]
    if ($serial -notlike "emulator-*") {
        $physicalDevices += $serial
    }
}

if ($physicalDevices.Count -eq 0) {
    Write-Host "[-] No physical Android device connected. Please connect your phone via USB." -ForegroundColor Red
    exit 1
}

$targetSerial = $physicalDevices[0]
$model = (& $adbCmd -s $targetSerial shell getprop ro.product.model).Trim()
Write-Host "[+] Target physical device: $model ($targetSerial)" -ForegroundColor Green

# 3. Setup Virtual Drive S: to prevent Windows 260 character path limit in CMake / Ninja
$frontendDir = (Resolve-Path (Join-Path $PSScriptRoot "..\frontend")).Path
$buildDir = $frontendDir

try {
    # Check if S: drive is already mapped to frontend
    $existingS = Get-PSDrive S -ErrorAction SilentlyContinue
    if (-not $existingS) {
        Write-Host "[*] Mapping virtual drive S: -> $frontendDir (to avoid CMake MAX_PATH limit)..." -ForegroundColor Yellow
        subst S: "$frontendDir"
    }
    if (Test-Path "S:\package.json") {
        $buildDir = "S:\"
    }
} catch {
    Write-Host "[-] Could not map virtual drive S:, using default directory." -ForegroundColor Yellow
}

Set-Location $buildDir

# Clean old .cxx cache if path changed
$cxxDir = Join-Path $frontendDir "android\app\.cxx"
if (Test-Path $cxxDir) {
    Write-Host "[*] Refreshing CMake build cache in .cxx..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $cxxDir -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "[*] Initiating native build for $model..." -ForegroundColor Yellow
Write-Host "    Working directory: $buildDir" -ForegroundColor DarkGray
Write-Host "    Command: npx expo run:android --device $model --no-bundler" -ForegroundColor DarkGray
Write-Host ""

& npx expo run:android --device $model --no-bundler

