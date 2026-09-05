@echo off
setlocal
title SkillBridge - USB Fast Refresh Dev Server

echo ===================================================
echo   SkillBridge - USB Fast Refresh Dev Server
echo ===================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\dev-usb.ps1"

pause
