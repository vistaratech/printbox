@echo off
cd /d "%~dp0\.."
title PrintBox Windows Hardware Agent
color 0A
echo ====================================================
echo        PRINTBOX WINDOWS HARDWARE AGENT
echo ====================================================
echo.
echo Connecting to Epson L3250 and polling jobs...
echo Press Ctrl+C anytime to stop.
echo.
npm run kiosk:real
pause
