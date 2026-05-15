@echo off
title LectureLytics launcher
cd /d "%~dp0"

set /a suffix=%random% %% 9000 + 1000
set MY_SUBDOMAIN=lecturelytics-%suffix%
npx localtunnel --port 8000 --subdomain %MY_SUBDOMAIN%


:: 1. Start the Python Backend in a separate window
start "Python Backend" cmd /k "cd lecturelytics\services\transcriber && python main.py"

:: 2. Open the browser
start http://localhost:3000

:: 3. Run the React Dev Server in the current window
cd lecturelytics
call npm run dev

cmd /k