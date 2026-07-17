@echo off
cd /d "D:\Gemini_Projects\gravity-center-app"

echo ================================
echo      检查构建输出目录
echo ================================
if exist ".next" (
  echo .next 目录存在
  echo.
  echo 列出 CSS 文件:
  dir ".next\static\css" 2>nul || echo CSS 目录不存在
) else (
  echo .next 目录不存在，请先运行 npm run build
)

echo.
echo ================================
echo      检查 package.json 依赖
echo ================================
findstr /C:"tailwindcss" package.json || echo tailwindcss 未安装

pause