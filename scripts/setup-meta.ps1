param([switch]$CreditConfirmed, [switch]$EnablePaidRequests)
$ErrorActionPreference = 'Stop'
$wildlensRoot = Split-Path -Parent $PSScriptRoot
$wildlensEnv = Join-Path $wildlensRoot 'server\Kinform.Api\.env'
if (Test-Path -LiteralPath $wildlensEnv) {
    Write-Host 'Server .env already exists. Edit that file to change the Meta settings; nothing was overwritten.'
    return
}
if ($EnablePaidRequests -and -not $CreditConfirmed) { throw 'Confirm your credit or intended billing arrangement before enabling paid requests.' }
$wildlensSecret = Read-Host 'Replacement Meta Model API key (hidden)' -AsSecureString
$wildlensPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($wildlensSecret)
try {
    $wildlensKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($wildlensPointer)
    if ([string]::IsNullOrWhiteSpace($wildlensKey) -or $wildlensKey -match '[\s"'']') { throw 'The key is empty or has unsupported whitespace/quote characters.' }
    $wildlensLines = @(
        '# Server-only local credential. Do not commit or share this file.'
        "MODEL_API_KEY=$wildlensKey"
        'META_VISION_MODEL=muse-spark-1.3'
        'META_SEGMENTATION_MODEL=sam-3.1'
        'META_IMAGE_MODEL=muse-image-1.0'
        "META_CREDIT_CONFIRMED=$($CreditConfirmed.IsPresent.ToString().ToLowerInvariant())"
        "META_ENABLE_PAID_REQUESTS=$($EnablePaidRequests.IsPresent.ToString().ToLowerInvariant())"
        'AI_MODE=Demo'
        'AI_ENABLE_PAID_REQUESTS=false'
    )
    [IO.File]::WriteAllLines($wildlensEnv, $wildlensLines, [Text.UTF8Encoding]::new($false))
    Write-Host 'Created the server settings. Restart the API to load them. No API request was made.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($wildlensPointer)
    $wildlensKey = $null; $wildlensLines = $null; $wildlensSecret.Dispose()
}
