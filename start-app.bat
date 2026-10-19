@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing Admin Portal dependencies...
  call npm install
)
if not exist backend\node_modules (
  echo Installing API dependencies...
  cd backend
  call npm install
  cd ..
)
echo Starting Fortune Sacco API on http://localhost:5000/api
echo Starting Admin Review Portal at http://localhost:5176
call npm run dev:all