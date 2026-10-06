@echo off
setlocal
title SkillBridge - Production Release APK

echo ===================================================
echo   SkillBridge - Build Production Release APK
echo ===================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-release-apk.ps1" %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo [-] Build failed. Check the logs above.
) else (
    echo.
    echo [+] Done! Shareable APK is in release-apk\
)

pause
