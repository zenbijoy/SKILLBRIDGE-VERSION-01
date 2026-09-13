@echo off
setlocal
title SkillBridge - USB Fast Refresh Dev Server

echo ===================================================
echo   SkillBridge - USB Fast Refresh Dev Server
echo ===================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start-usb-dev.ps1"

pause
