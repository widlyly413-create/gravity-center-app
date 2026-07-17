@echo off
cd /d "D:\Gemini_Projects\gravity-center-app"
echo ================================
echo      检查 package.json
echo ================================
type package.json
echo.
echo ================================
echo      运行构建
echo ================================
npm run build
pause