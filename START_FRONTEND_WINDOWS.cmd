@echo off
setlocal
title SkillBridge - Expo Dev Server

echo ===================================================
echo   SkillBridge v2.0.1 - Launching Mobile Server
echo ===================================================
echo.

call node "%~dp0scripts\validate-mobile-env.mjs"
if %ERRORLEVEL% neq 0 (
    echo [-] Mobile environment validation failed. Check frontend\.env
    pause
    exit /b %ERRORLEVEL%
)

echo [*] Starting Metro Bundler with cleared cache...
echo.

cd /d "%~dp0frontend"
call npx expo start -c

pause
