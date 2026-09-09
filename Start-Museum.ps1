<#
  Run from PowerShell with: & '.\Start-Museum.ps1'
  The .cmd launcher works without changing PowerShell's execution policy.
#>
[CmdletBinding()]
param(
  [ValidateRange(1, 65535)][int]$Port = 4173,
  [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'The museum requires Node.js 20 or newer. Install it from https://nodejs.org/ and reopen this launcher.'
  exit 1
}
$museumServer = Join-Path -Path $PSScriptRoot -ChildPath 'tools/serve.mjs'
$museumArguments = @($museumServer, '--port', $Port.ToString())
if ($NoOpen) { $museumArguments += '--no-open' }
& node @museumArguments
exit $LASTEXITCODE
