# Releasing Cocoflow

## Automatic (normal way)

Merging or pushing to `main` publishes a release by itself, see `.github/workflows/release.yml`:

1. The workflow runs when a change touches the app (`src/`, `src-tauri/`, `scripts/`, `public/`, …). Changes that only touch
   `website/` do not build installers; Vercel redeploys the site on its own.
2. It numbers the release `<major>.<minor>.<run number>` (major and minor come from `src-tauri/tauri.conf.json`;
   raise them by hand for a bigger release).
3. It builds the standard and the full installer in two parallel jobs (`scripts/make-release.ps1 -SkipPortable -Variant …`,
   each downloading only the tools from the `tools-v1` pre-release that it needs), then a last job creates the GitHub
   Release with both files.
4. The website asks the GitHub API for the latest release, so its download buttons update without any edit.

### One-time setup: the tools release

The third-party tools are too big for git, so they live in a pre-release that the workflow downloads:

1. `powershell -File scripts\pack-tools.ps1` (writes `release\tools\`: `tools-core.zip`, `tools-ai.zip`, `libreoffice.7z`).
2. On GitHub: Releases → Draft a new release → tag `tools-v1`, title "Build tools v1", **tick "Set as a pre-release"**
   (so it is never the "latest" release), attach the three files, Publish.
3. Whenever a tool changes, pack again and publish `tools-v2`, then change `TOOLS_TAG` in the workflow.

## By hand

1. Bump the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. (Optional) configure signing, see [SIGNING.md](SIGNING.md).
3. Run `powershell -File scripts\make-release.ps1`. It produces, in `release\`:
   - `Cocoflow_<version>_x64-setup.exe` — per-user installer (no administrator rights, Start-menu shortcut,
     uninstaller, English and Vietnamese installer text). Includes FFmpeg, Pandoc, ImageMagick, Ghostscript, 7-Zip and
     the offline AI tools ([AI.md](AI.md)).
   - `Cocoflow_<version>_x64-full-setup.exe` — the same plus LibreOffice (slides, PDF to PowerPoint).
   - `Cocoflow_<version>_x64-portable.zip` — the standard build without installing.
   - `SHA256SUMS.txt` — checksums to publish next to the downloads.
4. Publish the files. For winget, fill in `packaging/winget/*.yaml` and open a PR to `microsoft/winget-pkgs`.
## Where the tools come from

`installer-bin\` (not committed) holds the third-party programs that the installer carries:

| Folder | Source |
|---|---|
| `ffmpeg.exe` | https://www.gyan.dev/ffmpeg/builds/ (or `winget install Gyan.FFmpeg`) |
| `pandoc\pandoc.exe` | https://github.com/jgm/pandoc/releases (windows-x86_64.zip) |
| `magick\` | https://github.com/ImageMagick/ImageMagick/releases (portable Q16-HDRI x64 `.7z`) |
| `gs\` (`bin`, `lib`, `Resource`, `iccprofiles`) | https://github.com/ArtifexSoftware/ghostpdl-downloads/releases (installer; unpack with 7-Zip) |
| `7zip\7z.exe`, `7z.dll` | https://github.com/ip7z/7zip/releases (unpack the MSI with `msiexec /a`) |

