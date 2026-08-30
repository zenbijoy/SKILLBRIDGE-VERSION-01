@echo off
setlocal

echo ===================================================
echo   SkillBridge v2.0.1 - Build Latest Android APK
echo ===================================================
echo.

:: Java and Android SDK paths
if not defined JAVA_HOME set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

:: 1. Validate Mobile Environment Variables Before Building
echo [*] Validating mobile environment configuration...
call node "%~dp0scripts\validate-mobile-env.mjs"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [-] Mobile environment validation failed.
    echo [-] Please check frontend\.env or your environment variables.
    pause
    exit /b %ERRORLEVEL%
)

echo.
cd /d "%~dp0frontend\android"

echo [*] Compiling Release APK via Gradle (5-10 minutes)...
call gradlew.bat assembleRelease "-PMYAPP_UPLOAD_STORE_FILE=debug.keystore" "-PMYAPP_UPLOAD_STORE_PASSWORD=android" "-PMYAPP_UPLOAD_KEY_ALIAS=androiddebugkey" "-PMYAPP_UPLOAD_KEY_PASSWORD=android"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===================================================
    echo  [+] Build Succeeded!
    copy /Y "app\build\outputs\apk\release\app-release.apk" "%~dp0skillbridge-app.apk"
    echo  [+] Release APK saved to: %~dp0skillbridge-app.apk
    echo ===================================================
) else (
    echo.
    echo [-] Build Failed. Check logs above.
)

pause
