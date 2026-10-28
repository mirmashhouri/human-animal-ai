[CmdletBinding()]
param([switch]$NoOpen)

$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskSettingsPath = Join-Path $taskRepo 'server\Kinform.Api\.env'

# Initializes only a missing file; preserves the previously entered key without printing it.
if (-not (Test-Path -LiteralPath $taskSettingsPath)) {
    & dotnet run --project (Join-Path $taskRepo 'server\Kinform.Api') -- --init-env
    if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the backend .env file.' }
}

Write-Output "Server-only settings: $taskSettingsPath"
Write-Output 'Use OPENAI_API_KEY for your OpenAI project key. Do not paste it into chat.'
Write-Output 'Set AI_ENABLE_PAID_REQUESTS=true only when ready for billed comparisons.'
Write-Output 'Restart the .NET API and refresh the browser after editing. Samples stay local.'
Write-Output 'The .env is git-ignored, but remains plaintext and may sync through OneDrive.'
if (-not $NoOpen) {
    & code --reuse-window $taskSettingsPath
    if ($LASTEXITCODE -ne 0) { throw 'Open the settings path above in your editor.' }
}
