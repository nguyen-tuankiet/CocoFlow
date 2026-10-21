// Outline icons (24x24 grid, stroke = currentColor) used by the wheel and the option grid.

const PATHS: Record<string, string> = {
  convert: `<path d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2"/>`,
  image: `<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17.5l5-5 4 4 3-3 4.5 4.5"/>`,
  video: `<rect x="3" y="6" width="13" height="12" rx="2.6"/><path d="M16 10.6l5-3v8.8l-5-3z"/>`,
  audio: `<path d="M9 18V6.5l10-2V16"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/>`,
  doc: `<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>`,
  pdf: `<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M8.5 17.5v-4h1.8a1.3 1.3 0 010 2.6H8.5M13 17.5v-4h1.1a2 2 0 012 2v0a2 2 0 01-2 2H13z"/>`,
  text: `<path d="M5 6h14M5 12h14M5 18h9"/>`,
  sheet: `<rect x="4" y="4" width="16" height="16" rx="2.4"/><path d="M4 10h16M4 15h16M10 4v16"/>`,
  slides: `<rect x="3" y="4.5" width="18" height="12" rx="2.4"/><path d="M12 16.5V20M8 20.5h8"/>`,
  archive: `<path d="M4 7.5L6 4h12l2 3.5V19a1 1 0 01-1 1H5a1 1 0 01-1-1z"/><path d="M4 7.5h16M12 11v5M9.5 12.5h5"/>`,
  folder: `<path d="M3 7.5A2.5 2.5 0 015.5 5H9l2 2.2h7.5A2.5 2.5 0 0121 9.7V17.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z"/>`,
  file: `<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>`,
  compress: `<path d="M8 4l4 4 4-4M8 20l4-4 4 4M4 12h16"/>`,
  resize: `<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>`,
  crop: `<path d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14"/>`,
  rotate: `<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>`,
  "rotate-left": `<g transform="translate(24 0) scale(-1 1)"><path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4.5V11h-6.5"/></g>`,
  flip: `<path d="M12 3v18"/><path d="M8.5 7L3.5 12l5 5V7zM15.5 7l5 5-5 5V7z"/>`,
  gray: `<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor"/>`,
  mute: `<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/>`,
  frame: `<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/>`,
  normalize: `<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>`,
  scissors: `<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.7L20 18M8 15.3L20 6"/>`,
  speed: `<path d="M4 17a8 8 0 1116 0"/><path d="M12 17l4-5"/>`,
  merge: `<path d="M6 4v4a5 5 0 005 5h2a5 5 0 005-5V4M12 13v7"/>`,
  extract: `<path d="M3 7.5A2.5 2.5 0 015.5 5H9l2 2.2h7.5A2.5 2.5 0 0121 9.7V17.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/>`,
  open: `<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>`,
  clipboard: `<rect x="8" y="3" width="8" height="4" rx="1.2"/><path d="M8 5H6.5A1.5 1.5 0 005 6.5v13A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0017.5 5H16"/>`,
  copy: `<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.4"/><path d="M15.5 8.5V6.5A2.5 2.5 0 0013 4H6.5A2.5 2.5 0 004 6.5V13a2.5 2.5 0 002.5 2.5h2"/>`,
  download: `<path d="M12 4v10M8 10.5l4 4 4-4M5 19h14"/>`,
  move: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  split: `<path d="M12 3v18"/><path d="M7 8l-4 4 4 4M17 8l4 4-4 4"/>`,
  ocr: `<path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2"/><path d="M8.5 9h7M12 9v6.5"/>`,
  cutout: `<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>`,
  upscale: `<path d="M14 4h6v6M20 4l-7 7"/><rect x="4" y="12" width="8" height="8" rx="1.6"/>`,
  captions: `<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M7 11h3.5M13 11h4M7 15h2M11.5 15h5.5"/>`,
  summary: `<path d="M5 6h14M5 11h14M5 16h8"/><path d="M17.5 14.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z"/>`,
  chat: `<path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 014 13.5z"/>`,
  mail: `<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M3.5 7.5l8.5 6 8.5-6"/>`,
  phone: `<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M11 18.5h2"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>`,
  bag: `<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 016 0V8"/>`,
  user: `<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.8 3.6-5.5 7-5.5s6.2 1.7 7 5.5"/>`,
  mic: `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/>`,
  more: `<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>`,
};

