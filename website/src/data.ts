// What Cocoflow offers per kind of file. Mirrors src-tauri/src/catalog.rs, goals.rs and src/i18n.ts of the app; keep them in step.

export type L = { vi: string; en: string };
const L = (vi: string, en: string): L => ({ vi, en });

export type ModeKey = "convert" | "tools" | "actions" | "share" | "ai";
export const MODE_KEYS: ModeKey[] = ["convert", "tools", "actions", "share", "ai"];

export const MODE_INFO: Record<ModeKey, { label: L; keys: string }> = {
  convert: { label: L("Chuyển đổi", "Convert"), keys: "Shift" },
  tools: { label: L("Công cụ", "Tools"), keys: "Ctrl" },
  actions: { label: L("Thao tác", "Actions"), keys: "Alt" },
  share: { label: L("Chia sẻ", "Share"), keys: "Shift+Ctrl" },
  ai: { label: L("AI", "AI"), keys: "Ctrl+Alt" },
};

/** Friendly format names shown under the badge. */
export const FORMAT: Record<string, L> = {
  png: L("Ảnh PNG", "PNG image"), jpg: L("Ảnh JPEG", "JPEG image"), webp: L("Ảnh WebP", "WebP image"), avif: L("Ảnh AVIF", "AVIF image"),
  bmp: L("Ảnh BMP", "BMP image"), tiff: L("Ảnh TIFF", "TIFF image"), ico: L("Biểu tượng", "Icon"), gif: L("GIF động", "Animated GIF"),
  mp4: L("Video MP4", "MP4 video"), mkv: L("Video MKV", "MKV video"), webm: L("Video WebM", "WebM video"), mov: L("QuickTime", "QuickTime"),
  avi: L("Video AVI", "AVI video"), wmv: L("Video WMV", "WMV video"),
  mp3: L("Âm thanh MP3", "MP3 audio"), m4a: L("Âm thanh M4A", "M4A audio"), wav: L("Âm thanh WAV", "WAV audio"), flac: L("Âm thanh FLAC", "FLAC audio"),
  ogg: L("Âm thanh OGG", "OGG audio"), opus: L("Âm thanh Opus", "Opus audio"), aiff: L("Âm thanh AIFF", "AIFF audio"), wma: L("Âm thanh WMA", "WMA audio"),
  pdf: L("PDF", "PDF"), docx: L("Word", "Word"), odt: L("OpenDocument", "OpenDocument"), html: L("Trang web", "Web page"), md: L("Markdown", "Markdown"),
  txt: L("Văn bản", "Plain text"), epub: L("Sách điện tử", "eBook"), xlsx: L("Excel", "Excel"), ods: L("OpenSheet", "OpenSheet"), csv: L("CSV", "CSV"),
  tsv: L("TSV", "TSV"), pptx: L("PowerPoint", "PowerPoint"), zip: L("File ZIP", "ZIP archive"), tar: L("File TAR", "TAR archive"),
  gzip: L("File GZIP", "GZIP archive"), srt: L("Phụ đề SRT", "SRT subtitles"), vtt: L("WebVTT", "WebVTT"), ass: L("Phụ đề ASS", "ASS subtitles"),
};

// ---- options other than plain format conversion (labels are the app's own)
export type OptDef = { label: L; icon: string; suffix: string; ext?: string; toast?: L };

