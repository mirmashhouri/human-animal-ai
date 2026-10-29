# Explicit, bounded live compatibility check. Uses the app's configured Meta credentials, never prints them.
$ErrorActionPreference = 'Stop'
$wildlensTarget = Split-Path -Parent $PSScriptRoot
$wildlensReady = Invoke-RestMethod -Uri 'http://localhost:5086/api/wildlens/config' -TimeoutSec 10
if (-not $wildlensReady.liveReady) { Write-Output 'Skipped: Meta access is not ready. No model requests made.'; exit 0 }
if (Get-NetTCPConnection -LocalPort 5098 -State Listen -ErrorAction SilentlyContinue) { throw 'The live-check port is already in use.' }
$wildlensManifest = Get-Content -LiteralPath (Join-Path $wildlensTarget 'evaluation\private\starter-portraits\manifest.json') -Raw | ConvertFrom-Json
$wildlensFixture = Join-Path $wildlensTarget ('.artifacts\live-memory-contract-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $wildlensFixture 'references') -Force | Out-Null
$wildlensReference = Join-Path $wildlensTarget ('evaluation\private\starter-portraits\' + $wildlensManifest[0].file)
Copy-Item -LiteralPath $wildlensReference -Destination (Join-Path $wildlensFixture 'references\contract-reference.jpg')
$wildlensKeys = 'face_ratio,face_roundness,forehead_height,forehead_width,cheek_fullness,jaw_width,chin_pointedness,eye_size,eye_spacing,eye_roundness,eye_projection,brow_thickness,nose_length,nose_width,nose_projection,mouth_width,lip_fullness,smile_curve,tooth_display,ear_prominence'.Split(',')
$wildlensCase = @{
    caseId='synthetic-contract-only'; groupId='synthetic-contract-group'; personPosition='Synthetic compatibility fixture, not a creator judgment';
    reference=@{file='references/contract-reference.jpg';personOnly=$true}; acceptedAnimals=@('Owl'); rejectedAnimals=@();
    selectionCues=@(); creativeMappings=@(); creativeNotes=''; confidence='unspecified'; split='train'; traitScale=5;
    traits=@($wildlensKeys | ForEach-Object { @{key=$_;value=0;visibility='clear';importance=$null;renderInstruction=''} });
    salientFeatures=@(); appearance=@{}; archived=$false; revision=1; syntheticContractFixture=$true
}
$wildlensCase | ConvertTo-Json -Depth 12 -Compress | Set-Content -LiteralPath (Join-Path $wildlensFixture 'preferences.jsonl') -Encoding utf8
@{reference=$wildlensManifest[0];query=$wildlensManifest[1];purpose='Synthetic API compatibility test only; not labels or measured creator agreement'} | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $wildlensFixture 'attribution.json') -Encoding utf8
$wildlensLauncher = Start-Process -FilePath 'dotnet' -ArgumentList @('run','--no-build','--project','server/Kinform.Api','--','--urls','http://localhost:5098','--Teaching:DataRoot',$wildlensFixture) -WorkingDirectory $wildlensTarget -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $wildlensFixture 'api.log') -RedirectStandardError (Join-Path $wildlensFixture 'api-error.log')
try {
    $wildlensStarted=$false
    for ($wildlensAttempt=0;$wildlensAttempt -lt 30;$wildlensAttempt++) {
        try { if ((Invoke-RestMethod -Uri 'http://localhost:5098/health' -TimeoutSec 1).status -eq 'ok') { $wildlensStarted=$true;break } } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $wildlensStarted) { throw 'The isolated live-check API did not start.' }
    $wildlensQuery = Join-Path $wildlensTarget ('evaluation\private\starter-portraits\' + $wildlensManifest[1].file)
    $wildlensPayload = @{imageBase64=[Convert]::ToBase64String([IO.File]::ReadAllBytes($wildlensQuery));consent=$true;segment=$false} | ConvertTo-Json -Compress
    $wildlensResult = Invoke-RestMethod -Uri 'http://localhost:5098/api/wildlens/analyze' -Method Post -ContentType 'application/json' -Body $wildlensPayload -TimeoutSec 240
    $wildlensResult | ConvertTo-Json -Depth 25 | Set-Content -LiteralPath (Join-Path $wildlensFixture 'response.json') -Encoding utf8
    if ($wildlensResult.personalization.status -ne 'used') { throw 'The request completed but did not exercise retrieved context.' }
    $wildlensSummary = @{status='passed';personalized=$wildlensResult.personalization.status;examples=$wildlensResult.personalization.examples;
        segmentation=$wildlensResult.segmentationStatus;promptVersion=$wildlensResult.promptVersion;
        scope='Synthetic compatibility check only; no owner feedback changes, no SAM, no image generation, no retries'}
    $wildlensSummary | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $wildlensTarget '.artifacts\live-memory-contract-summary.json') -Encoding utf8
    $wildlensSummary | ConvertTo-Json
} finally {
    $wildlensOwners = Get-NetTCPConnection -LocalPort 5098 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($wildlensOwner in $wildlensOwners) {
        $wildlensProcess=Get-Process -Id $wildlensOwner
        if ($wildlensProcess.Path.StartsWith((Join-Path $wildlensTarget 'server\Kinform.Api\bin\'),[StringComparison]::OrdinalIgnoreCase)) { Stop-Process -Id $wildlensOwner }
    }
}
