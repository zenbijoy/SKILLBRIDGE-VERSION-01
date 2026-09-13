# ==============================================================================
# SkillBridge - One-Command Physical Android USB Dev Launcher (Fast Refresh)
# ==============================================================================
# Workflow:
#   1. Locates ADB executable from PATH, Android SDK platform-tools, or ANDROID_HOME
#   2. Detects connected physical Android device (filters out emulators)
#   3. Handles unauthorized, offline, or missing device states with auto-recovery
#   4. Reverses port 8081 (Metro) and local backend ports (4000/5000/3000) over USB
#   5. Verifies reverse socket list via `adb reverse --list`
#   6. Inspects port 8081 and cleans up stale Metro/Node processes if necessary
#   7. Brings SkillBridge Dev Client to front on phone via ADB intent
#   8. Starts Metro bundler targeting localhost + dev-client for instant Fast Refresh
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$Clear,
    [switch]$Localhost,
    [string]$Port = "8081"
)

$ErrorActionPreference = "Continue"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  SkillBridge - Android USB Dev & Fast Refresh     " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------------------
# 1. Locate ADB Executable
# ------------------------------------------------------------------------------
$adbCmd = "adb"
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    $searchPaths = @(
        (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools"),
        (Join-Path $env:ProgramFiles "Android\platform-tools"),
        (if ($env:ANDROID_HOME) { Join-Path $env:ANDROID_HOME "platform-tools" }),
        (if ($env:ANDROID_SDK_ROOT) { Join-Path $env:ANDROID_SDK_ROOT "platform-tools" })
    ) | Where-Object { $_ -and (Test-Path $_) }

    $found = $false
    foreach ($path in $searchPaths) {
        $candidate = Join-Path $path "adb.exe"
        if (Test-Path $candidate) {
            $env:Path = "$path;" + $env:Path
            $adbCmd = $candidate
            Write-Host "[+] Found ADB in: $path" -ForegroundColor Green
            $found = $true
            break
        }
    }

    if (-not $found) {
        Write-Host "[-] Could not find adb.exe automatically." -ForegroundColor Red
        Write-Host "    Please ensure Android SDK platform-tools is installed or add adb to your PATH." -ForegroundColor Yellow
        exit 1
    }
} else {
    $adbPath = (Get-Command adb).Source
    Write-Host "[+] ADB is available: $adbPath" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 2. Detect & Verify Android Device Status
# ------------------------------------------------------------------------------
function Get-ConnectedDevices {
    param([string]$Adb)
    $lines = & $Adb devices -l | Where-Object { $_ -and $_ -notmatch "List of devices attached" }
    return $lines
}

Write-Host "[*] Checking connected Android devices via ADB..." -ForegroundColor Yellow

$maxAttempts = 3
$attempt = 1
$targetSerial = $null

while ($attempt -le $maxAttempts -and -not $targetSerial) {
    $rawLines = Get-ConnectedDevices -Adb $adbCmd

    # Check for unauthorized devices
    $unauthLines = $rawLines | Where-Object { $_ -match "\bunauthorized\b" }
    if ($unauthLines) {
        Write-Host ""
        Write-Host "[!] DEVICE UNAUTHORIZED:" -ForegroundColor Red
        Write-Host "    Your phone is connected, but USB debugging authorization is pending." -ForegroundColor Yellow
        Write-Host "    1. Unlock your Android phone." -ForegroundColor Cyan
        Write-Host "    2. Look for the prompt: 'Allow USB debugging?'" -ForegroundColor Cyan
        Write-Host "    3. Check 'Always allow from this computer' and tap 'Allow' or 'OK'." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "[*] Waiting up to 15 seconds for authorization..." -ForegroundColor Yellow

        $authWait = 0
        while ($authWait -lt 15) {
            Start-Sleep -Seconds 2
            $authWait += 2
            $checkLines = Get-ConnectedDevices -Adb $adbCmd
            if ($checkLines | Where-Object { $_ -match "\bdevice\b" }) {
                $rawLines = $checkLines
                break
            }
        }
    }

    # Check for offline devices
    $offlineLines = $rawLines | Where-Object { $_ -match "\boffline\b" }
    if ($offlineLines) {
        Write-Host "[!] Device is OFFLINE. Restarting ADB server..." -ForegroundColor Yellow
        & $adbCmd kill-server 2>$null | Out-Null
        Start-Sleep -Seconds 2
        & $adbCmd start-server | Out-Null
        Start-Sleep -Seconds 1
        $rawLines = Get-ConnectedDevices -Adb $adbCmd
    }

    # Filter out emulators and find authorized physical devices
    $physicalDevices = @()
    foreach ($line in $rawLines) {
        if ($line -match "\bdevice\b") {
            $parts = -split $line.Trim()
            $serial = $parts[0]
            if ($serial -notlike "emulator-*") {
                $physicalDevices += $serial
            }
        }
    }

    if ($physicalDevices.Count -gt 0) {
        $targetSerial = $physicalDevices[0]
        break
    }

    if ($attempt -lt $maxAttempts) {
        Write-Host "[*] Device not ready yet, retrying ADB server ($attempt/$maxAttempts)..." -ForegroundColor Yellow
        & $adbCmd start-server 2>$null | Out-Null
        Start-Sleep -Seconds 2
    }
    $attempt++
}

if (-not $targetSerial) {
    Write-Host ""
    Write-Host "[-] No authorized physical Android phone detected." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the following:" -ForegroundColor Yellow
    Write-Host "  1. USB Cable: Ensure the phone is connected via a reliable USB data cable." -ForegroundColor White
    Write-Host "  2. USB Connection Mode: Set USB mode on phone to 'File Transfer' (MTP) instead of 'Charging only'." -ForegroundColor White
    Write-Host "  3. Developer Options: Verify 'Developer Options' and 'USB Debugging' are enabled in Settings." -ForegroundColor White
    Write-Host "  4. Authorization: Check phone screen for 'Allow USB debugging' prompt." -ForegroundColor White
    Write-Host "  5. Drivers: Ensure OEM Android USB driver is installed if phone is not recognized by Windows." -ForegroundColor White
    Write-Host ""
    Write-Host "To manually check status at any time, run: adb devices" -ForegroundColor Cyan
    exit 1
}

# Fetch phone model and manufacturer
$model = (& $adbCmd -s $targetSerial shell getprop ro.product.model 2>$null)
if ($model) { $model = $model.Trim() } else { $model = "Android Device" }

$mfg = (& $adbCmd -s $targetSerial shell getprop ro.product.manufacturer 2>$null)
if ($mfg) { $mfg = $mfg.Trim() } else { $mfg = "" }

Write-Host "[+] Target physical phone: $mfg $model ($targetSerial)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 3. Configure USB Port Reverse (Metro Bundler + Local Backend)
# ------------------------------------------------------------------------------
Write-Host "[*] Configuring USB port reverse forwarding for Metro (tcp:$Port -> tcp:$Port)..." -ForegroundColor Yellow

& $adbCmd -s $targetSerial reverse "tcp:$Port" "tcp:$Port" 2>$null | Out-Null

# Also forward common local backend ports if local backend is in use
& $adbCmd -s $targetSerial reverse tcp:4000 tcp:4000 2>$null | Out-Null
& $adbCmd -s $targetSerial reverse tcp:5000 tcp:5000 2>$null | Out-Null
& $adbCmd -s $targetSerial reverse tcp:3000 tcp:3000 2>$null | Out-Null

$reverseRules = (& $adbCmd -s $targetSerial reverse --list 2>$null)
if ($reverseRules -match $Port) {
    Write-Host "[+] ADB Reverse active over USB:" -ForegroundColor Green
    foreach ($rule in ($reverseRules -split "`r?`n")) {
        if ($rule.Trim()) {
            Write-Host "    $rule" -ForegroundColor DarkCyan
        }
    }
} else {
    Write-Host "[-] Warning: Verification of reverse rule for port $Port failed. Retrying..." -ForegroundColor Yellow
    & $adbCmd -s $targetSerial reverse --remove "tcp:$Port" 2>$null | Out-Null
    & $adbCmd -s $targetSerial reverse "tcp:$Port" "tcp:$Port" | Out-Null
}

# ------------------------------------------------------------------------------
# 4. Check for Port 8081 Conflicts
# ------------------------------------------------------------------------------
$occupied = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
    $owningPid = $occupied[0].OwningProcess
    $proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.ProcessName } else { "Unknown" }

    Write-Host "[!] Port $Port is currently held by PID $owningPid ($procName)." -ForegroundColor Yellow

    # If it is an old node process (stale Metro server), clean it up
    if ($procName -match "node" -or $procName -match "cmd" -or $procName -match "powershell") {
        Write-Host "[*] Terminating stale Metro instance (PID $owningPid)..." -ForegroundColor Yellow
        try {
            Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            Write-Host "[+] Stale process terminated cleanly." -ForegroundColor Green
        } catch {
            Write-Host "[-] Could not stop PID $owningPid. Continuing..." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[-] Warning: Non-Node process ($procName) is listening on port $Port." -ForegroundColor Red
        Write-Host "    If Metro fails to bind, please close the conflicting application." -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
# 5. Verify App is Installed & Launch Dev Client on Phone
# ------------------------------------------------------------------------------
$pkgCheck = & $adbCmd -s $targetSerial shell pm list packages 2>$null | Select-String "com.skillbridge.app"

if (-not $pkgCheck) {
    Write-Host "[!] SkillBridge Dev APK is not installed on $model." -ForegroundColor Yellow
    Write-Host "[*] Installing native development build directly onto device..." -ForegroundColor Yellow

    $frontendPath = (Resolve-Path (Join-Path $PSScriptRoot "..\frontend")).Path
    Push-Location $frontendPath
    try {
        & npx expo run:android --device $model --no-bundler
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[+] SkillBridge Development Build is already installed." -ForegroundColor Green
    Write-Host "[*] Bringing SkillBridge Dev Client to front on phone..." -ForegroundColor Cyan

    # Launch dev client URI directly via intent pointing to localhost:8081 (reversed over USB)
    & $adbCmd -s $targetSerial shell am start -a android.intent.action.VIEW -d "skillbridge://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$Port" 2>$null | Out-Null
    & $adbCmd -s $targetSerial shell am start -n com.skillbridge.app/.MainActivity 2>$null | Out-Null
}

# ------------------------------------------------------------------------------
# 6. Start Metro Bundler with Dev Client & Localhost
# ------------------------------------------------------------------------------
$frontendDir = Join-Path $PSScriptRoot "..\frontend"
if (-not (Test-Path $frontendDir)) {
    $frontendDir = $PSScriptRoot
}
Set-Location $frontendDir

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  Starting Metro Bundler (USB Fast Refresh)        " -ForegroundColor Green
Write-Host "  Port: $Port  |  Mode: Dev Client (localhost)     " -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  Tip: Press 'r' to reload, 'm' for dev menu.      " -ForegroundColor DarkGray
Write-Host "  Fast Refresh is active: edit any TSX/CSS file to " -ForegroundColor DarkGray
Write-Host "  instantly see changes on your phone!             " -ForegroundColor DarkGray
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""

$startArgs = @("expo", "start", "--dev-client", "--port", $Port)
if ($Localhost) {
    $startArgs += "--localhost"
}
if ($Clear) {
    $startArgs += "--clear"
}

& npx @startArgs
