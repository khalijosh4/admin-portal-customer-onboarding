@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting Admin Review Portal at http://localhost:5176
call npm run dev
