@echo off
cd /d "D:\Gemini_Projects\gravity-center-app"
echo ================================
echo      快速部署
echo ================================
echo.

git add .
git commit -m "修复 PostCSS 配置问题"
git push origin main

echo.
echo ================================
echo      推送完成！
echo ================================
pause