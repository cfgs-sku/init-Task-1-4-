@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ╔══════════════════════════════════════════╗
echo ║   初始化测试环境（只需运行一次）           ║
echo ╚══════════════════════════════════════════╝
echo.

REM ── 1. 创建独立测试 D1 数据库
echo [1/3] 创建测试数据库 cfgs-purchase-db-dev ...
wrangler d1 create cfgs-purchase-db-dev

echo.
echo ⚠️  请将上方输出的 database_id 填入 wrangler.dev.toml 的 REPLACE_WITH_DEV_DB_ID
echo 填好后按任意键继续...
pause >nul

REM ── 2. 在测试库执行建表 SQL（与生产库相同结构）
echo [2/3] 初始化测试库表结构 ...
wrangler d1 execute cfgs-purchase-db-dev --remote --file="cloudflare/schema.sql"

REM ── 3. 创建 dev git 分支
echo [3/3] 创建 dev 开发分支 ...
git checkout -b dev 2>nul || git checkout dev
git push -u origin dev 2>nul

echo.
echo ✅ 测试环境就绪！
echo    测试网址：Cloudflare Pages 会为 dev 分支自动生成预览 URL
echo    格式类似：https://dev.csfw-purchase.pages.dev
pause
