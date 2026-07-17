@echo off
cd /d "D:\Gemini_Projects\gravity-center-app"
echo ================================
echo      修复部署问题
echo ================================
echo.

echo 1. 安装 Tailwind CSS 依赖...
npm install tailwindcss@3 postcss autoprefixer --save

echo.
echo 2. 初始化 Tailwind CSS 配置...
npx tailwindcss init -p

echo.
echo 3. 查看 package.json 确认安装...
type package.json | findstr /C:"tailwindcss"

echo.
echo 4. 删除旧的构建目录...
rmdir /s /q .next

echo.
echo 5. 重新构建项目...
npm run build

echo.
echo 6. 提交并推送代码...
git add .
git commit -m "修复：安装 Tailwind CSS 依赖"
git push origin main

echo.
echo ================================
echo      修复完成！
echo ================================
pause