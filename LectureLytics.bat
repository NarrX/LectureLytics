@echo off
title React Dev Server
cd /d "%~dp0"
cd lecturelytics
start http://localhost:3000
call npm run dev
cmd /k