export const TOOLS: Record<string, OptDef> = {
  compress: { label: L("Nén nhẹ", "Compress"), icon: "compress", suffix: "-nen" },
  resize: { label: L("Đổi kích thước…", "Resize…"), icon: "resize", suffix: "-doi-co" },
  crop: { label: L("Cắt khung…", "Crop…"), icon: "crop", suffix: "-cat-khung" },
  trim: { label: L("Cắt đoạn…", "Trim…"), icon: "scissors", suffix: "-cat" },
  split: { label: L("Tách file…", "Split…"), icon: "split", suffix: "-phan-1" },
  "rotate-right": { label: L("Xoay phải", "Rotate right"), icon: "rotate", suffix: "-xoay" },
  "rotate-left": { label: L("Xoay trái", "Rotate left"), icon: "rotate-left", suffix: "-xoay" },
  flip: { label: L("Lật ngang", "Flip"), icon: "flip", suffix: "-lat" },
  grayscale: { label: L("Đen trắng", "Grayscale"), icon: "gray", suffix: "-den-trang" },
  mute: { label: L("Bỏ âm thanh", "Remove audio"), icon: "mute", suffix: "-khong-tieng" },
  frame: { label: L("Chụp khung hình", "Grab frame"), icon: "frame", suffix: "-khung", ext: "jpg" },
  normalize: { label: L("Chuẩn hóa âm lượng", "Normalize"), icon: "normalize", suffix: "-chuan-hoa" },
  "trim-silence": { label: L("Cắt khoảng lặng", "Trim silence"), icon: "scissors", suffix: "-gon" },
  faster: { label: L("Tăng tốc 1.5×", "Speed 1.5×"), icon: "speed", suffix: "-1.5x" },
  extract: { label: L("Giải nén", "Extract here"), icon: "extract", suffix: "", toast: L("Đã giải nén cạnh file gốc", "Extracted next to the archive") },
  zip: { label: L("Nén zip", "Zip"), icon: "archive", suffix: "", ext: "zip" },
};

export const ACTIONS: Record<string, OptDef> = {
  open: { label: L("Mở", "Open"), icon: "open", suffix: "", toast: L("Đã mở", "Opened") },
  reveal: { label: L("Mở thư mục", "Show in folder"), icon: "folder", suffix: "", toast: L("Đã mở thư mục chứa file", "Shown in folder") },
  "copy-path": { label: L("Chép đường dẫn", "Copy path"), icon: "clipboard", suffix: "", toast: L("Đã sao chép đường dẫn", "Path copied") },
  "copy-files": { label: L("Chép file", "Copy file"), icon: "copy", suffix: "", toast: L("Đã sao chép file", "File copied") },
  "copy-to": { label: L("Sao chép đến…", "Copy to…"), icon: "download", suffix: "", toast: L("Chọn thư mục để sao chép", "Choose a folder to copy to") },
  "move-to": { label: L("Di chuyển đến…", "Move to…"), icon: "move", suffix: "", toast: L("Chọn thư mục để di chuyển", "Choose a folder to move to") },
};
export const ACTION_KEYS = Object.keys(ACTIONS);

export const AI: Record<string, OptDef> = {
  ocr: { label: L("Chữ trong ảnh (OCR)", "Text (OCR)"), icon: "ocr", suffix: "-ocr", ext: "txt" },
  "ocr-pdf": { label: L("PDF tìm kiếm được", "Searchable PDF"), icon: "pdf", suffix: "-ocr", ext: "pdf" },
  rmbg: { label: L("Xóa nền", "Remove background"), icon: "cutout", suffix: "-xoa-nen", ext: "png" },
  up2: { label: L("Phóng to ×2", "Upscale ×2"), icon: "upscale", suffix: "-x2", ext: "png" },
  up4: { label: L("Phóng to ×4", "Upscale ×4"), icon: "upscale", suffix: "-x4", ext: "png" },
  transcribe: { label: L("Phụ đề…", "Subtitles…"), icon: "captions", suffix: "", ext: "srt" },
  "talk-summary": { label: L("Tóm tắt lời nói", "Summary of speech"), icon: "summary", suffix: "-tom-tat", ext: "txt" },
  summary: { label: L("Tóm tắt", "Summary"), icon: "summary", suffix: "-tom-tat", ext: "txt" },
};

export type Goal = { label: L; sub: string; icon: string; suffix: string; ext: string };
const G = (vi: string, en: string, sub: string, icon: string, suffix: string, ext: string): Goal => ({ label: L(vi, en), sub, icon, suffix, ext });

