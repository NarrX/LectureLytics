@echo off
title LectureLytics launcher
cd /d "%~dp0"

:: 1. Start the Python Backend in a separate window
echo Starting Python Transcription Backend...
start "Python Backend" cmd /k "cd lecturelytics\services\transcriber && python main.py"

:: 2. Open the browser
start http://localhost:3000

:: 3. Run the React Dev Server in the current window
echo Starting React Development Server...
cd lecturelytics
call npm run dev

cmd /k