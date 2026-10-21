# Signs one file with Authenticode. Called by the Tauri bundler for every binary it produces
# (see bundle.windows.signCommand in src-tauri/tauri.conf.json) and by make-release.ps1.
#
# Without a certificate the file is left unsigned and the script still exits 0, so builds keep working.
#
#   Option A: a code-signing certificate in a .pfx file
#     $env:TANGELO_SIGN_PFX      = 'C:\keys\tangelo.pfx'
#     $env:TANGELO_SIGN_PASSWORD = '...'
#
#   Option B: a certificate in the Windows certificate store (hardware token, EV certificate)
#     $env:TANGELO_SIGN_THUMBPRINT = 'AB12...'
#
#   Option C: Azure Trusted Signing
#     $env:TANGELO_SIGN_AZURE_DLIB     = 'C:\...\Azure.CodeSigning.Dlib.dll'
#     $env:TANGELO_SIGN_AZURE_METADATA = 'C:\...\metadata.json'
#
# See docs/SIGNING.md.
param([Parameter(Mandatory = $true)][string]$File)

$ErrorActionPreference = 'Stop'
$timestamp = if ($env:TANGELO_SIGN_TIMESTAMP) { $env:TANGELO_SIGN_TIMESTAMP } else { 'http://timestamp.digicert.com' }

function Find-SignTool {
    $candidates = @(
        (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source,
        (Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName)
    ) | Where-Object { $_ }
    return $candidates | Select-Object -First 1
}

$mode = $null
if ($env:TANGELO_SIGN_PFX) { $mode = 'pfx' }
elseif ($env:TANGELO_SIGN_THUMBPRINT) { $mode = 'store' }
elseif ($env:TANGELO_SIGN_AZURE_DLIB) { $mode = 'azure' }

if (-not $mode) {
    Write-Host "sign.ps1: no certificate configured, leaving '$([IO.Path]::GetFileName($File))' unsigned."
    exit 0
}

$signtool = Find-SignTool
if (-not $signtool) { throw 'signtool.exe was not found. Install the Windows SDK (winget install Microsoft.WindowsSDK.10.0.22621).' }

switch ($mode) {
    'pfx' {
        $args = @('sign', '/fd', 'SHA256', '/tr', $timestamp, '/td', 'SHA256', '/f', $env:TANGELO_SIGN_PFX)
        if ($env:TANGELO_SIGN_PASSWORD) { $args += @('/p', $env:TANGELO_SIGN_PASSWORD) }
    }
    'store' {
        $args = @('sign', '/fd', 'SHA256', '/tr', $timestamp, '/td', 'SHA256', '/sha1', $env:TANGELO_SIGN_THUMBPRINT)
    }
    'azure' {
        $args = @('sign', '/v', '/fd', 'SHA256', '/tr', 'http://timestamp.acs.microsoft.com', '/td', 'SHA256',
            '/dlib', $env:TANGELO_SIGN_AZURE_DLIB, '/dmdf', $env:TANGELO_SIGN_AZURE_METADATA)
    }
}
$args += $File

& $signtool @args
if ($LASTEXITCODE -ne 0) { throw "signtool failed with exit code $LASTEXITCODE" }

& $signtool verify /pa /q $File
if ($LASTEXITCODE -ne 0) { throw "The signature of $File did not verify" }
Write-Host "sign.ps1: signed $([IO.Path]::GetFileName($File))"
