# Packs the third-party tools that are not in git (installer-bin\ and installer-extra\libreoffice.7z) into three
# files for the "tools" release that .github\workflows\release.yml downloads. Run it once, or again when a tool changes.
#
#   powershell -File scripts\pack-tools.ps1      # writes release\tools\
#
# Then publish them (GitHub: Releases > Draft a new release):
#   tag  tools-v1, title "Build tools v1", tick "Set as a pre-release" (so it never counts as the latest release),
#   attach everything in release\tools\.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$seven = Join-Path $root 'installer-bin\7zip\7z.exe'
$out = Join-Path $root 'release\tools'
if (-not (Test-Path $seven)) { throw "7-Zip not found: $seven" }
New-Item -ItemType Directory -Force $out | Out-Null

# the tools without the AI models, rooted so that unpacking into installer-bin\ restores them
$core = Join-Path $out 'tools-core.zip'
if (Test-Path $core) { Remove-Item $core }
Push-Location (Join-Path $root 'installer-bin')
& $seven a -tzip -mx=5 -mmt=on -bso0 -bsp0 $core '*' '-x!ai' | Out-Null
Pop-Location

# the offline AI models and engines
$ai = Join-Path $out 'tools-ai.zip'
if (Test-Path $ai) { Remove-Item $ai }
Push-Location (Join-Path $root 'installer-bin')
& $seven a -tzip -mx=5 -mmt=on -bso0 -bsp0 $ai 'ai' | Out-Null
Pop-Location

# LibreOffice, already packed by hand (see make-release.ps1)
$lo = Join-Path $root 'installer-extra\libreoffice.7z'
if (-not (Test-Path $lo)) { throw "installer-extra\libreoffice.7z is missing" }
Copy-Item $lo (Join-Path $out 'libreoffice.7z') -Force

Get-ChildItem $out -File | ForEach-Object { '{0,-20} {1,8:N0} MB' -f $_.Name, ($_.Length / 1MB) }