// ---- the kinds of file
export type FType = {
  id: string;
  name: L;
  example: { name: string; ext: string; size: string };
  inputs: string[];
  convert: string[];
  tools: string[];
  share: Goal[];
  ai: string[];
  hideTools?: string[]; // real tools left out of the Features chips so that the row stays on one line
  multi?: L; // what several files can be merged into
  note?: L;
  seconds: number; // how long the demo job seems to run
};

export const TYPES: FType[] = [
  {
    id: "image", name: L("Ảnh", "Images"), example: { name: "anh-da-lat", ext: "png", size: "4 MB" },
    inputs: ["PNG", "JPG", "WebP", "BMP", "GIF", "TIFF", "ICO", "AVIF", "HEIC", "SVG", "PSD"],
    convert: ["png", "jpg", "webp", "avif", "bmp", "gif", "tiff", "ico", "pdf"],
    tools: ["compress", "resize", "crop", "rotate-right", "rotate-left", "flip", "grayscale", "zip"],
    share: [
      G("Zalo · Chat", "Zalo · Chat", "≤ 1 MB", "chat", "-zalo", "jpg"), G("Email", "Email", "≤ 500 KB", "mail", "-email", "jpg"),
      G("Web", "Web", "≤ 200 KB", "globe", "-web", "jpg"), G("Facebook", "Facebook", "2048 px", "image", "-fb", "jpg"),
      G("Shopee", "Shopee", "1000×1000", "bag", "-shopee", "jpg"), G("Ảnh đại diện", "Avatar", "512×512", "user", "-avatar", "jpg"),
    ],
    ai: ["ocr", "ocr-pdf", "rmbg", "up2", "up4"],
    multi: L("gộp thành một file PDF", "combine into one PDF"),
    note: L("HEIC, SVG và PSD đổi được sang PNG, JPG, WebP và PDF.", "HEIC, SVG and PSD convert to PNG, JPG, WebP and PDF."),
    seconds: 1.1,
  },
  {
    id: "video", name: L("Video", "Video"), example: { name: "chuyen-di", ext: "mp4", size: "148 MB" },
    inputs: ["MP4", "MKV", "MOV", "AVI", "WebM", "WMV", "FLV", "M4V", "MPG", "TS", "3GP"],
    convert: ["mp4", "mkv", "webm", "mov", "avi", "wmv", "gif", "mp3", "m4a"],
    tools: ["compress", "resize", "trim", "crop", "split", "mute", "rotate-right", "frame", "zip"],
    hideTools: ["rotate-right", "zip"],
    share: [
      G("Zalo · Chat", "Zalo · Chat", "≤ 25 MB", "chat", "-zalo", "mp4"), G("Email", "Email", "≤ 10 MB", "mail", "-email", "mp4"),
      G("Story 9:16", "Story 9:16", "1080×1920", "phone", "-story", "mp4"), G("Web 1080p", "Web 1080p", "YouTube · FB", "globe", "-web", "mp4"),
    ],
    ai: ["transcribe", "talk-summary"],
    multi: L("ghép thành một video", "join into one video"),
    seconds: 2.2,
  },
  {
    id: "audio", name: L("Âm thanh", "Audio"), example: { name: "ghi-am", ext: "mp3", size: "10 MB" },
    inputs: ["MP3", "WAV", "FLAC", "OGG", "M4A", "AAC", "Opus", "WMA", "AIFF"],
    convert: ["mp3", "wav", "flac", "ogg", "m4a", "opus", "aiff", "wma"],
    tools: ["normalize", "trim-silence", "faster", "trim", "split", "zip"],
    share: [
      G("Tin nhắn thoại", "Voice note", "≤ 5 MB", "mic", "-thoai", "m4a"), G("Email", "Email", "≤ 10 MB", "mail", "-email", "mp3"),
      G("Siêu nhỏ", "Tiny", "≤ 1 MB", "compress", "-nho", "mp3"), G("Podcast", "Podcast", "MP3 mono", "mic", "-podcast", "mp3"),
    ],
    ai: ["transcribe", "talk-summary"],
    multi: L("ghép thành một file âm thanh", "join into one audio file"),
    seconds: 1.4,
  },
  {
    id: "pdf", name: L("PDF", "PDF"), example: { name: "bao-cao", ext: "pdf", size: "12 MB" },
    inputs: ["PDF"],
    convert: ["png", "jpg", "txt", "md", "epub", "docx", "pptx"],
    tools: ["compress", "split", "zip"],
    share: [G("Email", "Email", "≤ 10 MB", "mail", "-email", "pdf"), G("Nhỏ gọn", "Small", "≤ 2 MB", "compress", "-nho", "pdf"), G("In ấn", "Print", "chất lượng cao", "pdf", "-in", "pdf")],
    ai: ["ocr", "ocr-pdf", "summary"],
    multi: L("gộp thành một file PDF", "merge into one PDF"),
    note: L("PDF sang PowerPoint (và DOCX giữ nguyên bố cục) cần bản đầy đủ, có sẵn LibreOffice.", "PDF to PowerPoint (and layout-exact DOCX) needs the full build, which includes LibreOffice."),
    seconds: 1.3,
  },
  {
    id: "document", name: L("Tài liệu", "Documents"), example: { name: "ke-hoach", ext: "docx", size: "380 KB" },
    inputs: ["DOCX", "ODT", "RTF", "EPUB", "HTML", "Markdown", "TXT", "TeX", "RST"],
    convert: ["docx", "html", "md", "txt", "epub", "odt", "pdf"],
    tools: ["zip"],
    share: [],
    ai: ["summary"],
    seconds: 1.0,
  },
  {
    id: "sheet", name: L("Bảng tính", "Spreadsheets"), example: { name: "doanh-thu", ext: "xlsx", size: "1 MB" },
    inputs: ["XLSX", "XLS", "ODS", "CSV", "TSV"],
    convert: ["xlsx", "ods", "csv", "tsv", "pdf"],
    tools: ["zip"],
    share: [],
    ai: [],
    seconds: 0.9,
  },
  {
    id: "slides", name: L("Slide", "Slides"), example: { name: "thuyet-trinh", ext: "pptx", size: "6 MB" },
    inputs: ["PPTX", "PPT", "ODP"],
    convert: ["pdf", "jpg", "png"],
    tools: ["zip"],
    share: [],
    ai: [],
    note: L("Cần bản đầy đủ, có sẵn LibreOffice.", "Needs the full build, which includes LibreOffice."),
    seconds: 1.6,
  },
  {
    id: "archive", name: L("File nén", "Archives"), example: { name: "du-an", ext: "zip", size: "58 MB" },
    inputs: ["ZIP", "7Z", "RAR", "TAR", "GZ", "BZ2", "XZ"],
    convert: ["zip", "tar", "gzip"],
    tools: ["extract"],
    share: [],
    ai: [],
    seconds: 1.2,
  },
  {
    id: "subtitle", name: L("Phụ đề", "Subtitles"), example: { name: "phu-de", ext: "srt", size: "42 KB" },
    inputs: ["SRT", "VTT", "ASS", "SSA"],
    convert: ["srt", "vtt", "ass", "txt"],
    tools: [],
    share: [],
    ai: [],
    seconds: 0.6,
  },
];

