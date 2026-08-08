$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Repository = "aidenbuildsthings/helios"
$Version = if ($env:HELIOS_VERSION) { $env:HELIOS_VERSION } else { "0.4.0" }
$ReleaseRoot = "https://github.com/$Repository/releases/download/v$Version"
$ArchiveName = "helios-$Version.zip"
$LocalAppData = [Environment]::GetFolderPath("LocalApplicationData")
$UserProfile = [Environment]::GetFolderPath("UserProfile")
$InstallRoot = if ($env:HELIOS_INSTALL_DIR) { $env:HELIOS_INSTALL_DIR } else { Join-Path $LocalAppData "Helios" }
$BinDir = if ($env:HELIOS_BIN_DIR) { $env:HELIOS_BIN_DIR } else { Join-Path $InstallRoot "bin" }
$StateDir = if ($env:HELIOS_HOME) { $env:HELIOS_HOME } else { Join-Path $UserProfile ".helios" }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Helios requires Node.js 22.22.3 or newer: https://nodejs.org/" }
$NodeVersion = (& node -p "process.versions.node").Trim()
$Parts = $NodeVersion.Split(".") | ForEach-Object { [int]$_ }
if ($Parts[0] -lt 22 -or ($Parts[0] -eq 22 -and ($Parts[1] -lt 22 -or ($Parts[1] -eq 22 -and $Parts[2] -lt 3)))) { throw "Helios requires Node.js 22.22.3 or newer (found $NodeVersion)." }

New-Item -ItemType Directory -Force -Path $InstallRoot, $BinDir, $StateDir | Out-Null
$DownloadDir = Join-Path ([IO.Path]::GetTempPath()) ("helios-download-" + [guid]::NewGuid())
$StagingDir = Join-Path $InstallRoot (".install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $DownloadDir, $StagingDir | Out-Null

try {
  Write-Host "Downloading Helios v$Version..."
  $Archive = Join-Path $DownloadDir $ArchiveName
  $Sums = Join-Path $DownloadDir "SHA256SUMS"
  Invoke-WebRequest -UseBasicParsing "$ReleaseRoot/$ArchiveName" -OutFile $Archive
  Invoke-WebRequest -UseBasicParsing "$ReleaseRoot/SHA256SUMS" -OutFile $Sums
  $Expected = (Get-Content $Sums | Where-Object { $_ -match "^[a-fA-F0-9]{64}\s+$([regex]::Escape($ArchiveName))$" } | Select-Object -First 1) -split "\s+" | Select-Object -First 1
  if (-not $Expected) { throw "Release checksum is missing for $ArchiveName." }
  $Actual = (Get-FileHash -Algorithm SHA256 $Archive).Hash
  if ($Actual -ne $Expected) { throw "Helios archive checksum verification failed." }

  Expand-Archive -Path $Archive -DestinationPath $DownloadDir -Force
  $SourceDir = Join-Path $DownloadDir "helios-$Version"
  Copy-Item (Join-Path $SourceDir "package.json"), (Join-Path $SourceDir "package-lock.json"), (Join-Path $SourceDir "README.md"), (Join-Path $SourceDir "build.json") -Destination $StagingDir
  Copy-Item (Join-Path $SourceDir "src"), (Join-Path $SourceDir "browser-extension") -Destination $StagingDir -Recurse
  $BuildFile = Join-Path $StagingDir "build.json"
  $Build = Get-Content $BuildFile -Raw | ConvertFrom-Json
  $Build | Add-Member -Force NoteProperty installedAt ([DateTime]::UtcNow.ToString("o"))
  [IO.File]::WriteAllText($BuildFile, ($Build | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  Push-Location $StagingDir
  try { & npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." } }
  finally { Pop-Location }

  $FinalDir = Join-Path $InstallRoot ("$Version-" + (Get-Date -Format "yyyyMMddHHmmss"))
  Move-Item $StagingDir $FinalDir
  $Shim = Join-Path $BinDir "helios.cmd"
  $NextShim = Join-Path $BinDir (".helios-" + [guid]::NewGuid() + ".cmd")
  "@echo off`r`nnode `"$(Join-Path $FinalDir 'src\cli.mjs')`" %*`r`n" | Set-Content -Encoding ASCII $NextShim
  Move-Item -Force $NextShim $Shim

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $PathParts = @($UserPath -split ";" | Where-Object { $_ })
  if ($PathParts -notcontains $BinDir) {
    [Environment]::SetEnvironmentVariable("Path", (($PathParts + $BinDir) -join ";"), "User")
    Write-Host "Added $BinDir to your user PATH. Open a new terminal before running Helios."
  }
  Write-Host ""
  Write-Host "Helios v$Version installed."
  Write-Host "State directory: $StateDir"
  Write-Host "Run: helios onboard"
}
finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $DownloadDir
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $StagingDir
}
