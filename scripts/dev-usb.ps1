# ==============================================================================
# SkillBridge - Daily USB Fast Refresh Launcher (Physical Android Device)
# Forwarder to start-usb-dev.ps1
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$Clear,
    [switch]$Localhost,
    [string]$Port = "8081"
)

$targetScript = Join-Path $PSScriptRoot "start-usb-dev.ps1"
if (Test-Path $targetScript) {
    & $targetScript -Clear:$Clear -Localhost:$Localhost -Port $Port
} else {
    Write-Error "Could not locate start-usb-dev.ps1 in $PSScriptRoot"
}
