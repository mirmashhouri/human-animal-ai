$ErrorActionPreference = 'Stop'
$wildlensRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $wildlensRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules\expo')) { & npm.cmd install; if ($LASTEXITCODE) { throw 'Dependency installation failed.' } }
    $wildlensServer = Start-Process -FilePath 'dotnet' -ArgumentList @('run', '--project', 'server/Kinform.Api') -WorkingDirectory $wildlensRoot -WindowStyle Hidden -PassThru
    try { & npm.cmd run web } finally { if (-not $wildlensServer.HasExited) { Stop-Process -Id $wildlensServer.Id -ErrorAction SilentlyContinue } }
} finally { Pop-Location }
