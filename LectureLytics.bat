@echo off
title LectureLytics Launcher
cd /d "%~dp0"

start "Python Backend" cmd /k "cd lecturelytics\services\transcriber && py -3.12-64 -u main.py"
timeout /t 5 /nobreak
cd lecturelytics
start "Next.js" cmd /k "npm run dev"
timeout /t 10 /nobreak
start http://localhost:3000

cmd