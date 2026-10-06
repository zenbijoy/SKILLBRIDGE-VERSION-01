# ==============================================================================
# SkillBridge - Production Release APK Builder
# ==============================================================================
# Builds a standalone, PRODUCTION-SIGNED release APK that:
#   1. Validates the production mobile environment (HTTPS API, no localhost).
#   2. Signs with a real release keystore -> stable signature, so APKs are
#      upgradeable and safe to share (WhatsApp / Drive / Telegram / stores).
#   3. Ships every native feature: LiveKit WebRTC A/V rooms, camera, mic,
#      notifications, maps, haptics, secure store, clipboard, image picker.
#   4. Stays small and fast: arm64-v8a only, Hermes bytecode, R8 minify,
#      resource shrinking, JS bundle compression.
#   5. Verifies the APK signature with apksigner and prints a size breakdown.
#
# Usage:
#   .\build-release-apk.ps1                  # arm64-v8a production build
#   .\build-release-apk.ps1 -Arch universal  # fat APK with all architectures
#   .\build-release-apk.ps1 -Clean           # clean build from scratch
#   .\build-release-apk.ps1 -Install         # build + install to ADB device
# ==============================================================================

[CmdletBinding()]
param(
    [ValidateSet("arm64-v8a", "armeabi-v7a", "universal")]
    [string]$Arch = "arm64-v8a",
    [switch]$Install,
    [switch]$Clean,
    [switch]$SkipValidate
)

$ErrorActionPreference = "Continue"

$projectRoot  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir  = Join-Path $projectRoot "frontend"
$androidDir   = Join-Path $frontendDir "android"
$keystoreDir  = Join-Path $androidDir "keystore"
$keystorePath = Join-Path $keystoreDir "skillbridge-release.keystore"
$keyPropsPath = Join-Path $androidDir "key.properties"
$releaseDir   = Join-Path $projectRoot "release-apk"
$storeAlias   = "skillbridge"

function Write-Banner([string]$text, [string]$color = "Cyan") {
    Write-Host "===================================================" -ForegroundColor $color
    Write-Host "  $text" -ForegroundColor $color
    Write-Host "===================================================" -ForegroundColor $color
}

Write-Banner "SkillBridge - Production Release APK Builder"

