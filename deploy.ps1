# 城服采购系统 - Git 操作工具
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "城服采购系统 - 部署工具"

Set-Location $PSScriptRoot

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "=========================================="
    Write-Host "   城服采购系统 - Git 操作工具"
    Write-Host "=========================================="
    Write-Host ""
    Write-Host "  [1] 推送到测试环境 (dev)"
    Write-Host "  [2] 测试通过，发布到生产 (main)"
    Write-Host "  [3] 查看版本历史"
    Write-Host "  [4] 回滚生产到指定版本"
    Write-Host "  [5] 查看当前状态"
    Write-Host "  [6] 退出"
    Write-Host ""
}

function Push-Dev {
    Write-Host ""
    Write-Host "--- 推送到测试环境 ---"
    $msg = Read-Host "请输入本次改动说明（例如：修复搜索框默认值问题）"
    git checkout dev 2>$null
    git add .
    git commit -m $msg
    git push origin dev
    Write-Host ""
    Write-Host "完成！约1分钟后可在测试环境验证："
    Write-Host "https://dev.csfw-purchase.pages.dev"
    Write-Host ""
    Read-Host "按回车返回菜单"
}

function Push-Main {
    Write-Host ""
    Write-Host "--- 发布到生产环境 ---"
    Write-Host "注意：请确认已在测试环境验证通过！"
    $confirm = Read-Host "确认发布到生产？(y/n)"
    if ($confirm -ne "y") { return }
    git checkout main
    git merge dev
    git push origin main
    git checkout dev
    Write-Host ""
    Write-Host "完成！约1分钟后生产环境更新："
    Write-Host "https://csfw-purchase.pages.dev"
    Write-Host ""
    Read-Host "按回车返回菜单"
}

function Show-Log {
    Write-Host ""
    Write-Host "--- 版本历史（最近10条）---"
    Write-Host ""
    git log --oneline --graph -10
    Write-Host ""
    Write-Host "说明：每行的字母数字组合（如 a3f2c1b）是版本ID，回滚时需要用到"
    Write-Host ""
    Read-Host "按回车返回菜单"
}

function Invoke-Rollback {
    Write-Host ""
    Write-Host "--- 回滚生产到指定版本 ---"
    Write-Host ""
    Write-Host "main 分支最近几个版本："
    git log origin/main --oneline -8
    Write-Host ""
    $version = Read-Host "输入要回滚到的版本ID（7位字母数字，例如 a3f2c1b）"
    Write-Host ""
    Write-Host "警告：即将把生产(main)回滚到版本 $version"
    $confirm = Read-Host "确认回滚？(y/n)"
    if ($confirm -ne "y") { return }
    git checkout main
    git revert "$version..HEAD" --no-edit
    git push origin main
    git checkout dev
    Write-Host ""
    Write-Host "回滚完成！生产环境将在约1分钟后恢复"
    Write-Host ""
    Read-Host "按回车返回菜单"
}

function Show-Status {
    Write-Host ""
    Write-Host "--- 当前所在分支 ---"
    git branch
    Write-Host ""
    Write-Host "--- 未提交的改动 ---"
    git status --short
    Write-Host ""
    Write-Host "--- 未推送到远程的提交 ---"
    $unpushed = git log origin/dev..HEAD --oneline 2>$null
    if ($unpushed) { $unpushed } else { Write-Host "（无未推送的提交）" }
    Write-Host ""
    Read-Host "按回车返回菜单"
}

# 主循环
while ($true) {
    Show-Menu
    $choice = Read-Host "请输入数字选择操作"
    switch ($choice) {
        "1" { Push-Dev }
        "2" { Push-Main }
        "3" { Show-Log }
        "4" { Invoke-Rollback }
        "5" { Show-Status }
        "6" { exit }
        default { Write-Host "无效输入，请重试"; Start-Sleep 1 }
    }
}
