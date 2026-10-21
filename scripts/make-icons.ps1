# Builds every icon of the app and the website from one logo image (dark mark on a white background).
#
#   powershell -File scripts\make-icons.ps1                       # uses branding\logo.png
#   powershell -File scripts\make-icons.ps1 -Source C:\x\logo.png
#
# Writes: branding\logo-mark.png (transparent), src-tauri\icons\* (app + installer icons),
#         website\public\logo.png and website\public\favicon.png.
# Needs: ImageMagick (installer-bin\magick\magick.exe) and Node (npx tauri).
param(
    [string]$Source,
    [string]$OutRoot
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $Source) { $Source = Join-Path $root 'branding\logo.png' }
if (-not $OutRoot) { $OutRoot = $root }
if (-not (Test-Path $Source)) { throw "Logo not found: $Source" }
$magick = Join-Path $root 'installer-bin\magick\magick.exe'
if (-not (Test-Path $magick)) { throw "ImageMagick not found: $magick" }

$brand = Join-Path $OutRoot 'branding'
New-Item -ItemType Directory -Force $brand | Out-Null
$mask = Join-Path $brand '_mask.png'
$mark = Join-Path $brand 'logo-mark.png'
$color = '#04a9c6'

# 1. the darker the pixel, the more opaque: a clean transparent mark with smooth edges
$teal = Join-Path $brand '_teal.png'
& $magick $Source -colorspace Gray -negate -contrast-stretch 0%x15% $mask
& $magick $mask -colorspace sRGB -type TrueColor -fill $color -colorize 100 $teal
$cut = Join-Path $brand '_cut.png'
& $magick $teal $mask -alpha off -compose CopyOpacity -composite -type TrueColorAlpha $cut
& $magick $cut -trim +repage -background none -gravity center -bordercolor none -border 8% -type TrueColorAlpha $mark
Remove-Item $teal, $cut -Force
$w = [int](& $magick identify -format '%w' $mark); $h = [int](& $magick identify -format '%h' $mark)
$side = [Math]::Max($w, $h)
& $magick $mark -background none -gravity center -extent "${side}x${side}" -resize 1024x1024 $mark
Remove-Item $mask -Force

# 2. app and installer icons (Tauri writes png, ico, icns and the Windows store sizes)
Push-Location $root
npx tauri icon $mark --output (Join-Path $OutRoot 'src-tauri\icons')
Pop-Location
# the Android and iOS sets are not used by a Windows app
Remove-Item (Join-Path $OutRoot 'src-tauri\icons\android'), (Join-Path $OutRoot 'src-tauri\icons\ios') -Recurse -Force -ErrorAction SilentlyContinue

# 3. website
$pub = Join-Path $OutRoot 'website\public'
New-Item -ItemType Directory -Force $pub | Out-Null
& $magick $mark -resize 256x256 (Join-Path $pub 'logo.png')
& $magick $mark -resize 64x64 (Join-Path $pub 'favicon.png')
Write-Host "Icons written under $OutRoot"
