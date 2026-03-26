$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$pm2Cmd = Join-Path $env:APPDATA 'npm\pm2.cmd'
$nginxExe = 'C:\nginx\nginx.exe'

if (-not (Test-Path $pm2Cmd)) {
  throw "pm2.cmd not found at $pm2Cmd"
}

if (-not (Test-Path $nginxExe)) {
  throw "nginx.exe not found at $nginxExe"
}

Set-Location $projectRoot

$pm2List = & $pm2Cmd jlist 2>$null
$hasApp = $false

if ($pm2List) {
  try {
    $apps = $pm2List | ConvertFrom-Json
    $hasApp = @($apps | Where-Object { $_.name -eq 'crm-dashboard' }).Count -gt 0
  } catch {
    $hasApp = $false
  }
}

if ($hasApp) {
  & $pm2Cmd resurrect | Out-Null
} else {
  & $pm2Cmd start ecosystem.config.js | Out-Null
  & $pm2Cmd save | Out-Null
}

$nginxRunning = Get-Process -Name 'nginx' -ErrorAction SilentlyContinue
if (-not $nginxRunning) {
  Start-Process -FilePath $nginxExe -WorkingDirectory 'C:\nginx'
}

Write-Host 'CRM services startup completed.'
