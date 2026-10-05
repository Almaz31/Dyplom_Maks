$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path '.venv\Scripts\python.exe')) {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Python environment failed.' }
    }
    & '.\.venv\Scripts\python.exe' -m pip install -r backend/requirements-lock.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python dependencies failed.' }
    Push-Location frontend
    try {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
    Write-Output 'Setup complete. Run .\start.ps1'
} finally { Pop-Location }
