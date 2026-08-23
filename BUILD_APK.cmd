@echo off
setlocal
echo ===================================================
echo   SkillBridge - Build Standalone Android APK
echo ===================================================

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0frontend\android"

echo [*] Compiling Release APK...
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
    echo [-] Build Failed. Please check the logs above.
)

pause
