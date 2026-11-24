@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install it from https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 goto :error
)
if not exist dist (
  echo Building Datchord...
  call npm.cmd run build
  if errorlevel 1 goto :error
)
echo Starting Datchord at http://localhost:3000
start "" "http://localhost:3000"
node server/index.js
exit /b 0
:error
echo Something went wrong. Review the messages above.
pause
exit /b 1
