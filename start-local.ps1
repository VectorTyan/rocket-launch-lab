[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskExitCode = 0
$taskLocationPushed = $false

try {
    $taskNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $taskNpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue

    if (-not $taskNodeCommand -or -not $taskNpmCommand) {
        throw '未找到 Node.js 或 npm。请先安装 Node.js，重新打开终端后再运行此脚本。'
    }

    Push-Location -LiteralPath $PSScriptRoot
    $taskLocationPushed = $true

    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'package.json') -PathType Leaf)) {
        throw '项目目录中缺少 package.json，请从完整的项目目录运行。'
    }

    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules') -PathType Container)) {
        Write-Host '首次运行：正在按 package-lock.json 安装依赖……' -ForegroundColor Cyan
        & $taskNpmCommand.Source ci
        if ($LASTEXITCODE -ne 0) {
            throw ('依赖安装失败（退出码 {0}），启动已停止。请检查上方错误后重试。' -f $LASTEXITCODE)
        }
    }

    Write-Host ''
    Write-Host '正在启动小小火箭工程师……' -ForegroundColor Cyan
    Write-Host '待服务就绪后，在浏览器中手动打开：http://127.0.0.1:5173'
    Write-Host '保持此窗口运行；按 Ctrl+C 停止。端口被占用时会退出，不会自动换端口。'
    Write-Host ''

    & $taskNpmCommand.Source run dev -- --port 5173 --strictPort
    if ($LASTEXITCODE -ne 0) {
        $taskExitCode = $LASTEXITCODE
        Write-Host ('本地服务已退出（退出码 {0}）。请查看上方错误；若端口被占用，请关闭占用端口的服务后重试。' -f $taskExitCode) -ForegroundColor Red
    }
}
catch {
    $taskExitCode = 1
    Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
    if ($taskLocationPushed) {
        Pop-Location
    }
}

exit $taskExitCode
