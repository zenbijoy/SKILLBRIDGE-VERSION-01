@echo off
setlocal
cd /d "%~dp0frontend"
echo Starting frontend (Expo)...
call npx expo start