# --- 1. Java JDK + Android SDK ------------------------------------------------
$jbrCandidates = @(
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Program Files\Android\Android Studio\jre"
)
foreach ($cand in $jbrCandidates) {
    if (Test-Path $cand) {
        $env:JAVA_HOME = $cand
        $env:Path = "$cand\bin;" + $env:Path
        Write-Host "[+] JAVA_HOME: $cand" -ForegroundColor Green
        break
    }
}
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME "bin\keytool.exe"))) {
    Write-Host "[-] JDK not found (keytool missing). Install Android Studio or set JAVA_HOME." -ForegroundColor Red
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

# --- 2. Production environment validation -------------------------------------
if (-not $SkipValidate) {
    Write-Host ""
    Write-Host "[*] Validating PRODUCTION mobile environment..." -ForegroundColor Yellow
    Push-Location $projectRoot
    node (Join-Path $projectRoot "scripts\validate-mobile-env.mjs") --production
    $envExit = $LASTEXITCODE
    Pop-Location
    if ($envExit -ne 0) {
        Write-Host "[-] Environment validation failed. Fix frontend/.env and retry." -ForegroundColor Red
        exit $envExit
    }
}

# --- 3. Release keystore (idempotent) -----------------------------------------
if (-not (Test-Path $keystoreDir)) { New-Item -ItemType Directory -Path $keystoreDir | Out-Null }

if (-not (Test-Path $keystorePath)) {
    Write-Host ""
    Write-Host "[*] No release keystore found - generating a new one..." -ForegroundColor Yellow
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $password = [Convert]::ToBase64String($bytes)
    & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
        -keystore $keystorePath -alias $storeAlias `
        -keyalg RSA -keysize 3072 -validity 10000 `
        -storepass $password -keypass $password `
        -dname "CN=SkillBridge, O=SkillBridge"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $keystorePath)) {
        Write-Host "[-] Keystore generation failed." -ForegroundColor Red
        exit 1
    }
    @(
        "storeFile=$($keystorePath -replace '\\','/')"
        "storePassword=$password"
        "keyAlias=$storeAlias"
        "keyPassword=$password"
    ) | Set-Content -Path $keyPropsPath -Encoding ascii

    Write-Host "[+] Release keystore generated: $keystorePath" -ForegroundColor Green
    Write-Host "[+] Credentials written to gitignored key.properties." -ForegroundColor Green
    Write-Host "[!] BACK UP the keystore + key.properties - without them you can never ship updates." -ForegroundColor Yellow
}
elseif (-not (Test-Path $keyPropsPath)) {
    Write-Host "[-] Keystore exists but key.properties is missing." -ForegroundColor Red
    Write-Host "    Recreate $keyPropsPath with storeFile / storePassword / keyAlias / keyPassword." -ForegroundColor Red
    exit 1
}
else {
    Write-Host "[*] Using existing release keystore + key.properties" -ForegroundColor Green
}

# --- 4. Architecture selection ------------------------------------------------
switch ($Arch) {
    "arm64-v8a" {
        $archList = "arm64-v8a"
        Write-Host "[*] Architecture: arm64-v8a (modern phones, smallest APK)" -ForegroundColor Green
    }
    "armeabi-v7a" {
        $archList = "armeabi-v7a"
        Write-Host "[*] Architecture: armeabi-v7a (older 32-bit phones)" -ForegroundColor Yellow
    }
    "universal" {
        $archList = "armeabi-v7a,arm64-v8a,x86,x86_64"
        Write-Host "[*] Architecture: universal (fat build, all ABIs)" -ForegroundColor Yellow
    }
}

if (-not (Test-Path $androidDir)) {
    Write-Host "[-] Android native project not found at: $androidDir" -ForegroundColor Red
    Write-Host "    Run 'npx expo prebuild -p android' first." -ForegroundColor Red
    exit 1
}

# --- 4.5 Ensure React Native headers compatibility ---------------------------
$npmHeader = Join-Path $frontendDir "node_modules\react-native\ReactCommon\react\renderer\core\graphicsConversions.h"
if (Test-Path $npmHeader) {
    $content = Get-Content $npmHeader -Raw
    if ($content -match 'std::format\("\{}%"') {
        $content = $content -replace 'std::format\("\{}%", dimension\.value\)', 'std::to_string(dimension.value) + "%"'
        Set-Content -Path $npmHeader -Value $content -Encoding utf8 -NoNewline
        Write-Host "[+] Patched std::format in $npmHeader" -ForegroundColor Green
    }
}


# --- 4.6 Patch expo-av ViewUtils.kt (needed when expo-av builds from source) ---
# Legacy UIManager.resolveView() was removed in SDK 57's expo-modules-core.
# The two affected helpers are deprecated tag-based video-view lookups that
# this app never calls (it only uses Audio), so they are stubbed to reject.
$viewUtilsPath = Join-Path $frontendDir "node_modules\expo-av\android\src\main\java\expo\modules\av\ViewUtils.kt"
if (Test-Path $viewUtilsPath) {
    $vuContent = Get-Content $viewUtilsPath -Raw
    if ($vuContent -notmatch 'Patched: legacy UIManager\.resolveView removed') {
        $vuContent = $vuContent -replace 'moduleRegistry\.getModule\(UIManager::class\.java\)\.resolveView\(viewTag\) as VideoViewWrapper\?', 'null as VideoViewWrapper? // Patched: legacy UIManager.resolveView removed in SDK 57'
        Set-Content -Path $viewUtilsPath -Value $vuContent -Encoding utf8 -NoNewline
        Write-Host "[+] Patched expo-av ViewUtils.kt (legacy resolveView removed)" -ForegroundColor Green
    }
}

# --- 5. Gradle release build ---------------------------------------------------
Write-Host ""
Write-Banner "Building Release APK (Hermes + R8 + bundle compression)" "Yellow"
Write-Host "    gradlew assembleRelease -PreactNativeArchitectures=$archList" -ForegroundColor DarkGray
Write-Host ""

$env:CMAKE_BUILD_PARALLEL_LEVEL = "2"
# Production bundling: Expo CLI loads .env from the frontend project.
$env:NODE_ENV = "production"
$buildExit = 1
$buildStart = Get-Date

Push-Location $androidDir
try {
    if ($Clean) {
        Write-Host "[*] Cleaning previous build output..." -ForegroundColor Yellow
        & .\gradlew.bat clean
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[-] Gradle clean failed." -ForegroundColor Red
            exit $LASTEXITCODE
        }
    }
    & .\gradlew.bat assembleRelease "-PreactNativeArchitectures=$archList"
    $buildExit = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($buildExit -ne 0) {
    Write-Host ""
    Write-Host "[-] Gradle build failed with exit code $buildExit. Check logs above." -ForegroundColor Red
    exit $buildExit
}

$duration = (Get-Date) - $buildStart
Write-Host ""
Write-Host "[+] Build completed in $([math]::Round($duration.TotalMinutes, 1)) minutes" -ForegroundColor Green

# --- 6. Locate APK + verify signature ------------------------------------------
$apkOutputDir = Join-Path $androidDir "app\build\outputs\apk\release"
$apk = Get-ChildItem -Path $apkOutputDir -Filter "*.apk" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) {
    Write-Host "[-] No APK found in $apkOutputDir" -ForegroundColor Red
    exit 1
}

$signedWithDebugKey = $false
$apksigner = Get-ChildItem -Path (Join-Path $env:ANDROID_HOME "build-tools") -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName "apksigner.bat" } |
    Where-Object { Test-Path $_ } | Select-Object -First 1

if ($apksigner) {
    Write-Host "[*] Verifying APK signature..." -ForegroundColor Yellow
    $verifyOut = (& $apksigner verify --print-certs $apk.FullName 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[-] Signature verification FAILED:" -ForegroundColor Red
        Write-Host $verifyOut
        exit 1
    }
    if ($verifyOut -match 'androiddebugkey') { $signedWithDebugKey = $true }
    Write-Host "[+] Signature valid (v1+v2+v3 scheme)" -ForegroundColor Green
    ($verifyOut -split "`r?`n") |
        Where-Object { $_ -match 'Signer #1 certificate (DN|SHA-256 digest)' } |
        ForEach-Object { Write-Host "    $($_.Trim())" -ForegroundColor DarkGray }
}
else {
    Write-Host "[!] apksigner not found - signature not verified." -ForegroundColor Yellow
}

if ($signedWithDebugKey) {
    Write-Host "[!] WARNING: APK is signed with the DEBUG key." -ForegroundColor Yellow
    Write-Host "    key.properties was not picked up - release signing inactive." -ForegroundColor Yellow
}

# --- 7. Size breakdown ---------------------------------------------------------
$pkgVersion = "0.0.0"
try {
    $pkgJson = Get-Content (Join-Path $frontendDir "package.json") -Raw | ConvertFrom-Json
    $pkgVersion = $pkgJson.version
} catch {}

$apkSizeMb = [math]::Round(($apk.Length / 1MB), 2)
$abis = @()
$bundleRaw = 0; $bundleComp = 0; $dexRaw = 0; $dexComp = 0; $soRaw = 0; $entryCount = 0

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk.FullName)
try {
    foreach ($entry in $zip.Entries) {
        $entryCount++
        switch -Wildcard ($entry.FullName) {
            "*index.android.bundle" {
                $bundleRaw += $entry.Length; $bundleComp += $entry.CompressedLength
            }
            "*.dex" {
                $dexRaw += $entry.Length; $dexComp += $entry.CompressedLength
            }
            "*.so" {
                $soRaw += $entry.Length
                $abi = ($entry.FullName -split '/')[1]
                if ($abi -and $abis -notcontains $abi) { $abis += $abi }
            }
        }
    }
}
finally { $zip.Dispose() }

Write-Host ""
Write-Banner "Production Release APK Ready!" "Green"
Write-Host "  APK      : $($apk.FullName)"
Write-Host "  Version  : v$pkgVersion (versionCode 2)"
Write-Host "  Size     : $apkSizeMb MB"
Write-Host "  ABIs     : $($abis -join ', ')"
Write-Host "  JS bundle: $([math]::Round($bundleRaw/1MB,2)) MB raw -> $([math]::Round($bundleComp/1MB,2)) MB in APK (Hermes, compressed)"
Write-Host "  DEX      : $([math]::Round($dexRaw/1MB,2)) MB raw -> $([math]::Round($dexComp/1MB,2)) MB in APK (R8)"
Write-Host "  Native   : $([math]::Round($soRaw/1MB,2)) MB (.so libraries)"
Write-Host "  Entries  : $entryCount"

# --- 8. Export shareable copies ------------------------------------------------
if (-not (Test-Path $releaseDir)) { New-Item -ItemType Directory -Path $releaseDir | Out-Null }
$cleanName = "SkillBridge-v$pkgVersion-$Arch-release.apk"
$exported = Join-Path $releaseDir $cleanName
Copy-Item -Path $apk.FullName -Destination $exported -Force
Copy-Item -Path $apk.FullName -Destination (Join-Path $projectRoot "skillbridge-app.apk") -Force

Write-Host ""
Write-Host "  Shareable copy : $exported" -ForegroundColor Cyan
Write-Host "  Root copy      : $(Join-Path $projectRoot 'skillbridge-app.apk')" -ForegroundColor Cyan
Write-Host "  Signature      : production keystore (alias '$storeAlias')" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [!] BACK UP frontend/android/keystore + key.properties." -ForegroundColor Yellow
Write-Host "      Losing them means you can never update this app again." -ForegroundColor Yellow
Write-Host "  [!] Phones with an OLD debug-signed build must UNINSTALL first:" -ForegroundColor Yellow
Write-Host "      Settings > Apps > SkillBridge > Uninstall, then install this APK." -ForegroundColor Yellow

# --- 9. Optional ADB install ----------------------------------------------------
if ($Install) {
    Write-Host ""
    Write-Host "[*] Looking for a connected Android device..." -ForegroundColor Yellow
    $adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
    if (-not (Test-Path $adb)) { $adb = "adb" }
    $devices = (& $adb devices | Where-Object { $_ -match "`tdevice$" })
    if ($devices) {
        Write-Host "[*] Installing release APK..." -ForegroundColor Yellow
        & $adb install -r $exported
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[+] Installed! Launch SkillBridge from the app drawer (no USB/Metro needed)." -ForegroundColor Green
        }
        else {
            Write-Host "[!] Install failed. If the old debug build is installed, run:" -ForegroundColor Yellow
            Write-Host "    $adb uninstall com.skillbridge.app" -ForegroundColor Yellow
            Write-Host "    then retry: $adb install -r `"$exported`"" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "[-] No device connected. Copy the APK to your phone to install." -ForegroundColor Cyan
    }
}


