# install.ps1 - installs and checks the Forte plugins in its folder, on Windows. It ships in each
# Windows download next to the plugins and install.cmd, which runs it (double-click install.cmd
# to install), and works on whichever plugins are in its folder: one instrument's or every
# instrument's. It is the Windows twin of install.sh and the Makefile on macOS and Linux.
#
#   install.cmd [install | verify | uninstall | check | unblock] [vst3] [clap] [app]
#
# With formats named, only those: vst3, clap, or app (the standalone). install, verify and
# uninstall work on the installed copies; check checks the plugins in this folder as they are,
# without installing anything; unblock clears the "downloaded from the internet" mark Windows
# puts on them (what SmartScreen warns about), where they are.
#
# The VST3s and CLAPs go where every host looks, C:\Program Files\Common Files\VST3 and \CLAP,
# so installing them asks once for administrator rights. The standalones go in your own
# %LOCALAPPDATA%\Programs\Forte, with a Start menu shortcut each. The folders can be changed
# through the VST3_DIR, CLAP_DIR and APP_DIR environment variables.
# native/install.ps1 in https://github.com/jdthaler/forte.
param([string]$Command = 'install', [Parameter(ValueFromRemainingArguments = $true)][string[]]$Formats)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$Common = [Environment]::GetFolderPath('CommonProgramFiles')
$Dirs = @{
  vst3 = if ($env:VST3_DIR) { $env:VST3_DIR } else { Join-Path $Common 'VST3' }
  clap = if ($env:CLAP_DIR) { $env:CLAP_DIR } else { Join-Path $Common 'CLAP' }
  app  = if ($env:APP_DIR) { $env:APP_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\Forte' }
}
$StartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Forte'

$all = @('vst3', 'clap', 'app')
if (-not $Formats -or $Formats.Count -eq 0) { $Formats = $all }
foreach ($f in $Formats) { if ($all -notcontains $f) { Write-Error "Unknown format '$f': vst3, clap or app."; exit 2 } }
if (@('install', 'verify', 'uninstall', 'check', 'unblock') -notcontains $Command) {
  Write-Host 'usage: install.cmd install|verify|uninstall|check|unblock [vst3] [clap] [app]'; exit 2
}

# Every plugin in this folder, as @{ kind; name }: a .vst3 is a folder, a .clap and an .exe a file.
$list = @()
foreach ($p in Get-ChildItem -LiteralPath . -Force) {
  $kind = switch -Regex ($p.Name) { '\.vst3$' { 'vst3' } '\.clap$' { 'clap' } '\.exe$' { 'app' } default { $null } }
  if ($kind -and ($Formats -contains $kind)) { $list += [pscustomobject]@{ kind = $kind; name = $p.Name } }
}
if ($list.Count -eq 0) { Write-Error "No $($Formats -join ', ') plugins next to install.ps1."; exit 1 }

$bad = 0
function Fail([string]$m) { Write-Host "FAIL  $m"; $script:bad++ }
function Target($p) { Join-Path $Dirs[$p.kind] $p.name }

# The VST3 and CLAP folders under Program Files need administrator rights: ask once, by running
# this same command again elevated, and wait for it.
function Test-Admin { ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
function Test-Writable([string]$dir) {
  try {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $probe = Join-Path $dir ".forte-$PID"
    [IO.File]::WriteAllText($probe, ''); Remove-Item -LiteralPath $probe -Force; return $true
  } catch { return $false }
}
function Ensure-Rights {
  $shared = $list | Where-Object { $_.kind -ne 'app' } | ForEach-Object { $Dirs[$_.kind] } | Select-Object -Unique
  if (-not $shared -or (Test-Admin)) { return $false }
  if (-not ($shared | Where-Object { -not (Test-Writable $_) })) { return $false }
  Write-Host 'The VST3 and CLAP folders need administrator rights: Windows will ask.'
  $kinds = ($list | Where-Object { $_.kind -ne 'app' } | ForEach-Object { $_.kind } | Select-Object -Unique) -join ' '
  $argline = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $Command $kinds"
  $p = Start-Process powershell -Verb RunAs -ArgumentList $argline -Wait -PassThru
  if ($p.ExitCode -ne 0) { exit $p.ExitCode }
  return $true # the elevated run did the VST3s and CLAPs; the apps are done here, as the user
}

function Is-Blocked([string]$path) {
  $files = if (Test-Path -LiteralPath $path -PathType Container) { Get-ChildItem -LiteralPath $path -Recurse -File -Force } else { Get-Item -LiteralPath $path -Force }
  foreach ($f in $files) { if (Get-Item -LiteralPath $f.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue) { return $true } }
  return $false
}
function Unblock-Tree([string]$path) {
  if (Test-Path -LiteralPath $path -PathType Container) { Get-ChildItem -LiteralPath $path -Recurse -File -Force | Unblock-File }
  else { Unblock-File -LiteralPath $path }
}
# The files of a plugin, relative to it, with their hashes: to tell an installed copy is this one.
function Fingerprint([string]$path) {
  $root = (Get-Item -LiteralPath $path).FullName
  $files = if (Test-Path -LiteralPath $path -PathType Container) { Get-ChildItem -LiteralPath $path -Recurse -File -Force } else { Get-Item -LiteralPath $path -Force }
  ($files | ForEach-Object { "$($_.FullName.Substring($root.Length)) $((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)" } | Sort-Object) -join "`n"
}
function Loads($p, [string]$path) {
  if ($p.kind -eq 'clap' -and (Get-Command clap-validator -ErrorAction SilentlyContinue)) {
    # Windows PowerShell 5.1 turns a native command's stderr into an error when it is redirected,
    # which 'Stop' would make fatal; the exit code is what says whether it passed.
    $ErrorActionPreference = 'Continue'
    & clap-validator validate $path *> $null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { Fail "${path}: clap-validator validate failed"; return $false }
  }
  return $true
}

function Shortcut($p, [bool]$make) {
  $lnk = Join-Path $StartMenu ([IO.Path]::GetFileNameWithoutExtension($p.name) + '.lnk')
  if (-not $make) { if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force }; return }
  New-Item -ItemType Directory -Force -Path $StartMenu | Out-Null
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $s.TargetPath = Target $p; $s.WorkingDirectory = $Dirs.app; $s.Save()
}

function Do-Install {
  $elevated = Ensure-Rights
  foreach ($p in $list) {
    if ($elevated -and $p.kind -ne 'app') { continue }
    $d = $Dirs[$p.kind]; $t = Target $p
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    if (Test-Path -LiteralPath $t) { Remove-Item -LiteralPath $t -Recurse -Force }
    Copy-Item -LiteralPath $p.name -Destination $d -Recurse -Force
    Unblock-Tree $t
    if ($p.kind -eq 'app') { Shortcut $p $true }
    Write-Host "installed $t"
  }
  if ($Formats.Count -eq 1) { Write-Host "Now check them: install.cmd verify $($Formats[0])" } else { Write-Host 'Now check them: install.cmd verify' }
}

function Do-Verify {
  foreach ($p in $list) {
    $t = Target $p
    if (-not (Test-Path -LiteralPath $t)) { Fail "$t is not installed (install.cmd install $($p.kind))"; continue }
    if ((Fingerprint $p.name) -ne (Fingerprint $t)) { Fail "$t differs from this download (install.cmd install $($p.kind))"; continue }
    if (Is-Blocked $t) { Fail "$t is still marked as downloaded (install.cmd install $($p.kind))"; continue }
    if (-not (Loads $p $t)) { continue }
    Write-Host "ok    $t"
  }
  if ($bad -gt 0) { Write-Host "$bad problem(s)"; exit 1 }
  Write-Host 'All installed. Rescan the plugins in your DAW if it does not list them yet.'
}

function Do-Check {
  foreach ($p in $list) {
    if (-not (Loads $p $p.name)) { continue }
    if (Is-Blocked $p.name) { Write-Host "ok    $($p.name) (marked as downloaded: SmartScreen may ask; install.cmd unblock clears it)" }
    else { Write-Host "ok    $($p.name)" }
  }
  if ($bad -gt 0) { Write-Host "$bad problem(s)"; exit 1 }
  if ($list | Where-Object { $_.kind -eq 'app' }) { Write-Host 'All can load. The standalone runs from this folder too: no install needed.' } else { Write-Host 'All can load.' }
}

function Do-Unblock {
  foreach ($p in $list) {
    if (Is-Blocked $p.name) { Unblock-Tree $p.name; Write-Host "cleared $($p.name)" } else { Write-Host "ok    $($p.name) (not marked)" }
  }
}

function Do-Uninstall {
  $elevated = Ensure-Rights
  foreach ($p in $list) {
    if ($elevated -and $p.kind -ne 'app') { continue }
    $t = Target $p
    if (Test-Path -LiteralPath $t) { Remove-Item -LiteralPath $t -Recurse -Force; Write-Host "removed $t" }
    if ($p.kind -eq 'app') { Shortcut $p $false }
  }
}

switch ($Command) {
  'install' { Do-Install }
  'verify' { Do-Verify }
  'uninstall' { Do-Uninstall }
  'check' { Do-Check }
  'unblock' { Do-Unblock }
}
