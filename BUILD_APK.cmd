@echo off
setlocal

echo ===================================================
echo   SkillBridge v2.0.1 - Build Latest APK
echo ===================================================

:: Java and Android SDK paths
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

:: === Bake correct API URLs into the JS bundle ===
set "EXPO_PUBLIC_API_URL=https://skillbridge-api-pd9c.onrender.com/api/v1"
set "EXPO_PUBLIC_SUPABASE_URL=https://wyqsoxkwmulhpcoslnoj.supabase.co"
set "EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cXNveGt3bXVsaHBjb3Nsbm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAxMzUsImV4cCI6MjEwMTg1NjEzNX0.KFiTn-UCZoL_TWHMjOTums4Fs_DoMK_iGF3v-mdv6_o"

echo [*] Backend URL: %EXPO_PUBLIC_API_URL%
echo.

cd /d "%~dp0frontend\android"

echo [*] Compiling Release APK (5-10 minutes)...
call gradlew.bat assembleRelease "-PMYAPP_UPLOAD_STORE_FILE=debug.keystore" "-PMYAPP_UPLOAD_STORE_PASSWORD=android" "-PMYAPP_UPLOAD_KEY_ALIAS=androiddebugkey" "-PMYAPP_UPLOAD_KEY_PASSWORD=android"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===================================================
    echo  [+] Build Succeeded!
    copy /Y "app\build\outputs\apk\release\app-release.apk" "%~dp0skillbridge-app.apk"
    echo  [+] APK saved to: %~dp0skillbridge-app.apk
    echo ===================================================
) else (
    echo.
    echo [-] Build Failed. Check logs above.
)

pause

