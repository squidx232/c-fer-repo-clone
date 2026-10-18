# Runs original loader/readiness probes, NOT a complete simulation.
# Requires authorized vendor files, Windows, .NET 8 SDK and Desktop Runtime.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ApplicationDirectory,
    [string]$OutputDirectory = "",
    [int]$TimeoutSeconds = 120
)
$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "This runner requires Windows and WPF; it cannot enable WPF on Linux." }
if ($TimeoutSeconds -lt 1) { throw "TimeoutSeconds must be positive." }
$Root = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $Root ".local-analysis\windows-readiness" }
$ApplicationDirectory = (Resolve-Path $ApplicationDirectory).Path
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$LocalTools = [System.IO.Path]::GetFullPath((Join-Path $Root ".local-analysis"))
if (-not $OutputDirectory.StartsWith($LocalTools + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must be inside this workspace's .local-analysis directory."
}
foreach ($file in @("pcpump.engine.dll", "pcpump.data.dll", "pcpump.binary.dll", "pcpump.dll", "equipment.db", "ss_1.pcp")) {
    if (-not (Test-Path (Join-Path $ApplicationDirectory $file))) { throw "Missing application dependency: $file" }
}
$Dotnet = (Get-Command dotnet -ErrorAction Stop).Source
$runtimes = & $Dotnet --list-runtimes
if ($LASTEXITCODE -ne 0 -or -not ($runtimes -match 'Microsoft.WindowsDesktop.App 8\.')) {
    throw "Install the .NET 8 Windows Desktop Runtime before running this probe."
}
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$env:DOTNET_CLI_HOME = Join-Path $LocalTools "home"
$env:NUGET_PACKAGES = Join-Path $LocalTools "nuget"
$Build = Join-Path $OutputDirectory "build"
$Objects = (Join-Path $OutputDirectory "obj") + [System.IO.Path]::DirectorySeparatorChar
& $Dotnet build (Join-Path $PSScriptRoot "engine-probe\EngineProbe.csproj") -p:ProbeWindows=true "-p:BaseIntermediateOutputPath=$Objects" -o $Build
if ($LASTEXITCODE -ne 0) { throw "Probe build failed." }
$Results = Join-Path $OutputDirectory "results"
$arguments = '"' + (Join-Path $Build 'EngineProbe.dll') + '" "' + $ApplicationDirectory + '" "' + $Results + '"'
$process = Start-Process -FilePath $Dotnet -ArgumentList $arguments -PassThru -NoNewWindow `
    -RedirectStandardOutput (Join-Path $OutputDirectory "stdout.log") `
    -RedirectStandardError (Join-Path $OutputDirectory "stderr.log")
if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    $process.Kill()
    throw "Original loader probe timed out. See logs; no successful execution is implied."
}
$report = Join-Path $Results "runtime-paths.json"
if (-not (Test-Path $report)) { throw "Probe did not produce a readiness report." }
$data = Get-Content -Raw $report | ConvertFrom-Json
foreach ($name in @("catalog", "sampleProject", "desktop")) {
    if ($data.$name.status -ne "success") {
        Write-Warning "$name is blocked. Inspect $report for the original error."
    }
}
Write-Output "Readiness report: $report"
Write-Output "This tests original loaders, not complete well-simulation execution or UI parity."
if ($process.ExitCode -ne 0 -or $data.catalog.status -ne "success" -or $data.sampleProject.status -ne "success" -or $data.desktop.status -ne "success") { exit 1 }
