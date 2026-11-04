# 本机 WSL 开发环境：保持 Ubuntu 运行，启动 PostgreSQL，再启动项目。
$ErrorActionPreference = 'Stop'
$env:SystemRoot = $env:SystemRoot ?? 'C:\Windows'
$env:WINDIR = $env:WINDIR ?? 'C:\Windows'
$wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
$keeper = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'wsl.exe' -and $_.CommandLine -match 'Ubuntu.*sleep.*infinity'
} | Select-Object -First 1
if (-not $keeper) {
    Start-Process -FilePath $wsl -ArgumentList @('-d','Ubuntu','-u','root','--exec','/bin/sleep','infinity') -WindowStyle Hidden | Out-Null
}
& $wsl -d Ubuntu -u root --exec /bin/sh -lc 'pg_ctlcluster 16 main start 2>/dev/null || true'
$ready = $false
for ($attempt = 0; $attempt -lt 12; $attempt++) {
    & $wsl -d Ubuntu -u root --exec pg_isready -h 127.0.0.1 -p 5432 *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'PostgreSQL 未就绪，请检查 Ubuntu WSL 中的 16/main 集群。' }
Push-Location $PSScriptRoot
try { npm.cmd run dev } finally { Pop-Location }
