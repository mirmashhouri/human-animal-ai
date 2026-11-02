param([switch]$Background)

$ErrorActionPreference = 'Stop'
$wildlensRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$wildlensArtifacts = Join-Path $wildlensRoot '.artifacts'
$wildlensApiProcess = $null
$wildlensWebProcess = $null
$wildlensKeepApi = [bool]$Background
$wildlensNode = (Get-Command node.exe -ErrorAction Stop).Source
$wildlensNpm = (Get-Command npm.cmd -ErrorAction Stop).Source
$wildlensExpo = Join-Path $wildlensRoot 'node_modules\expo\bin\cli'
$wildlensApiProject = Join-Path $wildlensRoot 'server\Kinform.Api\Kinform.Api.csproj'

function Test-WildLensApi {
    try { return (Invoke-RestMethod -Uri 'http://localhost:5086/api/wildlens/config' -TimeoutSec 2).provider -eq 'Meta Model API' } catch { return $false }
}
function Test-WildLensWeb {
    try {
        $wildlensStatus = (Invoke-WebRequest -Uri 'http://localhost:8093/status' -TimeoutSec 2 -UseBasicParsing).Content
        if ($wildlensStatus -is [byte[]]) { $wildlensStatus = [Text.Encoding]::UTF8.GetString($wildlensStatus) }
        return ([string]$wildlensStatus).Trim() -eq 'packager-status:running'
    } catch { return $false }
}
function Test-WildLensDependencies {
    if (-not (Test-Path -LiteralPath $wildlensExpo)) { return $false }
    try {
        & $wildlensNode -e "for(const p of ['expo/package.json','@expo/cli','@expo/metro-config','react','react-dom/client','react-native-web','react-native-view-shot/package.json'])require.resolve(p,{paths:[process.argv[1]]})" (Join-Path $wildlensRoot 'apps\mobile') 2>$null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}
function Wait-WildLensService([string]$Name, [Diagnostics.Process]$Process, [scriptblock]$Probe) {
    $wildlensDeadline = [DateTime]::UtcNow.AddSeconds(55)
    do {
        if (& $Probe) { return }
        if ($Process.HasExited) { throw "$Name exited. Check its log in .artifacts." }
        Start-Sleep -Milliseconds 400
    } while ([DateTime]::UtcNow -lt $wildlensDeadline)
    throw "$Name did not become ready. Check its log in .artifacts."
}
function Stop-WildLensOwnedApi {
    if ($null -eq $wildlensApiProcess) { return }
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$($wildlensApiProcess.Id)" -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq 'Kinform.Api.exe' -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $wildlensRoot 'server\Kinform.Api\bin\'),[StringComparison]::OrdinalIgnoreCase)
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    if (-not $wildlensApiProcess.HasExited) { Stop-Process -Id $wildlensApiProcess.Id -ErrorAction SilentlyContinue }
}

Push-Location -LiteralPath $wildlensRoot
try {
    $wildlensVersion = [Version]((& $wildlensNode --version).TrimStart('v'))
    if ($wildlensVersion -lt [Version]'22.20.0') { throw 'WildLens requires Node.js 22.20 or later.' }
    Get-Command dotnet -ErrorAction Stop | Out-Null
    New-Item -ItemType Directory -Path $wildlensArtifacts -Force | Out-Null
    if (-not (Test-WildLensDependencies)) {
        if (Test-WildLensWeb) { throw 'Stop the web server before repairing an incomplete dependency installation.' }
        $wildlensModules = [IO.Path]::GetFullPath((Join-Path $wildlensRoot 'node_modules'))
        if (Test-Path -LiteralPath $wildlensModules) {
            $wildlensPreserved = [IO.Path]::GetFullPath((Join-Path $wildlensArtifacts ('npm-install-leftovers-' + [Guid]::NewGuid().ToString('N'))))
            if ($wildlensModules -ne (Join-Path $wildlensRoot 'node_modules') -or -not $wildlensPreserved.StartsWith(($wildlensArtifacts + [IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid dependency recovery path.' }
            Move-Item -LiteralPath $wildlensModules -Destination $wildlensPreserved
            Write-Host 'Preserved the incomplete dependency folder in .artifacts.'
        }
        & $wildlensNpm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0 -or -not (Test-WildLensDependencies)) { throw 'Dependency installation failed. For EBUSY, stop this project in your IDE and retry; your code and teaching data are untouched.' }
    }
    if (Test-WildLensApi) { Write-Host 'Using the running WildLens API.' }
    else {
        $wildlensApiProcess = Start-Process -FilePath 'dotnet' -ArgumentList @('run','--project',('"' + $wildlensApiProject + '"')) -WorkingDirectory $wildlensRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $wildlensArtifacts 'dev-api.log') -RedirectStandardError (Join-Path $wildlensArtifacts 'dev-api-error.log')
        Wait-WildLensService 'WildLens API' $wildlensApiProcess { Test-WildLensApi }
    }
    Write-Host 'Web: http://localhost:8093/   Teaching: http://localhost:8093/teach   API: http://localhost:5086'
    if (Test-WildLensWeb) { $wildlensKeepApi = $true; Write-Host 'Using the running web preview.' }
    elseif ($Background) {
        $wildlensWebProcess = Start-Process -FilePath $wildlensNode -ArgumentList @(('"' + $wildlensExpo + '"'),'start','--web','--port','8093') -WorkingDirectory (Join-Path $wildlensRoot 'apps\mobile') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $wildlensArtifacts 'dev-web.log') -RedirectStandardError (Join-Path $wildlensArtifacts 'dev-web-error.log')
        Wait-WildLensService 'WildLens web preview' $wildlensWebProcess { Test-WildLensWeb }
        Write-Host 'WildLens is ready. Logs are in .artifacts/dev-api.log and .artifacts/dev-web.log.'
    } else {
        Push-Location -LiteralPath (Join-Path $wildlensRoot 'apps\mobile')
        try { & $wildlensNode $wildlensExpo start --web --port 8093; if ($LASTEXITCODE -ne 0) { throw 'The web preview exited with an error.' } }
        finally { Pop-Location }
    }
} catch {
    if ($null -ne $wildlensWebProcess -and -not $wildlensWebProcess.HasExited) { Stop-Process -Id $wildlensWebProcess.Id -ErrorAction SilentlyContinue }
    Stop-WildLensOwnedApi
    throw
} finally {
    if (-not $wildlensKeepApi) { Stop-WildLensOwnedApi }
    Pop-Location
}
