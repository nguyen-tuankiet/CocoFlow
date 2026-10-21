// The app's own icon set and palette (copied from src/icons.ts of the app), so the demo looks like the real wheel.

const PATHS: Record<string, string> = {
  convert: `<path d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2"/>`,
  image: `<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17.5l5-5 4 4 3-3 4.5 4.5"/>`,
  file: `<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>`,
  pdf: `<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M8.5 17.5v-4h1.8a1.3 1.3 0 010 2.6H8.5M13 17.5v-4h1.1a2 2 0 012 2v0a2 2 0 01-2 2H13z"/>`,
  archive: `<path d="M4 7.5L6 4h12l2 3.5V19a1 1 0 01-1 1H5a1 1 0 01-1-1z"/><path d="M4 7.5h16M12 11v5M9.5 12.5h5"/>`,
  folder: `<path d="M3 7.5A2.5 2.5 0 015.5 5H9l2 2.2h7.5A2.5 2.5 0 0121 9.7V17.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z"/>`,
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
};

export const PALETTE = {
  blue: "#3b6cf5", sky: "#0ea5e9", violet: "#7c5cf2", teal: "#14b8a6", green: "#22a559", orange: "#f59e0b",
  deepOrange: "#f97316", red: "#ef4f4f", amber: "#d98324", slate: "#64748b",
};
const P = PALETTE;

const EXT_COLOR: Record<string, string> = {
  png: P.blue, jpg: P.blue, jpeg: P.blue, webp: P.blue, avif: P.blue, bmp: P.blue, tiff: P.blue, tif: P.blue, ico: P.blue, heic: P.blue, svg: P.blue, psd: P.blue,
  gif: P.violet, mp4: P.violet, mkv: P.violet, webm: P.violet, mov: P.violet, avi: P.violet, wmv: P.violet,
  mp3: P.orange, m4a: P.orange, wav: P.orange, flac: P.orange, ogg: P.orange, opus: P.orange, aiff: P.orange, wma: P.orange, aac: P.orange,
  pdf: P.red,
  docx: P.sky, doc: P.sky, odt: P.sky, rtf: P.sky, html: P.sky, htm: P.sky,
  md: P.slate, txt: P.slate, epub: P.teal, srt: P.teal, vtt: P.teal, ass: P.teal,
  xlsx: P.green, xls: P.green, ods: P.green, csv: P.green, tsv: P.green,
  pptx: P.deepOrange, ppt: P.deepOrange, odp: P.deepOrange,
  zip: P.amber, tar: P.amber, gzip: P.amber, gz: P.amber, rar: P.amber, "7z": P.amber,
};
export const extColor = (ext: string) => EXT_COLOR[ext.toLowerCase()] ?? P.slate;

const TOOL_COLOR: Record<string, string> = {
  compress: P.teal, resize: P.blue, crop: P.violet, rotate: P.orange, "rotate-left": P.orange, flip: P.violet, gray: P.slate,
  mute: P.red, frame: P.teal, normalize: P.green, scissors: P.orange, speed: P.deepOrange, merge: P.blue, split: P.teal,
  extract: P.amber, archive: P.amber, open: P.blue, folder: "#f5a623", clipboard: P.violet, copy: P.blue, download: P.green, move: P.orange,
  chat: P.blue, mail: P.sky, phone: P.violet, globe: P.teal, bag: P.deepOrange, user: P.violet, mic: P.red, pdf: P.red, image: P.blue,
  ocr: P.teal, cutout: P.violet, upscale: P.blue, captions: P.orange, summary: P.green,
};
export const iconColor = (name: string) => TOOL_COLOR[name] ?? P.slate;

/** Outline icon in the colour the app gives it. */
export function Icon({ name, size = 24, color }: { name: string; size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ color: color ?? iconColor(name), display: "block" }}
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.file }}
    />
  );
}

/** A document silhouette with the extension on a coloured ribbon, exactly as in the app. */
export function FileBadge({ ext, size = 36 }: { ext: string; size?: number }) {
  const c = extColor(ext);
  const label = (ext === "gzip" ? "gz" : ext).toUpperCase().slice(0, 4);
  return (
    <svg width={size} height={Math.round(size * 1.2)} viewBox="0 0 40 48" aria-hidden="true" style={{ display: "block" }}>
      <path d="M9 3h15.5L35 13.5V42a3 3 0 01-3 3H9a3 3 0 01-3-3V6a3 3 0 013-3z" fill="#fff" stroke={c} strokeWidth={2} strokeLinejoin="round" />
      <path d="M24.5 3v7.5a3 3 0 003 3H35" fill={c} fillOpacity=".14" stroke={c} strokeWidth={2} strokeLinejoin="round" />
      <rect x="1.5" y="24.5" width="33" height="14" rx="3.2" fill={c} />
      <text x="18" y="35" textAnchor="middle" fontFamily="Segoe UI, Arial, sans-serif" fontWeight={800} fontSize={label.length > 3 ? 9 : 10.4} fill="#fff" letterSpacing=".2">{label}</text>
    </svg>
  );
}
