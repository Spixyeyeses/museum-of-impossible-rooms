@echo off
setlocal
title The Museum of Impossible Rooms
where node >nul 2>nul
if errorlevel 1 (
  echo The museum requires Node.js 20 or newer.
  echo Install Node.js from https://nodejs.org/ then open this launcher again.
  echo See docs\INSTALL.md for full instructions.
  pause
  exit /b 1
)
node "%~dp0tools\serve.mjs" %*
if errorlevel 1 (
  echo.
  echo The museum could not start. See the message above and docs\INSTALL.md.
  pause
  exit /b 1
)
endlocal
