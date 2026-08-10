@echo off
cd /d "%~dp0"
start "SkillBridge Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"
start "SkillBridge Web" cmd /k "cd /d "%~dp0frontend" && npm run web"
echo Opened backend and web frontend in separate terminals.
