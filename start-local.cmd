@echo off
setlocal
pushd "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 goto missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing
if exist "node_modules\.bin\vite.cmd" goto ready
echo Installing locked dependencies...
call npm.cmd ci
if errorlevel 1 goto failed
:ready
echo.
echo KARMAN Launch Lab - http://127.0.0.1:5173
echo Keep this window open. Press Ctrl+C to stop.
echo.
call npm.cmd run dev -- --port 5173 --strictPort
set "taskExitCode=%errorlevel%"
if not "%taskExitCode%"=="0" pause
popd
exit /b %taskExitCode%
:missing
echo Node.js and npm are required. Install Node.js 22.12+ or 24 LTS.
goto failed
:failed
echo Unable to start. Review the error above.
pause
popd
exit /b 1
