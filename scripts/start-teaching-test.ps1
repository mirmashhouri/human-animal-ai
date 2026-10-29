$ErrorActionPreference = 'Stop'
$wildlensRoot = Split-Path -Parent $PSScriptRoot
$wildlensOwners = Get-NetTCPConnection -LocalPort 5097 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($wildlensOwner in $wildlensOwners) {
    $wildlensProcess = Get-Process -Id $wildlensOwner
    $wildlensDetails = Get-CimInstance Win32_Process -Filter "ProcessId=$wildlensOwner"
    if (-not $wildlensProcess.Path.StartsWith((Join-Path $wildlensRoot 'server\Kinform.Api\bin\'), [StringComparison]::OrdinalIgnoreCase) -or
        -not $wildlensDetails.CommandLine.Contains('--Teaching:DataRoot') -or -not $wildlensDetails.CommandLine.Contains('.artifacts')) {
        throw 'An unrelated process owns the test port. It was not stopped.'
    }
    Stop-Process -Id $wildlensOwner
}
$wildlensTestRoot = Join-Path $wildlensRoot ('.artifacts\teaching-browser-' + [Guid]::NewGuid().ToString('N'))
if (-not [IO.Path]::GetFullPath($wildlensTestRoot).StartsWith((Join-Path $wildlensRoot '.artifacts\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid test folder.' }
New-Item -ItemType Directory -Path (Join-Path $wildlensTestRoot 'references') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $wildlensTestRoot 'studio\runs') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $wildlensRoot 'evaluation\private\preferences.jsonl') -Destination (Join-Path $wildlensTestRoot 'preferences.jsonl')
Get-ChildItem -LiteralPath (Join-Path $wildlensRoot 'evaluation\private\references') -Filter '*.jpg' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $wildlensTestRoot 'references') }
Get-ChildItem -LiteralPath (Join-Path $wildlensRoot 'evaluation\private\studio\runs') -Filter '*.json' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $wildlensTestRoot 'studio\runs') }
$wildlensServer = Start-Process -FilePath 'dotnet' -ArgumentList @('run', '--no-build', '--project', 'server/Kinform.Api', '--', '--urls', 'http://localhost:5097', '--Teaching:DataRoot', $wildlensTestRoot,
    '--WildLens:EnablePaidRequests', 'false', '--WildLens:CreditConfirmed', 'false', '--WildLens:ApiKey', 'test-only-key', '--Ai:Mode', 'Demo', '--Ai:EnablePaidRequests', 'false') -WorkingDirectory $wildlensRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $wildlensRoot '.artifacts\teaching-test-api.log') -RedirectStandardError (Join-Path $wildlensRoot '.artifacts\teaching-test-api-error.log')
$wildlensReady = $false
for ($wildlensAttempt = 0; $wildlensAttempt -lt 30; $wildlensAttempt++) {
    if ($wildlensServer.HasExited) { throw 'The isolated API exited before becoming ready. Check teaching-test-api-error.log.' }
    try { if ((Invoke-RestMethod -Uri 'http://localhost:5097/health' -TimeoutSec 1).status -eq 'ok') { $wildlensReady = $true; break } } catch { }
    Start-Sleep -Milliseconds 200
}
if (-not $wildlensReady) { throw 'The isolated teaching API did not become ready.' }
Write-Output "Isolated test API started: process $($wildlensServer.Id); fixture folder $wildlensTestRoot. Model calls disabled."