export function icon(name: string, size = 24): string {
  const body = PATHS[name] ?? PATHS.file;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const FORMAT_ICON: Record<string, string> = {
  mp3: "audio", m4a: "audio", wav: "audio", flac: "audio", ogg: "audio", opus: "audio", aiff: "audio", wma: "audio",
  mp4: "video", mkv: "video", webm: "video", mov: "video", avi: "video", wmv: "video", gif: "video",
  png: "image", jpg: "image", webp: "image", avif: "image", bmp: "image", tiff: "image", ico: "image",
  pdf: "pdf", docx: "doc", html: "doc", odt: "doc", epub: "doc", md: "text", txt: "text",
  srt: "text", vtt: "text", ass: "text", xlsx: "sheet", ods: "sheet", csv: "sheet", tsv: "sheet",
  pptx: "slides", zip: "archive", tar: "archive", gzip: "archive",
};

const TOOL_ICON: Record<string, string> = {
  compress: "compress", half: "resize", max1920: "resize", max1080: "resize", max512: "resize",
  p1080: "resize", p720: "resize", p480: "resize", "rotate-right": "rotate", "rotate-left": "rotate-left",
  flip: "flip", grayscale: "gray", mute: "mute", frame: "frame", normalize: "normalize",
  "trim-silence": "scissors", faster: "speed", extract: "extract", zip: "archive",
  resize: "resize", trim: "scissors", crop: "crop", split: "split", transcribe: "captions",
};

const AI_ICON: Record<string, string> = {
  ocr: "ocr", "ocr-pdf": "pdf", rmbg: "cutout", up2: "upscale", up4: "upscale", summary: "summary", "talk-summary": "summary",
};

const SHARE_ICON: Record<string, string> = {
  "v-chat": "chat", "i-chat": "chat", "v-email": "mail", "i-email": "mail", "a-email": "mail", "p-email": "mail",
  "v-story": "phone", "v-web": "globe", "i-web": "globe", "i-fb": "image", "i-shopee": "bag", "i-avatar": "user",
  "a-voice": "mic", "a-podcast": "mic", "a-tiny": "compress", "p-small": "compress", "p-print": "pdf",
};

const ACTION_ICON: Record<string, string> = {
  open: "open", reveal: "folder", "copy-path": "clipboard", "copy-files": "copy",
  "copy-to": "download", "move-to": "move",
};

/** Icon name for an option id such as `convert:webp` or `tool:compress`. */
export function iconForOption(id: string): string {
  const [family, name = ""] = id.split(":");
  if (family === "convert") return FORMAT_ICON[name] ?? "convert";
  if (family === "merge") return "merge";
  if (family === "ai") return AI_ICON[name] ?? "cutout";
  if (family === "edit") return TOOL_ICON[name] ?? "more";
  if (family === "share") return SHARE_ICON[name] ?? "more";
  if (family === "action") return ACTION_ICON[name] ?? "more";
  return TOOL_ICON[name] ?? "more";
}

export function iconForKind(kind: string): string {
  const map: Record<string, string> = {
    image: "image", video: "video", audio: "audio", document: "doc", pdf: "pdf", subtitle: "text",
    spreadsheet: "sheet", slides: "slides", archive: "archive", folder: "folder",
  };
  return map[kind] ?? "file";
}

// ---------------------------------------------------------------- colours and file-type badges

const PALETTE = {
  blue: "#3b6cf5",
  sky: "#0ea5e9",
  violet: "#7c5cf2",
  teal: "#14b8a6",
  green: "#22a559",
  orange: "#f59e0b",
  deepOrange: "#f97316",
  red: "#ef4f4f",
  amber: "#d98324",
  slate: "#64748b",
};

const EXT_COLOR: Record<string, string> = {
  png: PALETTE.blue, jpg: PALETTE.blue, jpeg: PALETTE.blue, webp: PALETTE.blue, avif: PALETTE.blue,
  bmp: PALETTE.blue, tiff: PALETTE.blue, tif: PALETTE.blue, ico: PALETTE.blue, heic: PALETTE.blue, svg: PALETTE.blue,
  gif: PALETTE.violet, mp4: PALETTE.violet, mkv: PALETTE.violet, webm: PALETTE.violet, mov: PALETTE.violet,
  avi: PALETTE.violet, wmv: PALETTE.violet,
  mp3: PALETTE.orange, m4a: PALETTE.orange, wav: PALETTE.orange, flac: PALETTE.orange, ogg: PALETTE.orange,
  opus: PALETTE.orange, aiff: PALETTE.orange, wma: PALETTE.orange, aac: PALETTE.orange,
  pdf: PALETTE.red,
  docx: PALETTE.sky, doc: PALETTE.sky, odt: PALETTE.sky, rtf: PALETTE.sky, html: PALETTE.sky, htm: PALETTE.sky,
  md: PALETTE.slate, txt: PALETTE.slate, epub: PALETTE.teal,
  srt: PALETTE.teal, vtt: PALETTE.teal, ass: PALETTE.teal,
  xlsx: PALETTE.green, xls: PALETTE.green, ods: PALETTE.green, csv: PALETTE.green, tsv: PALETTE.green,
  pptx: PALETTE.deepOrange, ppt: PALETTE.deepOrange, odp: PALETTE.deepOrange,
  zip: PALETTE.amber, tar: PALETTE.amber, gzip: PALETTE.amber, gz: PALETTE.amber, rar: PALETTE.amber, "7z": PALETTE.amber,
};

export const extColor = (ext: string): string => EXT_COLOR[ext.toLowerCase()] ?? PALETTE.slate;

/** Friendly name shown under a format badge. */
export const FORMAT_LABEL: Record<string, string> = {
  png: "PNG image", jpg: "JPEG image", webp: "WebP image", avif: "AVIF image", bmp: "BMP image",
  tiff: "TIFF image", ico: "Icon", gif: "Animated GIF",
  mp4: "MP4 video", mkv: "MKV video", webm: "WebM video", mov: "QuickTime", avi: "AVI video", wmv: "WMV video",
  mp3: "MP3 audio", m4a: "M4A audio", wav: "WAV audio", flac: "FLAC audio", ogg: "OGG audio",
  opus: "Opus audio", aiff: "AIFF audio", wma: "WMA audio",
  pdf: "PDF", docx: "Word", odt: "OpenDocument", html: "Web page", md: "Markdown", txt: "Plain text", epub: "eBook",
  xlsx: "Excel", ods: "OpenSheet", csv: "CSV", tsv: "TSV", pptx: "PowerPoint",
  zip: "ZIP archive", tar: "TAR archive", gzip: "GZIP archive", srt: "SRT subtitles", vtt: "WebVTT", ass: "ASS subtitles",
};

const TOOL_COLOR: Record<string, string> = {
  convert: PALETTE.violet, compress: PALETTE.teal, resize: PALETTE.blue, crop: PALETTE.violet,
  rotate: PALETTE.orange, "rotate-left": PALETTE.orange, flip: PALETTE.violet, gray: PALETTE.slate,
  mute: PALETTE.red, frame: PALETTE.teal, normalize: PALETTE.green, scissors: PALETTE.orange,
  speed: PALETTE.deepOrange, merge: PALETTE.blue, split: PALETTE.teal, extract: PALETTE.amber, archive: PALETTE.amber,
  open: PALETTE.blue, folder: "#f5a623", clipboard: PALETTE.violet, copy: PALETTE.blue,
  download: PALETTE.green, move: PALETTE.orange, more: PALETTE.slate,
  chat: PALETTE.blue, mail: PALETTE.sky, phone: PALETTE.violet, globe: PALETTE.teal, bag: PALETTE.deepOrange,
  user: PALETTE.violet, mic: PALETTE.red, pdf: PALETTE.red, image: PALETTE.blue,
  ocr: PALETTE.teal, cutout: PALETTE.violet, upscale: PALETTE.blue, captions: PALETTE.orange, summary: PALETTE.green,
};

/** A document silhouette with the extension on a coloured ribbon, e.g. PNG, MP4, DOCX. */
export function fileBadge(ext: string, size = 36, color?: string): string {
  const c = color ?? extColor(ext);
  const label = ext.toUpperCase().slice(0, 4);
  const fontSize = label.length > 3 ? 9 : 10.4;
  return `<svg class="badge" width="${size}" height="${Math.round(size * 1.2)}" viewBox="0 0 40 48" aria-hidden="true">
    <path d="M9 3h15.5L35 13.5V42a3 3 0 01-3 3H9a3 3 0 01-3-3V6a3 3 0 013-3z" fill="#fff" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M24.5 3v7.5a3 3 0 003 3H35" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="1.5" y="24.5" width="33" height="14" rx="3.2" fill="${c}"/>
    <text x="18" y="35" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="#fff" letter-spacing=".2">${label}</text>
  </svg>`;
}

/** Icon for an option: a file badge for conversions, a coloured outline icon for tools and actions. */
export function optionIcon(id: string, size = 30): string {
  const [family, name = ""] = id.split(":");
  if (family === "convert") return fileBadge(name === "gzip" ? "gz" : name, size);
  const key = iconForOption(id);
  return `<span class="glyph" style="color:${TOOL_COLOR[key] ?? PALETTE.slate}">${icon(key, size)}</span>`;
}

/** Badge for the dragged file itself: its own extension, or a folder / generic file. */
export function sourceIcon(path: string, kind: string, size = 38): string {
  if (kind === "folder") return `<span class="glyph" style="color:#f5a623">${icon("folder", size)}</span>`;
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  if (!ext || ext.length > 5 || ext.includes("\\") || ext.includes("/")) {
    return `<span class="glyph" style="color:${PALETTE.slate}">${icon("file", size)}</span>`;
  }
  return fileBadge(ext, size);
}




