# ==============================================================================
# SkillBridge - Build Native Development Client Debug APK (Fast Refresh / Hot Reload)
# ==============================================================================
# Workflow:
#   1. Validates OpenJDK (Java 21 LTS) and Android SDK
#   2. Builds Dev Client Debug APK via Gradle (:app:assembleDebug)
#   3. Copies APK to debug-apk\SkillBridge-DevClient-debug.apk and root
#   4. Detects connected physical Android device / emulator and installs cleanly
#   5. Configures ADB reverse forwarding for port 8081 (Metro) and backend ports
# ==============================================================================

[CmdletBinding()]
param(
    [ValidateSet("arm64-v8a", "armeabi-v7a", "universal")]
    [string]$Arch = "arm64-v8a",
    [switch]$NoInstall
)

$ErrorActionPreference = "Continue"

function Write-Banner([string]$text, [string]$color = "Cyan") {
    Write-Host "===================================================" -ForegroundColor $color
    Write-Host "  $text" -ForegroundColor $color
    Write-Host "===================================================" -ForegroundColor $color
}

Write-Banner "SkillBridge - Native Dev Client Debug APK Builder"

$projectRoot  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir  = Join-Path $projectRoot "frontend"
$androidDir   = Join-Path $frontendDir "android"
$debugDir     = Join-Path $projectRoot "debug-apk"

# --- 1. Locate Java JDK and Android SDK ----------------------------------------
$jdkCandidates = @(
    "D:\jdk-21",
    $env:JAVA_HOME,
    "C:\Program Files\Java\jdk-21",
    "C:\Program Files\Java\jdk-25",
    "C:\Program Files\Android\Android Studio\jbr"
) | Where-Object { $_ -and (Test-Path (Join-Path $_ "bin\java.exe")) }

if ($jdkCandidates.Count -gt 0) {
    $env:JAVA_HOME = $jdkCandidates[0]
    $env:Path = "$($env:JAVA_HOME)\bin;" + $env:Path
    Write-Host "[+] JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Green
} else {
    Write-Host "[-] Valid JDK not found. Please ensure Java 21 LTS is installed." -ForegroundColor Red
    exit 1
}

if (-not $env:ANDROID_HOME) {
    $androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $androidSdk) { $env:ANDROID_HOME = $androidSdk }
}
if (-not $env:ANDROID_HOME) {
    Write-Host "[-] ANDROID_HOME not found. Install the Android SDK." -ForegroundColor Red
    exit 1
}
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
Write-Host "[+] ANDROID_HOME: $env:ANDROID_HOME" -ForegroundColor Green

# --- 2. Architecture selection ------------------------------------------------
switch ($Arch) {
    "arm64-v8a" { $archList = "arm64-v8a" }
    "armeabi-v7a" { $archList = "armeabi-v7a" }
    "universal" { $archList = "armeabi-v7a,arm64-v8a,x86,x86_64" }
}
Write-Host "[*] Architecture: $Arch ($archList)" -ForegroundColor Green

# Set memory & build limits to prevent OOM
$env:CMAKE_BUILD_PARALLEL_LEVEL = "2"
$env:NODE_OPTIONS = "--max-old-space-size=3072"
if (Test-Path "D:\Temp") {
    $env:TEMP = "D:\Temp"
    $env:TMP = "D:\Temp"
}

# --- 3. Build Debug APK with Gradle -------------------------------------------
Write-Host ""
Write-Banner "Building Dev Client Debug APK (Hot Reload / Fast Refresh Enabled)" "Yellow"
Write-Host "    gradlew assembleDebug -PreactNativeArchitectures=$archList" -ForegroundColor DarkGray
Write-Host ""

$buildStart = Get-Date
$buildExit = 1

