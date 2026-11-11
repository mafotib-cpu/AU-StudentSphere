@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this again.
  pause
  exit /b 1
)
if not exist "node_modules\express\package.json" (
  echo Installing packages - first run only, needs internet...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your internet connection and run this again.
    pause
    exit /b 1
  )
)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
