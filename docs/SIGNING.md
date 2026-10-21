# Code signing

Tangelo's installer and executable are built **unsigned** unless you provide a certificate.
Unsigned downloads trigger the Windows SmartScreen warning ("Windows protected your PC") the first time they run.
Signing is the only thing that fixes this, and it needs a certificate that only you (the publisher) can obtain.
Nothing in this repository can sign on your behalf.

## What is already in place

- `scripts/sign.ps1` signs a file with `signtool`. The Tauri bundler calls it for every binary it creates
  (`bundle.windows.signCommand` in `src-tauri/tauri.conf.json`), and `scripts/make-release.ps1` calls it for the
  portable build. With no certificate configured it prints a message and leaves the file unsigned.
- `scripts/make-release.ps1` writes `SHA256SUMS.txt` next to the release files, so people can verify a download
  even when it is unsigned.

## Choosing a certificate

| Option | Cost (approx.) | SmartScreen | Notes |
|---|---|---|---|
| **SignPath Foundation** | free for open-source projects | builds reputation over time | Needs a public repository and an application. Signing runs in their CI. |
| **Azure Trusted Signing** | ~10 USD / month | good, Microsoft-run identity | Available to individuals and organisations in some regions; identity validation takes days. |
| **OV code-signing certificate** | 100–250 USD / year | reputation builds slowly | Delivered on a hardware token (a CA rule since 2023). |
| **EV code-signing certificate** | 250–450 USD / year | immediate reputation | Hardware token, company validation. |
| Self-signed certificate | free | **does not remove the warning** for other people | Only useful to test the signing pipeline on your own PC. |

For a small free tool, SignPath Foundation (if the project is open source) or Azure Trusted Signing is the usual choice.

## Using a certificate

Set the environment variables of **one** option before building (`npm run tauri build` or `scripts/make-release.ps1`):

```powershell
# A) .pfx file
$env:TANGELO_SIGN_PFX      = 'C:\keys\tangelo.pfx'
$env:TANGELO_SIGN_PASSWORD = '********'

# B) certificate in the Windows store (hardware token / EV)
$env:TANGELO_SIGN_THUMBPRINT = 'AB12CD34...'

# C) Azure Trusted Signing
$env:TANGELO_SIGN_AZURE_DLIB     = 'C:\tools\Azure.CodeSigning.Dlib.dll'
$env:TANGELO_SIGN_AZURE_METADATA = 'C:\keys\metadata.json'
```

`signtool.exe` comes with the Windows SDK (`winget install Microsoft.WindowsSDK.10.0.22621`).
Never commit the `.pfx` or its password; keep them outside the repository.

## Checking a build

```powershell
signtool verify /pa /v "release\Tangelo_0.2.0_x64-setup.exe"
Get-AuthenticodeSignature "release\Tangelo_0.2.0_x64-setup.exe" | Format-List
```

## SmartScreen reputation

Even a correctly signed file can show the warning at first. Reputation accumulates as more people install the
same signed build (EV certificates start with reputation). Publishing every release under the same publisher name
and certificate is what makes the warning go away.

## Tools bundled in the installer

The installer carries FFmpeg (GPL build), Pandoc (GPL), ImageMagick, Ghostscript (AGPL), and 7-Zip (LGPL).
These keep their own licences. If you distribute Tangelo publicly, include their licence texts and offer the
corresponding source as those licences require.