// ---- what each option does, in one sentence (shown when a chip is picked in the Features section)
export const TOOL_DESC: Record<string, L> = {
  compress: L("Giảm dung lượng mà vẫn giữ chất lượng gần như nguyên.", "Shrinks the file while keeping almost the same quality."),
  resize: L("Đổi kích thước theo điểm ảnh hoặc phần trăm, có xem trước.", "Resize by pixels or percent, with a preview."),
  crop: L("Khoanh vùng cần giữ, có xem trước trước khi lưu.", "Frame the area to keep, with a preview before saving."),
  trim: L("Chọn đoạn cần giữ bằng thanh trượt, có xem trước.", "Pick the part to keep with a slider, with a preview."),
  split: L("Tách thành nhiều đoạn theo thời gian hoặc điểm đánh dấu.", "Split into parts by time or at markers."),
  "rotate-right": L("Xoay 90° theo chiều kim đồng hồ.", "Rotate 90° clockwise."),
  "rotate-left": L("Xoay 90° ngược chiều kim đồng hồ.", "Rotate 90° counter-clockwise."),
  flip: L("Lật ngang hình.", "Flip horizontally."),
  grayscale: L("Chuyển hình sang đen trắng.", "Turn the picture black and white."),
  mute: L("Xóa âm thanh khỏi video.", "Remove the sound from a video."),
  frame: L("Lưu một khung hình của video thành ảnh JPG.", "Save a frame of the video as a JPG picture."),
  normalize: L("Cân bằng âm lượng cho đều.", "Even out the volume."),
  "trim-silence": L("Cắt khoảng lặng ở đầu và cuối.", "Cut silence at the start and end."),
  faster: L("Phát nhanh gấp 1,5 lần, giữ nguyên cao độ.", "Play 1.5× faster, keeping the pitch."),
  extract: L("Giải nén vào thư mục cạnh file gốc.", "Extract into a folder next to the archive."),
  zip: L("Nén vào một file zip.", "Pack into a zip file."),
};

