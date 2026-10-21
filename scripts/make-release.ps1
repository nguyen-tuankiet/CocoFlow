# Builds the installer and the portable zip, signs them when a certificate is configured, and writes SHA256SUMS.txt.
#
#   powershell -File scripts\make-release.ps1            # full build
#   powershell -File scripts\make-release.ps1 -SkipBuild # only repackage what is already built
#
# Needs: Node, Rust (MSVC), and the third-party tools in installer-bin\ (ffmpeg.exe, pandoc\, magick\, gs\, 7zip\, ai\).
# The offline AI tools (installer-bin\ai\) ship inside the installer and the portable zip.
# Optional: installer-extra\libreoffice.7z = the LibreOffice folder packed with 7-Zip (slides, PDF to PowerPoint):
#   7z a -t7z -mx=5 installer-extra\libreoffice.7z <path to the libreoffice folder>
# It is not in the standard installer; it gets its own "full" installer. src-tauri\tauri.full.conf.json adds
# installer-extra\ to the resources and src-tauri\installer-hooks.nsh unpacks the archive after installing
# (NSIS cannot hold the unpacked 1 GB next to the rest of the app).
param([switch]$SkipBuild, [switch]$SkipPortable)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$version = (Get-Content "$root\src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json).version
$out = Join-Path $root 'release'
New-Item -ItemType Directory -Force $out | Out-Null

# ImageMagick ships eight statically linked programs of ~30 MB each; Cocoflow only runs magick.exe
# (even "identify" is called as `magick identify`), so the other seven are dead weight in the installer.
foreach ($extra in 'mogrify', 'stream', 'identify', 'montage', 'conjure', 'compare', 'composite') {
    Remove-Item -LiteralPath "$root\installer-bin\magick\$extra.exe" -Force -ErrorAction SilentlyContinue
}

if (-not $SkipBuild) {
    foreach ($tool in 'ffmpeg.exe', 'pandoc', 'magick', 'gs', '7zip', 'ai') {
        if (-not (Test-Path "$root\installer-bin\$tool")) { throw "installer-bin\$tool is missing" }
    }
    npm run tauri build -- --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }
}

# 1. installer
$setup = Get-ChildItem "$root\src-tauri\target\release\bundle\nsis\*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw 'No installer found; run without -SkipBuild first.' }
$setupOut = Join-Path $out "Cocoflow_${version}_x64-setup.exe"
Copy-Item $setup.FullName $setupOut -Force
& "$PSScriptRoot\sign.ps1" $setupOut

# 1b. full installer: the same app plus LibreOffice, so nothing has to be copied by hand
if (-not $SkipBuild -and (Test-Path "$root\installer-extra\libreoffice.7z")) {
    # a stale installer must never be mistaken for the full one
    Remove-Item "$root\src-tauri\target\release\bundle\nsis\*-setup.exe" -Force -ErrorAction SilentlyContinue
    npm run tauri build -- --bundles nsis --config src-tauri/tauri.full.conf.json
    if ($LASTEXITCODE -ne 0) { throw 'tauri build (full) failed' }
    $full = Get-ChildItem "$root\src-tauri\target\release\bundle\nsis\*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $full) { throw 'No full installer was produced.' }
    $fullOut = Join-Path $out "Cocoflow_${version}_x64-full-setup.exe"
    Copy-Item $full.FullName $fullOut -Force
    & "$PSScriptRoot\sign.ps1" $fullOut
}

# 2. portable zip: the exe plus the bundled tools (skipped on CI, where only the installers are published)
if (-not $SkipPortable) {
    $stage = Join-Path $root 'release\_portable'
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Force "$stage\Cocoflow" | Out-Null
    Copy-Item "$root\src-tauri\target\release\cocoflow.exe" "$stage\Cocoflow\Cocoflow.exe"
    & "$PSScriptRoot\sign.ps1" "$stage\Cocoflow\Cocoflow.exe"
    Copy-Item "$root\installer-bin" "$stage\Cocoflow\bin" -Recurse
    $portable = Join-Path $out "Cocoflow_${version}_x64-portable.zip"
    if (Test-Path $portable) { Remove-Item $portable }
    Compress-Archive -Path "$stage\Cocoflow" -DestinationPath $portable -CompressionLevel Optimal
    Remove-Item $stage -Recurse -Force
}

# 3. checksums
$sums = Get-ChildItem $out -File | Where-Object { $_.Extension -in '.exe', '.zip' } | ForEach-Object {
    "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
}
$sums | Set-Content (Join-Path $out 'SHA256SUMS.txt') -Encoding ascii
$sums
Write-Host "`nDone. Files are in $out"

