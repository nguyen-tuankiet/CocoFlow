// ===== EDIT THIS FILE AFTER EACH RELEASE =====
// `base` is where the files are hosted, without a trailing slash. For GitHub Releases:
//   https://github.com/<you>/<repo>/releases/download/v0.3.2
// The offline AI tools are inside the installer and the portable zip, so only LibreOffice is a separate add-on.
export const RELEASE = {
  version: "0.3.2",
  base: "https://example.com/downloads/v0.3.2",
  files: {
    setup: { name: "Tangelo_0.3.2_x64-setup.exe", size: "457 MB" },
    portable: { name: "Tangelo_0.3.2_x64-portable.zip", size: "558 MB" },
    office: { name: "Tangelo_0.3.2_LibreOffice-addon.zip", size: "353 MB" },
  },
} as const;

export type FileKey = keyof typeof RELEASE.files;
export const urlOf = (key: FileKey) => `${RELEASE.base}/${RELEASE.files[key].name}`;
