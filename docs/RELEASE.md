# Releasing Cocoflow

1. Bump the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. (Optional) configure signing, see [SIGNING.md](SIGNING.md).
3. Run `powershell -File scripts\make-release.ps1`. It produces, in `release\`:
   - `Cocoflow_<version>_x64-setup.exe` — per-user installer (no administrator rights, Start-menu shortcut,
     uninstaller, English and Vietnamese installer text). Includes FFmpeg, Pandoc, ImageMagick, Ghostscript and 7-Zip.
   - `Cocoflow_<version>_x64-portable.zip` — the same without installing.
   - `Cocoflow_<version>_LibreOffice-addon.zip` — optional; unzip over the portable folder (or the install folder)
     to enable slides and PDF to PowerPoint.
   - `Cocoflow_<version>_AI-addon.zip` — optional offline AI tools, see [AI.md](AI.md).
   - `SHA256SUMS.txt` — checksums to publish next to the downloads.
4. Publish the files and the checksums. For winget, fill in `packaging/winget/*.yaml` and open a PR to
   `microsoft/winget-pkgs`.

## Where the tools come from

`installer-bin\` (not committed) holds the third-party programs that the installer carries:

| Folder | Source |
|---|---|
| `ffmpeg.exe` | https://www.gyan.dev/ffmpeg/builds/ (or `winget install Gyan.FFmpeg`) |
| `pandoc\pandoc.exe` | https://github.com/jgm/pandoc/releases (windows-x86_64.zip) |
| `magick\` | https://github.com/ImageMagick/ImageMagick/releases (portable Q16-HDRI x64 `.7z`) |
| `gs\` (`bin`, `lib`, `Resource`, `iccprofiles`) | https://github.com/ArtifexSoftware/ghostpdl-downloads/releases (installer; unpack with 7-Zip) |
| `7zip\7z.exe`, `7z.dll` | https://github.com/ip7z/7zip/releases (unpack the MSI with `msiexec /a`) |

