# Builds the installer and the portable zip, signs them when a certificate is configured, and writes SHA256SUMS.txt.
#
#   powershell -File scripts\make-release.ps1            # full build
#   powershell -File scripts\make-release.ps1 -SkipBuild # only repackage what is already built
#
# Needs: Node, Rust (MSVC), and the third-party tools in installer-bin\ (ffmpeg.exe, pandoc\, magick\, gs\, 7zip\, ai\).
# The offline AI tools (installer-bin\ai\) ship inside the installer and the portable zip.
# Optional: LibreOffice in release\Tangelo\bin\libreoffice\ (becomes the separate add-on zip).
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$version = (Get-Content "$root\src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json).version
$out = Join-Path $root 'release'
New-Item -ItemType Directory -Force $out | Out-Null

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
$setupOut = Join-Path $out "Tangelo_${version}_x64-setup.exe"
Copy-Item $setup.FullName $setupOut -Force
& "$PSScriptRoot\sign.ps1" $setupOut

# 2. portable zip: the exe plus the bundled tools
$stage = Join-Path $root 'release\_portable'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force "$stage\Tangelo" | Out-Null
Copy-Item "$root\src-tauri\target\release\tangelo.exe" "$stage\Tangelo\Tangelo.exe"
& "$PSScriptRoot\sign.ps1" "$stage\Tangelo\Tangelo.exe"
Copy-Item "$root\installer-bin" "$stage\Tangelo\bin" -Recurse
$portable = Join-Path $out "Tangelo_${version}_x64-portable.zip"
if (Test-Path $portable) { Remove-Item $portable }
Compress-Archive -Path "$stage\Tangelo" -DestinationPath $portable -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force

# 3. optional LibreOffice add-on (slides, PDF to PowerPoint)
$office = "$root\release\Tangelo\bin\libreoffice"
if (Test-Path $office) {
    $addonStage = Join-Path $root 'release\_addon'
    if (Test-Path $addonStage) { Remove-Item $addonStage -Recurse -Force }
    New-Item -ItemType Directory -Force "$addonStage\Tangelo\bin" | Out-Null
    Copy-Item $office "$addonStage\Tangelo\bin\libreoffice" -Recurse
    $addon = Join-Path $out "Tangelo_${version}_LibreOffice-addon.zip"
    if (Test-Path $addon) { Remove-Item $addon }
    Compress-Archive -Path "$addonStage\Tangelo" -DestinationPath $addon -CompressionLevel Optimal
    Remove-Item $addonStage -Recurse -Force
}

# 4. checksums
$sums = Get-ChildItem $out -File | Where-Object { $_.Extension -in '.exe', '.zip' } | ForEach-Object {
    "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
}
$sums | Set-Content (Join-Path $out 'SHA256SUMS.txt') -Encoding ascii
$sums
Write-Host "`nDone. Files are in $out"

