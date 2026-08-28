@echo off
setlocal
title SkillBridge - Expo Go Dev Server

echo ===================================================
echo   SkillBridge v2.0.1 - Launching for Expo Go
echo ===================================================
echo.
echo [*] Backend: https://skillbridge-api-pd9c.onrender.com/api/v1
echo [*] Supabase: wyqsoxkwmulhpcoslnoj.supabase.co
echo.
echo [*] Starting Metro Bundler with cleared cache...
echo.

cd /d "%~dp0frontend"
call npx expo start -c

pause
