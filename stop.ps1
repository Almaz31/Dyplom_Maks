$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $PSScriptRoot 'logs\server.pid'
if (-not (Test-Path -LiteralPath $pidPath)) { Write-Output 'No server PID saved.'; exit 0 }
$serverPid = [int](Get-Content -LiteralPath $pidPath)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
$expectedPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if ($process -and $process.ExecutablePath -eq $expectedPython -and $process.CommandLine -match 'uvicorn.*backend.main:app') {
    # The Windows virtualenv launcher can keep the actual Python server as a child.
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $serverPid"
    foreach ($child in $children) {
        if ($child.CommandLine -match 'uvicorn.*backend.main:app') { Stop-Process -Id $child.ProcessId }
    }
    Stop-Process -Id $serverPid
    Write-Output 'Server stopped.'
} else { Write-Output 'The saved process is not this server; nothing stopped.' }
