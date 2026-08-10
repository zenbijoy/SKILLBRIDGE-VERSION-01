@echo off
setlocal
cd /d "%~dp0"

echo SkillBridge V2.0.1 Windows setup
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found. Install Node.js 22 LTS or newer.
    exit /b 1
)
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm was not found.
    exit /b 1
)

echo [1/2] Installing frontend...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Frontend npm install failed.
    exit /b 1
)
call npx expo-doctor
if %errorlevel% neq 0 (
    echo [WARNING] expo-doctor reported warnings. Setup will continue.
)
cd ..

echo.
echo [2/2] Installing backend...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Backend npm install failed.
    exit /b 1
)
cd ..

echo.
echo Creating .env files if missing...
if not exist "frontend\.env" (
    copy "frontend\.env.example" "frontend\.env"
)
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env"
)

echo.
echo Setup completed successfully.
echo Next: edit frontend/.env and backend/.env, configure Supabase, then run START_DEV_WINDOWS.cmd.
exit /b 0
