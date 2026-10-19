<#
.SYNOPSIS
Read-only prerequisites check for normal vendor licensing on an authorized Windows host.
.DESCRIPTION
Does not activate software, export catalogs, read license secrets, or change firewall/
Sentinel settings. Reachability is not proof of activation or catalog access.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ApplicationDirectory,
  [string]$LicenseServer,
  [ValidateRange(0,65535)][int]$LicensePort = 0,
  [string]$OutputPath = (Join-Path $PWD 'catalog-host-readiness.json')
)
$ErrorActionPreference = 'Stop'
$app = (Resolve-Path -LiteralPath $ApplicationDirectory).Path
$fullOutput = [System.IO.Path]::GetFullPath($OutputPath)
if ($fullOutput.StartsWith($app.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Write diagnostics outside the installed application directory.'
}
if (Test-Path -LiteralPath $fullOutput) { throw 'Use a new OutputPath; refusing to overwrite an existing file.' }
if ($PSBoundParameters.ContainsKey('LicensePort') -and (-not $LicenseServer -or $LicensePort -eq 0)) {
  throw 'LicensePort requires an explicit authorized LicenseServer.'
}
function FileInfoRecord([string]$relative) {
  $file = Join-Path $app $relative
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    return @{ relativePath=$relative; present=$false }
  }
  $item = Get-Item -LiteralPath $file
  return @{ relativePath=$relative; present=$true; bytes=$item.Length;
    sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$network = $null
if ($LicenseServer -and $PSBoundParameters.ContainsKey('LicensePort')) {
  # One explicitly supplied endpoint only; no subnet/broadcast scan.
  $network = @{ server=$LicenseServer; port=$LicensePort;
    tcpReachable=[bool](Test-NetConnection -ComputerName $LicenseServer -Port $LicensePort -InformationLevel Quiet -WarningAction SilentlyContinue) }
}
$report = [ordered]@{
  schemaVersion=1
  scope='read-only deployment/connectivity check; NOT activation, catalog extraction or simulation'
  files=@(@('PcPump.exe','PcPump.dll','PcPump.runtimeconfig.json','Database\equipment.db','Database_Educational\equipment.db') | ForEach-Object { FileInfoRecord $_ })
  sentinelService=@(Get-Service -Name 'hasplms' -ErrorAction SilentlyContinue | Select-Object Name,Status)
  dotnetRuntimes=@()
  explicitNetworkEndpoint=$network
  licenseActivated=$null
  manufacturerCatalogOpened=$false
  manufacturerRecordsExported=0
  nextStep='Use original Key Management UI with a valid local key or authorized license server; no automated activation performed.'
}
if (Get-Command dotnet -ErrorAction SilentlyContinue) {
  $report.dotnetRuntimes=@(& dotnet --list-runtimes)
}
$json = $report | ConvertTo-Json -Depth 8
$json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output $json
