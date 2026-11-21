# Copyright 2026 o1-code contributors
# SPDX-License-Identifier: GPL-3.0-only
#
# Installs o1-code for the current user on Windows, with its own Node.js
# runtime. Nothing is installed system-wide and administrator rights are not
# needed. Works in Windows PowerShell 5.1 and PowerShell 7.
#
#   irm https://github.com/organizaone/o1-code/releases/latest/download/install.ps1 | iex
#   & ([scriptblock]::Create((irm .../install.ps1))) -Version 0.28.0
#   & ([scriptblock]::Create((irm .../install.ps1))) -Uninstall
#
# Options (each also reads the environment variable beside it):
#   -Version X.Y.Z   O1CODE_INSTALL_VERSION         Version to install. Default: latest.
#   -InstallDir DIR  O1CODE_INSTALL_DIR             Install root. Default: %LOCALAPPDATA%\o1-code.
#   -NoModifyPath    O1CODE_INSTALL_NO_MODIFY_PATH  Leave the user PATH alone.
#   -Uninstall                                      Remove the installation, keep settings.
#   O1CODE_INSTALL_BASE_URL  Directory holding the archive and SHA256SUMS of one version.
#
# The layout is <root>\lib\o1-code (the program) and <root>\bin\o1-code.cmd
# (a launcher). The program updates itself in that layout, so the launcher
# must stay as packages/cli/src/ui/standalone-update.ts writes it.

param(
  [string]$Version = $env:O1CODE_INSTALL_VERSION,
  [string]$InstallDir = $env:O1CODE_INSTALL_DIR,
  [switch]$NoModifyPath,
  [switch]$Uninstall
)

