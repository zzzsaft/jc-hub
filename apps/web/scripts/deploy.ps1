param(
  # Example:
  # powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -NasHost "hz.jc-times.com" -NasUser "zzzsaft"
  [string]$NasHost = "hz.jc-times.com",
  [int]$SshPort = 24,
  [string]$NasUser = "zzzsaft",
  [string]$RemoteAppDir = "/volume1/docker/react-app",
  [string]$BuildCommand = "npm run build",
  [string]$ContainerName = "",
  [switch]$SkipBuild,
  [switch]$Preflight,
  [bool]$LegacyScp = $true,
  [switch]$NoSshMultiplex
)

$ErrorActionPreference = "Stop"

function Require-Value {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing $Name. Edit scripts/deploy.ps1 or pass -$Name when running deploy."
  }
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' was not found. Install/enable it first and try again."
  }
}

Require-Value "NasHost" $NasHost
Require-Value "NasUser" $NasUser
Require-Value "RemoteAppDir" $RemoteAppDir
Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DistDir = Join-Path $ProjectRoot "dist"
$PackageDir = Join-Path $ProjectRoot ".dist"
$ArchivePath = Join-Path $PackageDir "dist.tar.gz"
$RemoteScriptLocalPath = Join-Path $PackageDir "remote-deploy.sh"
$Target = "${NasUser}@${NasHost}"
$RemoteArchive = "$RemoteAppDir/dist.tar.gz"
$RemoteScriptPath = "$RemoteAppDir/.deploy-remote.sh"

Set-Location $ProjectRoot
New-Item -ItemType Directory -Force -Path $PackageDir | Out-Null

$SshBaseArgs = @()
$ScpBaseArgs = @()
$SshPortArgs = @("-p", "$SshPort")
$ScpPortArgs = @("-P", "$SshPort")
$SshMultiplexStarted = $false
$SafeControlName = "${NasUser}_${NasHost}_${SshPort}" -replace '[^a-zA-Z0-9_.-]', '_'
$SshControlPath = Join-Path $PackageDir "ssh-$SafeControlName.sock"
$RunningOnWindows = $PSVersionTable.PSVersion.Major -le 5 -or (
  Get-Variable -Name IsWindows -Scope Global -ErrorAction SilentlyContinue
) -and $IsWindows

trap {
  if ($SshMultiplexStarted) {
    & ssh @SshBaseArgs -O exit $Target 2>$null | Out-Null
  }
  throw
}

if ($RunningOnWindows -and -not $NoSshMultiplex) {
  Write-Host "Skipping SSH connection reuse on Windows OpenSSH."
}

if (-not $NoSshMultiplex -and -not $RunningOnWindows) {
  Write-Host "Opening reusable SSH connection..."
  $SshBaseArgs = @(
    "-p", "$SshPort",
    "-o", "ControlMaster=auto",
    "-o", "ControlPath=$SshControlPath",
    "-o", "ControlPersist=10m"
  )
  $ScpBaseArgs = @(
    "-P", "$SshPort",
    "-o", "ControlMaster=auto",
    "-o", "ControlPath=$SshControlPath",
    "-o", "ControlPersist=10m"
  )

  & ssh @SshBaseArgs -MNf $Target
  if ($LASTEXITCODE -eq 0) {
    $SshMultiplexStarted = $true
  } else {
    Write-Warning "Could not open reusable SSH connection. Continuing without SSH multiplexing."
    $SshBaseArgs = $SshPortArgs
    $ScpBaseArgs = $ScpPortArgs
  }
} else {
  $SshBaseArgs = $SshPortArgs
  $ScpBaseArgs = $ScpPortArgs
}

if ($Preflight) {
  Write-Host "Checking remote prerequisites..."
  $preflightScript = @"
APP_DIR="$RemoteAppDir"
FAILED=0

check() {
  LABEL="`$1"
  shift
  if "`$@"; then
    echo "[OK] `$LABEL"
  else
    echo "[FAIL] `$LABEL" >&2
    FAILED=1
  fi
}

check "tar is available" command -v tar
check "remote app directory exists: `$APP_DIR" test -d "`$APP_DIR"
check "remote app directory is writable: `$APP_DIR" test -w "`$APP_DIR"

if [ "`$FAILED" -ne 0 ]; then
  echo "Remote preflight failed. Fix the failed item(s), then rerun deploy." >&2
  exit 1
fi

echo "Remote preflight ok."
"@

  $preflightScript | & ssh @SshBaseArgs $Target "sh -s"
  if ($LASTEXITCODE -ne 0) {
    throw "Remote preflight failed. See [FAIL] line(s) above."
  }
}

