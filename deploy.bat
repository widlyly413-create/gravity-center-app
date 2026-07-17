@echo off
cd /d "D:\Gemini_Projects\gravity-center-app"
echo ================================
echo      检查当前目录
echo ================================
cd
echo.

echo ================================
echo      检查 Git 状态
echo ================================
if not exist ".git" (
  echo 初始化 Git 仓库...
  git init
  git config user.email "user@example.com"
  git config user.name "User"
  git remote add origin https://github.com/widlyly413-create/gravity-center-app.git
  git branch -M main
) else (
  echo Git 仓库已存在
)
echo.

echo ================================
echo      安装依赖
echo ================================
npm install
echo.

echo ================================
echo      构建项目
echo ================================
npm run build
echo.

echo ================================
echo      提交并推送
echo ================================
git add .
git commit -m "UI优化：专业级低饱和度配色与交互体验"
git push -u origin main
echo.

echo ================================
echo      部署完成！
echo ================================
pause