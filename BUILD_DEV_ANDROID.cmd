@echo off
setlocal
title SkillBridge - Build Native Dev Client APK

echo ===================================================
echo   SkillBridge - Native Dev Client USB Build Script
echo ===================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\build-dev-android.ps1"

pause
