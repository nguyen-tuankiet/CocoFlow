// ===== EDIT THIS FILE AFTER EACH RELEASE =====
// `base` is where the files are hosted, without a trailing slash. For GitHub Releases:
//   https://github.com/<you>/<repo>/releases/download/v0.4.0
// Two installers: the standard one (offline AI inside) and the full one (the same plus LibreOffice).
export const RELEASE = {
  version: "0.4.0",
  base: "https://github.com/nguyen-tuankiet/CocoFlow/releases/download/v0.4.0",
  files: {
    setup: { name: "Cocoflow_0.4.0_x64-setup.exe", size: "457 MB" },
    full: { name: "Cocoflow_0.4.0_x64-full-setup.exe", size: "670 MB" },
  },
} as const;

export type FileKey = keyof typeof RELEASE.files;
export const urlOf = (key: FileKey) => `${RELEASE.base}/${RELEASE.files[key].name}`;
