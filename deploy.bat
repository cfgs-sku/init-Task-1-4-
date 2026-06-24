@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ╔══════════════════════════════════════════╗
echo ║   城服物资采购系统 — 一键构建 ^& 部署      ║
echo ╚══════════════════════════════════════════╝
echo.

REM ── 步骤 1：构建 dist/portal.html（内联所有 JS）
echo [1/4] 构建 portal.html ...
node scripts/build-portal.js
if errorlevel 1 ( echo ❌ 构建失败 & pause & exit /b 1 )

REM ── 步骤 2：Git 提交
echo.
echo [2/4] 提交代码到 dev 分支 ...
git checkout dev 2>nul || git checkout -b dev
git add -A

set /p MSG="提交说明（回车使用时间戳）: "
if "%MSG%"=="" (
  for /f "tokens=2 delims==" %%i in ('wmic os get localdatetime /value') do set DT=%%i
  set MSG=deploy: 自动构建部署 !DT:~0,12!
)
git commit -m "%MSG%" 2>nul
if errorlevel 1 ( echo ℹ️  没有新变更需要提交，继续... )

REM ── 步骤 3：推送 GitHub（触发 Cloudflare 自动部署）
echo.
echo [3/4] 推送到 GitHub (dev 分支) ...
git push origin dev
if errorlevel 1 ( echo ❌ Git push 失败，请检查网络或权限 & pause & exit /b 1 )

REM ── 步骤 4：直接部署 dist 到 Cloudflare Pages（可选，双保险）
echo.
echo [4/4] 部署 dist/ 到 Cloudflare Pages ...
wrangler pages deploy dist --project-name csfw-purchase
if errorlevel 1 (
  echo ⚠️  wrangler deploy 失败，但 GitHub push 已完成，Cloudflare 会自动部署。
)

echo.
echo ══════════════════════════════════════════
echo ✅ 完成！
echo    云端地址：https://csfw-purchase.pages.dev/portal.html
echo    采购员可通过上方链接登录下单，数据自动存入云端数据库。
echo ══════════════════════════════════════════
pause
