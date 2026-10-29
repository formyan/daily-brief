@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 Node.js。请先安装 Node.js 20 或更高版本：
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" copy /y ".env.example" ".env" >nul
)

echo.
echo 正在启动「晨间简报」...
echo 首次启动会在后台抓取信源，可能需要 1-3 分钟。
echo 浏览器地址：http://127.0.0.1:4173
echo 按 Ctrl+C 停止服务。
echo.

start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:4173"
node server.mjs
pause