Push-Location $androidDir
try {
    & .\gradlew.bat assembleDebug "-PreactNativeArchitectures=$archList"
    $buildExit = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($buildExit -ne 0) {
    Write-Host "[-] Gradle build failed with exit code $buildExit." -ForegroundColor Red
    exit $buildExit
}

$duration = (Get-Date) - $buildStart
Write-Host "[+] Build completed in $([math]::Round($duration.TotalMinutes, 1)) minutes" -ForegroundColor Green

# --- 4. Stage Output APK ------------------------------------------------------
$apkSrc = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkSrc)) {
    Write-Host "[-] Debug APK not found at: $apkSrc" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $debugDir)) { New-Item -ItemType Directory -Path $debugDir | Out-Null }
$destApk = Join-Path $debugDir "SkillBridge-DevClient-debug.apk"
Copy-Item -Path $apkSrc -Destination $destApk -Force
Copy-Item -Path $apkSrc -Destination (Join-Path $projectRoot "skillbridge-dev-client.apk") -Force

$apkSizeMB = [math]::Round(((Get-Item $destApk).Length / 1MB), 1)
Write-Host ""
Write-Host "[+] Dev Client APK ready ($apkSizeMB MB):" -ForegroundColor Green
Write-Host "    $destApk" -ForegroundColor Cyan
Write-Host "    $(Join-Path $projectRoot "skillbridge-dev-client.apk")" -ForegroundColor Cyan

# --- 5. Optional Device Installation via ADB ----------------------------------
if ($NoInstall) {
    Write-Host ""
    Write-Host "[*] Skipping installation as requested (-NoInstall)." -ForegroundColor Yellow
    exit 0
}

$adbCmd = "adb"
$deviceLines = @(& $adbCmd devices -l | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of devices" })
if ($deviceLines.Count -gt 0) {
    $firstLine = [string]$deviceLines[0]
    $targetSerial = (-split $firstLine.Trim())[0]
    $model = (& $adbCmd -s $targetSerial shell getprop ro.product.model 2>$null)
    if ($model) { $model = $model.Trim() } else { $model = "Device" }

    Write-Host ""
    Write-Host "[*] Found connected device: $model ($targetSerial)" -ForegroundColor Yellow
    Write-Host "[*] Installing Dev Client APK onto phone..." -ForegroundColor Cyan

    $installOut = (& $adbCmd -s $targetSerial install -r -d $destApk 2>&1 | Out-String)
    if ($installOut -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE") {
        Write-Host "[!] Signature mismatch detected (previous release build was installed)." -ForegroundColor Yellow
        Write-Host "[*] Uninstalling old version and installing Dev Client..." -ForegroundColor Yellow
        & $adbCmd -s $targetSerial uninstall com.skillbridge.app | Out-Null
        $installOut = (& $adbCmd -s $targetSerial install $destApk 2>&1 | Out-String)
    }

    if ($installOut -match "Success") {
        Write-Host "[+] SkillBridge Dev Client installed successfully on $model!" -ForegroundColor Green

        # Reverse Metro and backend ports
        & $adbCmd -s $targetSerial reverse tcp:8081 tcp:8081 2>$null | Out-Null
        & $adbCmd -s $targetSerial reverse tcp:4000 tcp:4000 2>$null | Out-Null
        & $adbCmd -s $targetSerial reverse tcp:5000 tcp:5000 2>$null | Out-Null
        & $adbCmd -s $targetSerial reverse tcp:3000 tcp:3000 2>$null | Out-Null
        Write-Host "[+] ADB reverse port 8081 configured over USB." -ForegroundColor Green
    } else {
        Write-Host "[-] Installation reported: $installOut" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "[!] No active Android device detected for auto-install." -ForegroundColor Yellow
    Write-Host "    Connect phone via USB and run 'BUILD_DEV_ANDROID.cmd' or install manually." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  HOW TO RUN WITH HOT RELOAD / FAST REFRESH:       " -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  1. Run: npm run dev" -ForegroundColor Cyan
Write-Host "     (or: powershell -File ./scripts/start-usb-dev.ps1)" -ForegroundColor DarkGray
Write-Host "  2. Open SkillBridge on your phone." -ForegroundColor Cyan
Write-Host "  3. Fast Refresh / Hot Reload will update live as " -ForegroundColor Cyan
Write-Host "     you edit code!" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Green
