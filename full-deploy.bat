@echo off
cd /d "D:\Gemini_Projects\gravity-center-app"
echo ================================
echo      完整部署脚本
echo ================================
echo.

echo 1. 安装 Tailwind CSS 依赖...
npm install tailwindcss@3.4.14 postcss autoprefixer --save

echo.
echo 2. 删除旧的构建目录...
rmdir /s /q .next

echo.
echo 3. 重新构建项目...
npm run build

echo.
echo 4. 提交代码...
git add .
git commit -m "安装 Tailwind CSS 依赖并重新构建"

echo.
echo 5. 推送到 GitHub...
git push origin main

echo.
echo ================================
echo      部署完成！
echo ================================
pause