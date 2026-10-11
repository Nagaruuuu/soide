@echo off
REM Khoi dong backend Soi De AI (khong can API key o buoc nay)
cd /d "%~dp0backend"
if not exist node_modules call npm install
node src\index.js
