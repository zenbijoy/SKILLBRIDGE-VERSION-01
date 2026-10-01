# ==============================================================================
# SkillBridge - Standalone Small Release APK Builder
# ==============================================================================
# This script builds a standalone production/release APK that:
#   1. Runs completely independently WITHOUT USB, PC, or any terminal command.
#   2. Optimizes file size down to ~28-35MB by compiling specifically for
#      modern 64-bit ARM architecture (arm64-v8a), eliminating 60MB+ of unused binaries.
#   3. Embedded JS bundle & Hermes bytecode inside the APK for instant offline/online launch.
# ==============================================================================

[CmdletBinding()]
param(
    [ValidateSet("arm64-v8a", "armeabi-v7a", "universal")]
    [string]$Arch = "arm64-v8a",
    [switch]$Install,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   SkillBridge - Standalone Small APK Builder      " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Locate Java JDK and Android SDK
if (-not $env:JAVA_HOME) {
    $jbrCandidates = @(
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre"
    )
    foreach ($cand in $jbrCandidates) {
        if (Test-Path $cand) {
            $env:JAVA_HOME = $cand
            $env:Path = "$cand\bin;" + $env:Path
            Write-Host "[+] JAVA_HOME set to: $cand" -ForegroundColor Green
            break
        }
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

# 2. Check frontend/.env for API URL
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $projectRoot "frontend"
$envFile = Join-Path $frontendDir ".env"

if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "EXPO_PUBLIC_API_URL=(.+)") {
        $currentApi = $matches[1].Trim()
        Write-Host "[i] Current Backend API: $currentApi" -ForegroundColor Cyan
        if ($currentApi -match "localhost|127\.0\.0\.1") {
            Write-Host ""
            Write-Host "[!] CAUTION: EXPO_PUBLIC_API_URL is set to '$currentApi'" -ForegroundColor Yellow
            Write-Host "    On testers' phones without USB, 'localhost' points to the phone itself!" -ForegroundColor Yellow
            Write-Host "    For testers, update frontend/.env to your VPS URL (e.g. https://ruetskillbridge.duckdns.org/api/v1)" -ForegroundColor Yellow
            Write-Host "    or your PC's Wi-Fi IP before building." -ForegroundColor Yellow
            Write-Host ""
        }
    }
}

# 3. Determine Architectures
$gradleArchProp = ""
if ($Arch -eq "arm64-v8a") {
    $gradleArchProp = "-PreactNativeArchitectures=arm64-v8a"
    Write-Host "[*] Architecture: arm64-v8a (Optimized for modern phones, ~30MB APK)" -ForegroundColor Green
} elseif ($Arch -eq "armeabi-v7a") {
    $gradleArchProp = "-PreactNativeArchitectures=armeabi-v7a"
    Write-Host "[*] Architecture: armeabi-v7a (Older 32-bit phones)" -ForegroundColor Yellow
} else {
    $gradleArchProp = "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64"
    Write-Host "[*] Architecture: Universal (Fat build with all architectures, ~90-110MB)" -ForegroundColor Yellow
}

# 4. Navigate to android folder and build
$androidDir = Join-Path $frontendDir "android"
if (-not (Test-Path $androidDir)) {
    Write-Host "[-] Android native project not found at: $androidDir" -ForegroundColor Red
    exit 1
}

Set-Location $androidDir

if ($Clean) {
    Write-Host "[*] Cleaning previous build cache..." -ForegroundColor Yellow
    & .\gradlew.bat clean
}

Write-Host ""
Write-Host "[*] Building Standalone Release APK with Hermes bytecode..." -ForegroundColor Yellow
Write-Host "    Command: .\gradlew.bat assembleRelease $gradleArchProp" -ForegroundColor DarkGray
Write-Host ""

$buildStartTime = Get-Date

if ($gradleArchProp) {
    & .\gradlew.bat assembleRelease $gradleArchProp
} else {
    & .\gradlew.bat assembleRelease
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[-] Gradle build failed with exit code $LASTEXITCODE." -ForegroundColor Red
    exit $LASTEXITCODE
}

$buildDuration = (Get-Date) - $buildStartTime
Write-Host ""
Write-Host "[+] Release build completed in $([math]::Round($buildDuration.TotalMinutes, 1)) minutes!" -ForegroundColor Green

# 5. Locate APK and copy to release folder
$apkOutputDir = Join-Path $androidDir "app\build\outputs\apk\release"
$candidateApks = Get-ChildItem -Path $apkOutputDir -Filter "*.apk" -ErrorAction SilentlyContinue

if (-not $candidateApks -or $candidateApks.Count -eq 0) {
    Write-Host "[-] Could not find generated APK in $apkOutputDir" -ForegroundColor Red
    exit 1
}

$destFolder = Join-Path $projectRoot "release-apk"
if (-not (Test-Path $destFolder)) {
    New-Item -ItemType Directory -Path $destFolder | Out-Null
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "         Standalone Release APK Ready!             " -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green

$exportedApks = @()
foreach ($apk in $candidateApks) {
    $sizeMb = [math]::Round(($apk.Length / 1MB), 2)
    $cleanName = "SkillBridge-v2.0.1-$($Arch).apk"
    if ($candidateApks.Count -gt 1) {
        $cleanName = "SkillBridge-$($apk.Name)"
    }
    $targetPath = Join-Path $destFolder $cleanName
    Copy-Item -Path $apk.FullName -Destination $targetPath -Force

    Write-Host "  [+] APK:  $targetPath" -ForegroundColor Cyan
    Write-Host "      Size: $sizeMb MB" -ForegroundColor White
    $exportedApks += $targetPath
}

Write-Host ""
Write-Host "  Features of this APK:" -ForegroundColor DarkCyan
Write-Host "    - No USB connection needed" -ForegroundColor DarkGray
Write-Host "    - No terminal command or Metro server needed" -ForegroundColor DarkGray
Write-Host "    - Runs standalone on any Android phone" -ForegroundColor DarkGray
Write-Host "    - Ready to share directly via WhatsApp, Google Drive, or Telegram" -ForegroundColor DarkGray
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""

# 6. Auto-install to connected phone if requested
if ($Install) {
    $primaryApk = $exportedApks[0]
    Write-Host "[*] Checking for connected Android phone via ADB..." -ForegroundColor Yellow
    $adbCandidate = "adb"
    if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
        $candidate = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
        if (Test-Path $candidate) {
            $adbCandidate = $candidate
        }
    }

    $devices = & $adbCandidate devices | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of devices" }
    if ($devices) {
        Write-Host "[*] Installing standalone APK directly to device..." -ForegroundColor Yellow
        & $adbCandidate install -r $primaryApk
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[+] Installed successfully! You can now unplug the USB and launch SkillBridge directly from your phone app drawer." -ForegroundColor Green
        } else {
            Write-Host "[-] ADB install failed. You can copy the APK to your phone manually." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[-] No physical Android device connected via ADB for automatic install." -ForegroundColor Yellow
        Write-Host "    Copy the APK file from '$destFolder' to your phone to install." -ForegroundColor Cyan
    }
}
