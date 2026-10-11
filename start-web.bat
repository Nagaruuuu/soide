@echo off
REM Khoi dong frontend Soi De AI
cd /d "%~dp0frontend"
if not exist node_modules call npm install
call npx vite --port 5176
