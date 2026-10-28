$ErrorActionPreference = 'Stop'
$wildlensRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command muse -ErrorAction SilentlyContinue)) {
    Write-Host 'Muse Code is not installed. Official Windows installation:'
    Write-Host 'https://dev.meta.ai/docs/muse-code'
    Write-Host 'After installing and signing in, rerun this script. Installation and sign-in are separate from configuring the app.'
    exit 1
}
Push-Location -LiteralPath $wildlensRoot
try { & muse } finally { Pop-Location }
