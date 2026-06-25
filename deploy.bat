@echo off
cd /d "%~dp0"

:MENU
cls
echo.
echo  ==========================================
echo   CSFW Purchase System - Deploy Tool
echo  ==========================================
echo.
echo   1. Push to TEST  (dev branch)
echo   2. Release to PROD  (main branch)
echo   3. View version history
echo   4. Rollback production
echo   5. Show current status
echo   6. Exit
echo.
set /p choice= Enter number:

if "%choice%"=="1" goto PUSH_DEV
if "%choice%"=="2" goto PUSH_MAIN
if "%choice%"=="3" goto SHOW_LOG
if "%choice%"=="4" goto ROLLBACK
if "%choice%"=="5" goto STATUS
if "%choice%"=="6" exit
goto MENU

:PUSH_DEV
echo.
echo [Push to TEST - dev branch]
set /p msg= Commit message (e.g. fix search input default value):
git checkout dev 2>nul
git add .
git commit -m "%msg%"
git push origin dev
echo.
echo Done! Check test site in ~1 min:
echo https://dev.csfw-purchase.pages.dev
echo.
pause
goto MENU

:PUSH_MAIN
echo.
echo [Release to PRODUCTION - main branch]
echo Make sure you tested on dev first!
set /p confirm= Confirm release to production? (y/n):
if /i "%confirm%" neq "y" goto MENU
git checkout main
git merge dev
git push origin main
git checkout dev
echo.
echo Done! Production will update in ~1 min:
echo https://csfw-purchase.pages.dev
echo.
pause
goto MENU

:SHOW_LOG
echo.
echo [Version History - last 10 commits]
echo.
git log --oneline --graph -10
echo.
echo The 7-char code on each line (e.g. a3f2c1b) is the version ID for rollback.
echo.
pause
goto MENU

:ROLLBACK
echo.
echo [Rollback Production]
echo.
echo Recent versions on main:
git log origin/main --oneline -8
echo.
set /p ver= Enter version ID to rollback to (e.g. a3f2c1b):
echo.
echo WARNING: This will revert production (main) to version %ver%
set /p confirm= Confirm rollback? (y/n):
if /i "%confirm%" neq "y" goto MENU
git checkout main
git revert %ver%..HEAD --no-edit
git push origin main
git checkout dev
echo.
echo Rollback done! Production will restore in ~1 min.
echo.
pause
goto MENU

:STATUS
echo.
echo [Current Status]
echo.
echo -- Current branch --
git branch
echo.
echo -- Uncommitted changes --
git status --short
echo.
echo -- Unpushed commits --
git log origin/dev..HEAD --oneline 2>nul || echo (none)
echo.
pause
goto MENU
