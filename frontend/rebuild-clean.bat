@echo off
REM Clean rebuild for the Capacitor Android app.
REM Run from the project root (where package.json lives).

echo === 1. Building web assets ===
call npx vite build --mode capacitor
if errorlevel 1 goto :error

echo === 2. Wiping stale Android web assets ===
rmdir /s /q android\app\src\main\assets\public 2>nul

echo === 3. Copying + syncing fresh build into Capacitor ===
call npx cap copy android
if errorlevel 1 goto :error
call npx cap sync android
if errorlevel 1 goto :error

echo === 4. Gradle clean build ===
cd android
call gradlew clean assembleDebug --no-daemon
if errorlevel 1 goto :gradle_error
cd ..

echo === 5. Uninstall old APK, install fresh one ===
adb uninstall com.example.trustaware
adb install -r android\app\build\outputs\apk\debug\app-debug.apk

echo === Done. Check dist\index.html below to confirm it points at a hashed bundle: ===
type dist\index.html
goto :eof

:gradle_error
cd ..
:error
echo Build failed - see output above.
exit /b 1