if (-not $SkipBuild) {
  Write-Host "Building project..."
  Invoke-Expression $BuildCommand
}

if (-not (Test-Path -LiteralPath $DistDir)) {
  throw "Build directory not found: $DistDir"
}

if (Test-Path -LiteralPath $ArchivePath) {
  Remove-Item -LiteralPath $ArchivePath -Force
}

Write-Host "Compressing dist..."
& tar -czf $ArchivePath -C $DistDir .
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create archive: $ArchivePath"
}

Write-Host "Uploading archive to $Target..."
$scpArgs = @()
if ($LegacyScp) {
  $scpArgs += "-O"
}
$scpArgs += $ScpBaseArgs
$scpArgs += $ArchivePath
$scpArgs += "${Target}:$RemoteArchive"
& scp @scpArgs
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload archive to $Target. If the remote login works but upload fails, try passing -LegacyScp `$false."
}

$restartBlock = ""
if (-not [string]::IsNullOrWhiteSpace($ContainerName)) {
  $restartBlock = @"
if command -v docker >/dev/null 2>&1; then
  docker restart "$ContainerName"
elif [ -x /usr/local/bin/docker ]; then
  /usr/local/bin/docker restart "$ContainerName"
else
  echo "Docker command was not found, skipped container restart: $ContainerName" >&2
fi
"@
}

$remoteScript = @"
set -eu

APP_DIR="$RemoteAppDir"
ARCHIVE="$RemoteArchive"
STAMP=`$(date +%Y%m%d-%H%M%S)
BACKUP_ROOT=".deploy-backup"
BACKUP_DIR="`$BACKUP_ROOT/xftech-`$STAMP"
RELEASE_DIR=".deploy-release-`$STAMP"
RELEASE_LIST=".deploy-release-items-`$STAMP"

cd "`$APP_DIR"
mkdir -p "`$BACKUP_DIR" "`$RELEASE_DIR"

for item in index.html assets nginx.conf; do
  if [ -e "`$item" ]; then
    cp -a "`$item" "`$BACKUP_DIR/"
  fi
done

restore_backup() {
  if [ -f "`$RELEASE_LIST" ]; then
    ITEMS=`$(cat "`$RELEASE_LIST")
  else
    ITEMS="index.html assets nginx.conf"
  fi

  for item in `$ITEMS; do
    rm -rf "`$item"
    if [ -e "`$BACKUP_DIR/`$item" ]; then
      cp -a "`$BACKUP_DIR/`$item" .
    fi
  done
}

if ! tar -xzf "`$ARCHIVE" -C "`$RELEASE_DIR"; then
  restore_backup
  rm -rf "`$RELEASE_DIR"
  echo "Deploy failed while extracting archive. Previous files were restored." >&2
  exit 1
fi

find "`$RELEASE_DIR" -mindepth 1 -maxdepth 1 -exec basename {} \; > "`$RELEASE_LIST"

for name in `$(cat "`$RELEASE_LIST"); do
  rm -rf "`$name"
  if ! mv "`$RELEASE_DIR/`$name" .; then
    restore_backup
    rm -rf "`$RELEASE_DIR"
    rm -f "`$RELEASE_LIST"
    echo "Deploy failed while moving release files. Previous files were restored." >&2
    exit 1
  fi
done

rm -rf "`$RELEASE_DIR"
rm -f "`$RELEASE_LIST"
rm -f "`$ARCHIVE"
rm -f "$RemoteScriptPath"

$restartBlock

echo "Deploy finished. Backup saved to: `$APP_DIR/`$BACKUP_DIR"
"@

Set-Content -LiteralPath $RemoteScriptLocalPath -Value $remoteScript -Encoding ascii

Write-Host "Uploading remote deploy script..."
$scriptScpArgs = @()
if ($LegacyScp) {
  $scriptScpArgs += "-O"
}
$scriptScpArgs += $ScpBaseArgs
$scriptScpArgs += $RemoteScriptLocalPath
$scriptScpArgs += "${Target}:$RemoteScriptPath"
& scp @scriptScpArgs
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload remote deploy script to $Target."
}

Write-Host "Replacing static files..."
& ssh @SshBaseArgs $Target "sh '$RemoteScriptPath'"
if ($LASTEXITCODE -ne 0) {
  throw "Remote deploy failed."
}

if ($SshMultiplexStarted) {
  & ssh @SshBaseArgs -O exit $Target 2>$null | Out-Null
  $SshMultiplexStarted = $false
}

Write-Host "Done."
