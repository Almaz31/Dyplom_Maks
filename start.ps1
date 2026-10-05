$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$pythonPath = Join-Path $appRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Run setup.ps1 first.' }
if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'frontend\dist\index.html'))) { throw 'Run setup.ps1 first to build the frontend.' }
try {
    $status = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
    if ($status.status -eq 'ok') { Write-Output 'Already running: http://localhost:8000'; exit 0 }
} catch {}
$logDir = Join-Path $appRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$server = Start-Process -FilePath $pythonPath -ArgumentList '-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8000' -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log') -PassThru
$server.Id | Set-Content -LiteralPath (Join-Path $logDir 'server.pid')
for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 300
    try {
        $status = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 1
        if ($status.status -eq 'ok') { Write-Output 'Ready: http://localhost:8000'; exit 0 }
    } catch {}
}
throw 'Server did not start. Check logs/server-error.log.'
