@echo off
setlocal
cd /d "%~dp0frontend"
echo Starting frontend (Web)...
call npx expo start --web
