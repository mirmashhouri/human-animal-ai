param([string]$AppPoolName = 'WildfieApi')
$ErrorActionPreference = 'Stop'
$wildfieCards = 'C:\ProgramData\Wildfie\cards'
New-Item -ItemType Directory -Path $wildfieCards -Force | Out-Null
& icacls.exe $wildfieCards /grant ('IIS AppPool\' + $AppPoolName + ':(OI)(CI)M') /T /Q
if ($LASTEXITCODE -ne 0) { throw 'Could not grant access. Check the application-pool name and run this script as administrator.' }
Write-Host 'Card folder ready: C:\ProgramData\Wildfie\cards. Existing cards were preserved.'