export const AI_DESC: Record<string, L> = {
  ocr: L("Đọc chữ tiếng Việt và tiếng Anh trong ảnh hoặc PDF quét ra file văn bản.", "Reads Vietnamese and English text in a picture or scanned PDF into a text file."),
  "ocr-pdf": L("Biến PDF quét thành PDF có thể tìm kiếm và chọn chữ.", "Turns a scanned PDF into one you can search and select text in."),
  rmbg: L("Tách nền, giữ chủ thể trên nền trong suốt.", "Removes the background and keeps the subject on transparency."),
  up2: L("Phóng to ảnh gấp 2 lần mà vẫn nét.", "Makes the picture 2× larger and still sharp."),
  up4: L("Phóng to ảnh gấp 4 lần mà vẫn nét.", "Makes the picture 4× larger and still sharp."),
  transcribe: L("Chuyển lời nói thành phụ đề SRT hoặc VTT bằng Whisper.", "Turns speech into SRT or VTT subtitles with Whisper."),
  "talk-summary": L("Tóm tắt nội dung lời nói.", "Summarizes what is said."),
  summary: L("Rút ra các ý chính của tài liệu.", "Pulls out the key points of the document."),
};

/** Normalised extension of an input label such as "WebM", "Markdown" or "GZ". */
export const extOf = (label: string): string => {
  const e = label.toLowerCase();
  return ({ markdown: "md", jpeg: "jpg", tif: "tiff", gz: "gzip" } as Record<string, string>)[e] ?? e;
};

/** What the wheel offers for a given kind of file once the source format is known (mirrors catalog.rs). */
export function listsFor(type: FType, ext: string) {
  const magick = type.id === "image" && ["heic", "svg", "psd"].includes(ext); // these need ImageMagick
  const convert = magick ? ["png", "jpg", "webp", "pdf"] : type.convert.filter((x) => x !== ext);
  let tools = type.tools;
  if (type.id === "image") {
    if (magick) tools = ["zip"];
    else if (!["jpg", "png", "webp"].includes(ext)) tools = tools.filter((k) => k !== "compress");
  }
  const ai = magick ? [] : type.ai;
  return { convert, tools, ai, share: type.share };
}

/** Convert targets without the file's own format. */
export const targetsFor = (t: FType) => t.convert.filter((x) => x !== t.example.ext);
