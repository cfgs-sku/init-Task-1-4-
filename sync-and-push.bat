@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================
echo  城服物资系统 - 云端同步 ^& 推送
echo ===================================
echo.

REM ── 1. 同步 embed-data.js（如果 dist 版本存在则覆盖根目录）
if exist "dist\embed-data.js" (
  copy /Y "dist\embed-data.js" "embed-data.js" >nul
  echo [1/4] embed-data.js 已更新
) else (
  echo [1/4] dist\embed-data.js 不存在，跳过
)

REM ── 2. 更新 D1 项目名（按需执行，可注释掉）
REM echo [2/4] 更新 D1 项目名...
REM wrangler d1 execute cfgs-purchase-db --remote --command="UPDATE projects SET name='雄安城服物业项目' WHERE id='proj_gc'"

echo [2/4] D1 更新已跳过（如需执行请取消上方注释）

REM ── 3. Git 提交
echo [3/4] 提交变更到 dev 分支...
git checkout dev 2>nul || git checkout -b dev
git add -A

REM 获取当前时间作为提交信息后缀
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set D=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ("%time%") do set T=%%a:%%b

set /p MSG="输入提交说明（直接回车使用默认）: "
if "%MSG%"=="" set MSG=sync: 云端同步 ^& 代码更新 %D% %T%

git commit -m "%MSG%"

REM ── 4. 推送到远程
echo [4/4] 推送到 GitHub...
git push origin dev

echo.
echo ✅ 完成！Cloudflare Pages 将自动重新部署。
pause