# Everything runs from this function, called on the last line, so a download
# cut short never runs half a script.
function Install-O1Code {
  param(
    [string]$Version,
    [string]$InstallDir,
    [bool]$NoModifyPath,
    [bool]$Uninstall
  )

  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  $repoUrl = 'https://github.com/organizaone/o1-code'
  $packageName = '@organizaone/o1-code'
  $npmHint = "Install with npm instead: npm install -g $packageName"

  function Test-O1CodeInstall([string]$Directory) {
    $manifest = Join-Path $Directory 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifest)) { return $false }
    try {
      return (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).name -eq $packageName
    } catch {
      return $false
    }
  }

  # Read and written through the registry so entries such as %USERPROFILE%\bin
  # keep their variables instead of being expanded and frozen.
  function Get-UserPath {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
    try {
      return [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    } finally {
      $key.Close()
    }
  }

  function Set-UserPath([string]$Value) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    try {
      $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
      if ($key.GetValueNames() -contains 'Path') { $kind = $key.GetValueKind('Path') }
      $key.SetValue('Path', $Value, $kind)
    } finally {
      $key.Close()
    }
    # Writing any user variable tells running programs the environment changed.
    [Environment]::SetEnvironmentVariable('O1CODE_INSTALL_REFRESH', '1', 'User')
    [Environment]::SetEnvironmentVariable('O1CODE_INSTALL_REFRESH', $null, 'User')
  }

  function Split-PathList([string]$Value) {
    return @($Value -split ';' | Where-Object { $_ -ne '' })
  }

  function Add-ToUserPath([string]$Directory) {
    $entries = Split-PathList (Get-UserPath)
    $present = $entries | Where-Object { $_.TrimEnd('\') -ieq $Directory.TrimEnd('\') }
    if (-not $present) {
      Set-UserPath ((@($Directory) + $entries) -join ';')
      Write-Host "Added $Directory to your PATH. Open a new terminal to run o1-code."
    }
    $session = Split-PathList $env:Path
    if (-not ($session | Where-Object { $_.TrimEnd('\') -ieq $Directory.TrimEnd('\') })) {
      $env:Path = (@($Directory) + $session) -join ';'
    }
  }

  function Remove-FromUserPath([string]$Directory) {
    $entries = Split-PathList (Get-UserPath)
    $kept = @($entries | Where-Object { $_.TrimEnd('\') -ine $Directory.TrimEnd('\') })
    if ($kept.Count -ne $entries.Count) {
      Set-UserPath ($kept -join ';')
      Write-Host "Removed $Directory from your PATH."
    }
  }

  if (-not $InstallDir) {
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is not set; pass -InstallDir.' }
    $InstallDir = Join-Path $env:LOCALAPPDATA 'o1-code'
  }
  if (-not [IO.Path]::IsPathRooted($InstallDir)) { throw '-InstallDir must be an absolute path.' }
  # The launcher is a .cmd file; these characters cannot be written into one safely.
  if ($InstallDir -match '[&|<>^%!"`\r\n]') {
    throw "-InstallDir contains characters that a .cmd launcher cannot hold: $InstallDir"
  }
  $InstallDir = $InstallDir.TrimEnd('\')
  $programDir = Join-Path $InstallDir 'lib\o1-code'
  $binDir = Join-Path $InstallDir 'bin'
  $launcher = Join-Path $binDir 'o1-code.cmd'

  if ($Uninstall) {
    $removed = $false
    if (Test-Path -LiteralPath $programDir) {
      if (-not (Test-O1CodeInstall $programDir)) {
        throw "$programDir is not an o1-code installation; nothing was removed."
      }
      Remove-Item -LiteralPath $programDir -Recurse -Force
      $removed = $true
    }
    foreach ($leftover in @("$programDir.old", "$programDir.new")) {
      if (Test-Path -LiteralPath $leftover) { Remove-Item -LiteralPath $leftover -Recurse -Force }
    }
    if (Test-Path -LiteralPath $launcher) {
      Remove-Item -LiteralPath $launcher -Force
      $removed = $true
    }
    Remove-FromUserPath $binDir
    foreach ($directory in @($binDir, (Split-Path -Parent $programDir), $InstallDir)) {
      if ((Test-Path -LiteralPath $directory) -and -not (Get-ChildItem -LiteralPath $directory -Force)) {
        Remove-Item -LiteralPath $directory -Force
      }
    }
    if ($removed) {
      Write-Host 'o1-code was removed. Your settings in the .o1-code folder of your profile were kept.'
    } else {
      Write-Host "No o1-code installation was found under $InstallDir."
    }
    return
  }

  if (-not $Version) { $Version = 'latest' }
  $Version = $Version -replace '^v', ''
  if ($Version -ne 'latest' -and $Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "'$Version' is not a version like 0.28.0."
  }

  if (-not [Environment]::Is64BitOperatingSystem) { throw "32-bit Windows is not supported. $npmHint" }
  $architecture = $env:PROCESSOR_ARCHITEW6432
  if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
  if ($architecture -ne 'AMD64') {
    throw "This installer supports 64-bit Intel/AMD Windows only (found $architecture). $npmHint"
  }
  $target = 'win-x64'
  $archive = "o1-code-$target.zip"

  if ($env:O1CODE_INSTALL_BASE_URL) {
    $baseUrl = $env:O1CODE_INSTALL_BASE_URL.TrimEnd('/')
    if ($baseUrl -notmatch '^(https://|http://(127\.0\.0\.1|localhost):)') {
      throw 'O1CODE_INSTALL_BASE_URL must be an https:// URL.'
    }
  } elseif ($Version -eq 'latest') {
    $baseUrl = "$repoUrl/releases/latest/download"
  } else {
    $baseUrl = "$repoUrl/releases/download/v$Version"
  }

  if ((Test-Path -LiteralPath $programDir) -and -not (Test-O1CodeInstall $programDir)) {
    throw "$programDir exists and is not an o1-code installation. Move it away or choose another -InstallDir."
  }

  # Windows PowerShell 5.1 does not offer TLS 1.2 unless asked.
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch {
    Write-Verbose 'TLS 1.2 could not be enabled explicitly.'
  }

  $work = Join-Path ([IO.Path]::GetTempPath()) ("o1-code-install-" + [Guid]::NewGuid().ToString('N'))
  $libDir = Split-Path -Parent $programDir
  $staging = Join-Path $libDir (".o1-code-install-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $work, $libDir, $binDir | Out-Null

  try {
    Write-Host "Downloading o1-code ($Version, $target)..."
    $sumsPath = Join-Path $work 'SHA256SUMS'
    $archivePath = Join-Path $work $archive
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHA256SUMS" -OutFile $sumsPath
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$archive" -OutFile $archivePath

    $expected = $null
    foreach ($line in Get-Content -LiteralPath $sumsPath) {
      $parts = $line.Trim() -split '\s+'
      if ($parts.Count -ge 2 -and $parts[-1].TrimStart('*') -eq $archive) {
        $expected = $parts[0].ToLowerInvariant()
        break
      }
    }
    if (-not $expected) { throw "SHA256SUMS does not list $archive." }
    $actual = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
      throw "Checksum mismatch for ${archive}: expected $expected, got $actual."
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
      foreach ($entry in $zip.Entries) {
        $name = $entry.FullName -replace '\\', '/'
        if ($name.StartsWith('/') -or $name -match '(^|/)\.\.(/|$)' -or $name -match '^[A-Za-z]:') {
          throw 'The archive contains an unsafe path.'
        }
      }
    } finally {
      $zip.Dispose()
    }

    # Extracted beside the destination so the final move is a rename. tar.exe
    # copes with paths longer than 260 characters, which Expand-Archive does not.
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path -LiteralPath $tar) {
      & $tar -xf $archivePath -C $staging
      if ($LASTEXITCODE -ne 0) { throw "Extracting $archive failed (tar exit code $LASTEXITCODE)." }
    } else {
      [IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $staging)
    }

    $staged = Join-Path $staging 'o1-code'
    $stagedLauncher = Join-Path $staged 'bin\o1-code.cmd'
    if (-not (Test-O1CodeInstall $staged) -or
        -not (Test-Path -LiteralPath $stagedLauncher) -or
        -not (Test-Path -LiteralPath (Join-Path $staged 'node\node.exe'))) {
      throw 'The archive does not contain an o1-code installation.'
    }
    $manifestVersion = (Get-Content -LiteralPath (Join-Path $staged 'manifest.json') -Raw | ConvertFrom-Json).version
    $startedVersion = (& $stagedLauncher --version 2>$null | Select-Object -Last 1)
    if ("$startedVersion".Trim() -ne $manifestVersion) {
      throw "The downloaded o1-code does not start on this system (got '$startedVersion'). $npmHint"
    }

    # The previous version stays in .old, where /doctor rollback finds it.
    if (Test-Path -LiteralPath $programDir) {
      $previous = "$programDir.old"
      if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
      try {
        Rename-Item -LiteralPath $programDir -NewName (Split-Path -Leaf $previous)
      } catch {
        throw "Could not replace $programDir. Close every running o1-code and run the installer again."
      }
      try {
        Move-Item -LiteralPath $staged -Destination $programDir
      } catch {
        Rename-Item -LiteralPath $previous -NewName (Split-Path -Leaf $programDir)
        throw
      }
    } else {
      Move-Item -LiteralPath $staged -Destination $programDir
    }

    $launcherText = "@echo off`r`ncall `"$programDir\bin\o1-code.cmd`" %*`r`n"
    [IO.File]::WriteAllText($launcher, $launcherText, (New-Object Text.ASCIIEncoding))

    Write-Host "o1-code $manifestVersion is installed in $programDir."
    if ($NoModifyPath) {
      Write-Host "Add $binDir to your PATH to run o1-code."
    } else {
      Add-ToUserPath $binDir
    }

    # Another o1-code earlier on PATH (an npm installation, usually) would run
    # instead of this one.
    $others = @(Get-Command o1-code -All -ErrorAction SilentlyContinue |
      Where-Object { $_.Source -and (Split-Path -Parent $_.Source).TrimEnd('\') -ine $binDir })
    if ($others.Count -gt 0) {
      Write-Warning "Another o1-code is on your PATH at $($others[0].Source) and may run instead of this one."
      Write-Warning "If it came from npm, remove it with: npm uninstall -g $packageName"
    }
  } finally {
    foreach ($temporary in @($work, $staging)) {
      if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

Install-O1Code -Version $Version -InstallDir $InstallDir `
  -NoModifyPath ($NoModifyPath.IsPresent -or $env:O1CODE_INSTALL_NO_MODIFY_PATH -eq '1') `
  -Uninstall $Uninstall.IsPresent
