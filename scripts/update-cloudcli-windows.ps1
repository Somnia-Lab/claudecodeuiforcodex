[CmdletBinding()]
param(
  [string]$Branch = 'main',
  [string]$TaskName = 'CloudCLI UI Autostart',
  [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$databasePath = Join-Path $env:USERPROFILE '.cloudcli\auth.db'
$backupRoot = Join-Path $env:USERPROFILE '.cloudcli\backups'
$defaultNodeHome = Join-Path $env:LOCALAPPDATA 'Programs\nodejs-lts'
$nodeHome = if ($env:CLOUDCLI_NODE_HOME) { $env:CLOUDCLI_NODE_HOME } else { $defaultNodeHome }
$portableNode = Join-Path $nodeHome 'node.exe'
$portableNpm = Join-Path $nodeHome 'npm.cmd'

if ((Test-Path -LiteralPath $portableNode) -and (Test-Path -LiteralPath $portableNpm)) {
  $env:PATH = "$nodeHome;$env:PATH"
  $npmCommand = $portableNpm
} else {
  $npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command exited with code $LASTEXITCODE"
  }
}

function Stop-CloudCli {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -gt 0 } |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

function Start-CloudCli {
  Start-ScheduledTask -TaskName $TaskName
}

Set-Location $projectRoot

$nodeVersion = & node.exe --version
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to run Node.js.'
}
Write-Host "Using Node.js $nodeVersion from $((Get-Command node.exe -ErrorAction Stop).Source)"

$dirtyFiles = @(git status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to inspect the CloudCLI Git worktree.'
}
if ($dirtyFiles.Count -gt 0) {
  throw "CloudCLI has local changes. Preserve or commit them before updating.`n$($dirtyFiles -join "`n")"
}

$serviceStopped = $false
try {
  Stop-CloudCli
  $serviceStopped = $true

  if (Test-Path -LiteralPath $databasePath) {
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backupDir = Join-Path $backupRoot $timestamp
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    foreach ($suffix in @('', '-wal', '-shm')) {
      $sourcePath = "$databasePath$suffix"
      if (Test-Path -LiteralPath $sourcePath) {
        Copy-Item -LiteralPath $sourcePath -Destination $backupDir -Force
      }
    }
    Write-Host "CloudCLI database backup: $backupDir"
  }

  Invoke-Checked git fetch origin --prune
  Invoke-Checked git merge --ff-only "origin/$Branch"
  Invoke-Checked $npmCommand install
  Invoke-Checked $npmCommand run build
  Invoke-Checked $npmCommand link

  Start-CloudCli
  $serviceStopped = $false

  $healthUrl = "http://127.0.0.1:$Port/api/health"
  $healthy = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
      if ($response.StatusCode -eq 200) {
        $healthy = $true
        break
      }
    } catch {
    }
    Start-Sleep -Seconds 1
  }

  if (-not $healthy) {
    throw "CloudCLI did not become healthy at $healthUrl"
  }

  Invoke-Checked cloudcli.cmd --version
  Write-Host "CloudCLI update complete on port $Port."
} catch {
  if ($serviceStopped) {
    try {
      Start-CloudCli
    } catch {
    }
  }
  throw
}
