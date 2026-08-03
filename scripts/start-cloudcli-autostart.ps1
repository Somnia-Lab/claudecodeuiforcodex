$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$cloudcliCmd = Join-Path $env:APPDATA 'npm\cloudcli.cmd'
$codexCliPath = Join-Path $env:LOCALAPPDATA 'Programs\OpenAI\Codex\bin\codex.exe'
$logDir = Join-Path $env:LOCALAPPDATA 'CloudCLI'
$stdoutLog = Join-Path $logDir 'autostart.out.log'
$stderrLog = Join-Path $logDir 'autostart.err.log'

if (-not (Test-Path -LiteralPath $cloudcliCmd)) {
  throw "cloudcli.cmd not found at $cloudcliCmd"
}

if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$existingListener = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq 'Listen' -and $_.OwningProcess -ne 0 } |
  Select-Object -First 1

if ($existingListener) {
  exit 0
}

if (Test-Path -LiteralPath $codexCliPath) {
  $env:CODEX_CLI_PATH = $codexCliPath
}
$env:PATH = "$($env:APPDATA)\npm;$env:PATH"

Start-Process `
  -FilePath $cloudcliCmd `
  -ArgumentList @('start', '--port', '3001') `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog
