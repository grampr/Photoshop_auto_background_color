param([string]$RequestUri = "localautoharmonize://start")

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$backend = Join-Path $projectRoot "backend"
$modelRepo = Join-Path $projectRoot "vendor\Harmonizer"
$weights = Join-Path $projectRoot "models\harmonizer.pth"
$logRoot = Join-Path $env:LOCALAPPDATA "LocalAutoHarmonize\logs"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Python environment not found: $python"
}

$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\LocalAutoHarmonizeLauncher", [ref]$created)
if (-not $created) { exit 0 }

try {
    if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) { exit 0 }
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $env:HARMONIZER_REPO = $modelRepo
    $env:HARMONIZER_WEIGHTS = $weights
    Start-Process -FilePath $python `
        -ArgumentList "-m", "uvicorn", "--app-dir", $backend, "harmonize_server.main:app", "--host", "127.0.0.1", "--port", "8765" `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logRoot "backend.out.log") `
        -RedirectStandardError (Join-Path $logRoot "backend.err.log")

    for ($attempt = 0; $attempt -lt 240; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:8765/v1/health" -TimeoutSec 1 | Out-Null
            exit 0
        } catch { }
    }
    throw "Backend did not become ready within 120 seconds. See $logRoot"
} finally {
    if ($created) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
