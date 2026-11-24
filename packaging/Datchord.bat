@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Datchord needs Node.js 24 or newer.
  echo Download it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

node -e "require('node:sqlite')" >nul 2>nul
if errorlevel 1 (
  echo.
  echo Your Node.js version is too old. Install Node.js 24 or newer from https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not defined PORT set "PORT=3000"
if not exist "data" mkdir "data"

echo.
echo Starting Datchord at http://localhost:%PORT%
echo Keep this window open while you use Datchord. Press Ctrl+C to stop.
echo.
start "" "http://localhost:%PORT%"
node server/index.js

if errorlevel 1 (
  echo.
  echo Datchord stopped with an error. If the port is busy, close the other app
  echo or start it with another port, for example: set PORT=3100 ^&^& Datchord.bat
  pause
)
