<#
.SYNOPSIS
  평일 오전 10시, 소통메신저 문서 + 업무일지를 분석해 오늘의 할일(Firestore todos)을 생성합니다.
  Windows 작업 스케줄러("상당고 오늘의 할일 생성")가 이 스크립트를 호출합니다.
#>

$ErrorActionPreference = 'Stop'
$ProjectRoot = Resolve-Path "$PSScriptRoot\.."
$LogFile = Join-Path $PSScriptRoot 'run_daily_todos.log'

function Write-Log([string]$message) {
    Add-Content -LiteralPath $LogFile -Value ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $message) -Encoding UTF8
}

Push-Location $ProjectRoot
try {
    Write-Log '=== generate_daily_todos START ==='
    $output = & node --env-file=.env scripts/generate_daily_todos.mjs 2>&1
    $output | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Log "FAILED (exit code $LASTEXITCODE)"
    } else {
        Write-Log '=== DONE ==='
    }
} catch {
    Write-Log "EXCEPTION: $($_.Exception.Message)"
} finally {
    Pop-Location
}
