// Interface language (English / Vietnamese). The Rust side has its own table for notifications.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Lang = "en" | "vi";
export type LangSetting = "auto" | "en" | "vi";

let lang: Lang = "en";
let setting: LangSetting = "auto";
const listeners = new Set<() => void>();

export const getLang = () => lang;
export const getSetting = () => setting;
export const onLanguage = (fn: () => void) => void listeners.add(fn);

function apply(next: Lang) {
  lang = next;
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

export async function initLanguage() {
  const info = await invoke<{ setting: LangSetting; effective: Lang }>("get_language");
  setting = info.setting;
  apply(info.effective);
  await listen<Lang>("language-changed", (e) => apply(e.payload));
}

export async function chooseLanguage(next: LangSetting) {
  const info = await invoke<{ setting: LangSetting; effective: Lang }>("set_language", { setting: next });
  setting = info.setting;
  apply(info.effective);
}

type Entry = { en: string; vi: string };

const S: Record<string, Entry> = {
  // main window
  "drop.title": { en: "Drop files here", vi: "Thả file vào đây" },
  "drop.browse": { en: "browse", vi: "chọn file" },
  "drop.or": { en: "or", vi: "hoặc" },
  "drop.paste": { en: "paste an image (Ctrl+V)", vi: "dán ảnh (Ctrl+V)" },
  "drop.hint": {
    en: "— or drag files anywhere and hold {k1} (convert), {k2} (tools), {k3} (actions) or {k4} (share) to open the wheel. You can let go of the keys; hover the pills at the bottom to switch mode",
    vi: "— hoặc kéo file ở bất kỳ đâu và giữ {k1} (chuyển đổi), {k2} (công cụ), {k3} (thao tác) hay {k4} (chia sẻ) để mở bánh xe. Có thể nhả phím; rê chuột xuống các ô phía dưới để đổi chế độ",
  },
  "wheel.enable": { en: "Drag wheel", vi: "Bánh xe kéo thả" },
  "wheel.enable.tip": { en: "Show the wheel when you drag files while holding Shift / Ctrl / Alt", vi: "Hiện bánh xe khi kéo file và giữ Shift / Ctrl / Alt" },
  "wheel.anyapp": { en: "From any app", vi: "Từ mọi ứng dụng" },
  "wheel.anyapp.tip": { en: "Also open the wheel when the drag starts in other apps (browser, chat, editor…), not only Explorer and the desktop", vi: "Mở bánh xe cả khi kéo từ ứng dụng khác (trình duyệt, chat, editor…), không chỉ Explorer và màn hình desktop" },
  "autostart": { en: "Start with Windows", vi: "Khởi động cùng Windows" },
  "autostart.tip": { en: "Runs quietly in the system tray so the wheel is always available", vi: "Chạy ngầm ở khay hệ thống để bánh xe luôn sẵn sàng" },
  "update.check": { en: "Check for updates", vi: "Kiểm tra bản mới" },
  "update.check.tip": { en: "Asks GitHub once in a while whether a newer Cocoflow exists. Nothing else is sent.", vi: "Thỉnh thoảng hỏi GitHub xem có bản Cocoflow mới không. Không gửi thêm gì khác." },
  "update.available": { en: "Cocoflow {v} is available.", vi: "Đã có Cocoflow {v}." },
  "update.get": { en: "Download", vi: "Tải về" },
  "update.skip": { en: "Skip this version", vi: "Bỏ qua bản này" },
  "lang.label": { en: "Language", vi: "Ngôn ngữ" },
  "lang.auto": { en: "Auto", vi: "Tự động" },
  "clear": { en: "Clear", vi: "Xóa" },
  "activity": { en: "Activity", vi: "Hoạt động" },
  "activity.empty": { en: "Nothing yet.", vi: "Chưa có gì." },
  "activity.clear": { en: "Clear finished", vi: "Xóa mục đã xong" },
  "activity.cancelAll": { en: "Cancel all", vi: "Hủy tất cả" },
  "engines": { en: "Tools used for conversion", vi: "Công cụ dùng để chuyển đổi" },
  "install": { en: "install", vi: "cài đặt" },
  "no.options": { en: "No {mode} options for these files. Check the tools list below.", vi: "Không có lựa chọn {mode} cho các file này. Xem danh sách công cụ bên dưới." },
  // modes
  "mode.convert": { en: "Convert", vi: "Chuyển đổi" },
  "mode.tools": { en: "Tools", vi: "Công cụ" },
  "mode.actions": { en: "Actions", vi: "Thao tác" },
  "mode.share": { en: "Share", vi: "Chia sẻ" },
  "mode.ai": { en: "AI", vi: "AI" },
  // jobs
  "job.queued": { en: "Queued", vi: "Đang chờ" },
  "job.working": { en: "Working…", vi: "Đang xử lý…" },
  "job.done": { en: "Done", vi: "Xong" },
  "job.failed": { en: "Failed", vi: "Thất bại" },
  "job.paused": { en: "Paused", vi: "Tạm dừng" },
  "job.cancelled": { en: "Cancelled", vi: "Đã hủy" },
  "job.show": { en: "Show", vi: "Mở thư mục" },
  "job.pause": { en: "Pause", vi: "Tạm dừng" },
  "job.resume": { en: "Resume", vi: "Tiếp tục" },
  "job.cancel": { en: "Cancel", vi: "Hủy" },
  // wheel
  "wheel.files": { en: "{n} files", vi: "{n} file" },
  "wheel.try": { en: "Try {list}", vi: "Thử {list}" },
  "wheel.nothing": { en: "Nothing here", vi: "Không có gì ở đây" },
  "wheel.noPresets": { en: "No share presets for these files", vi: "Không có mẫu chia sẻ cho các file này" },
  "wheel.noMode": { en: "No {mode} for these files", vi: "Không có {mode} cho các file này" },
  // hints from the backend (exact strings)
  "Needs ImageMagick (HEIC, SVG)": { en: "Needs ImageMagick (HEIC, SVG)", vi: "Cần ImageMagick (HEIC, SVG)" },
  "Needs FFmpeg": { en: "Needs FFmpeg", vi: "Cần FFmpeg" },
  "Needs Pandoc to convert documents": { en: "Needs Pandoc to convert documents", vi: "Cần Pandoc để chuyển đổi tài liệu" },
  "Needs Ghostscript to convert PDFs": { en: "Needs Ghostscript to convert PDFs", vi: "Cần Ghostscript để chuyển đổi PDF" },
  "Needs LibreOffice to convert slides": { en: "Needs LibreOffice to convert slides", vi: "Cần LibreOffice để chuyển đổi slide" },
  "Nothing to convert for this type": { en: "Nothing to convert for this type", vi: "Loại file này không có gì để chuyển đổi" },
  "Needs the AI add-on": { en: "Needs the AI add-on (offline OCR, subtitles, background removal, upscaling)", vi: "Cần gói AI (OCR, phụ đề, xóa nền, phóng to — chạy offline)" },
  "No AI tools for this type of file": { en: "No AI tools for this type of file", vi: "Không có công cụ AI cho loại file này" },
  // editors
  "ed.cancel": { en: "Cancel", vi: "Hủy" },
  "ed.start": { en: "Start", vi: "Bắt đầu" },
  "ed.loading": { en: "Preparing preview…", vi: "Đang chuẩn bị bản xem trước…" },
  "ed.error": { en: "Cannot open this file: {msg}", vi: "Không mở được file này: {msg}" },
  "ed.trim.title": { en: "Trim", vi: "Cắt đoạn" },
  "ed.crop.title": { en: "Crop", vi: "Cắt khung hình" },
  "ed.split.title": { en: "Split", vi: "Tách file" },
  "ed.resize.title": { en: "Resize", vi: "Đổi kích thước" },
  "ed.trim.from": { en: "From", vi: "Từ" },
  "ed.trim.to": { en: "To", vi: "Đến" },
  "ed.trim.setStart": { en: "Start here", vi: "Đặt điểm đầu" },
  "ed.trim.setEnd": { en: "End here", vi: "Đặt điểm cuối" },
  "ed.trim.play": { en: "Play selection", vi: "Xem đoạn đã chọn" },
  "ed.trim.selection": { en: "Selection: {len} of {total}", vi: "Đoạn chọn: {len} trên {total}" },
  "ed.transcribe.title": { en: "Subtitles", vi: "Phụ đề" },
  "ed.tr.language": { en: "Spoken language", vi: "Ngôn ngữ trong file" },
  "ed.tr.auto": { en: "Detect automatically", vi: "Tự nhận diện" },
  "ed.tr.formats": { en: "Save as", vi: "Lưu thành" },
  "ed.tr.srt": { en: "SRT subtitles", vi: "Phụ đề SRT" },
  "ed.tr.vtt": { en: "VTT subtitles", vi: "Phụ đề VTT" },
  "ed.tr.txt": { en: "Plain transcript (TXT)", vi: "Bản ghi văn bản (TXT)" },
  "ed.tr.translate": { en: "Translate to English", vi: "Dịch sang tiếng Anh" },
  "ed.tr.note": { en: "Runs on this PC with an offline speech model; nothing is uploaded. Long files take a while: progress shows in Activity.", vi: "Chạy ngay trên máy bằng mô hình giọng nói offline, không tải gì lên mạng. File dài sẽ mất thời gian: xem tiến độ ở mục Hoạt động." },
  "ed.fast": { en: "Fast (no re-encoding, cut points may be off by a second or two)", vi: "Nhanh (không mã hóa lại, điểm cắt có thể lệch 1–2 giây)" },
  "ed.split.every": { en: "Every", vi: "Mỗi" },
  "ed.split.seconds": { en: "seconds", vi: "giây" },
  "ed.split.atMarkers": { en: "At markers", vi: "Tại các điểm đánh dấu" },
  "ed.split.addMarker": { en: "Add marker here", vi: "Thêm điểm đánh dấu tại đây" },
  "ed.split.parts": { en: "{n} parts", vi: "{n} đoạn" },
  "ed.split.noMarkers": { en: "Play or drag the timeline, then press “Add marker here”.", vi: "Tua đến vị trí cần tách rồi bấm “Thêm điểm đánh dấu tại đây”." },
  "ed.crop.aspect": { en: "Aspect ratio", vi: "Tỉ lệ khung" },
  "ed.crop.free": { en: "Free", vi: "Tự do" },
  "ed.crop.original": { en: "Original", vi: "Gốc" },
  "ed.crop.frame": { en: "Frame", vi: "Khung hình" },
  "ed.crop.hint": { en: "Drag the box or its corners. Size in pixels:", vi: "Kéo khung hoặc các góc. Kích thước theo điểm ảnh:" },
  "ed.resize.bySize": { en: "By size", vi: "Theo kích thước" },
  "ed.resize.byPercent": { en: "By percentage", vi: "Theo phần trăm" },
  "ed.resize.width": { en: "Width", vi: "Rộng" },
  "ed.resize.height": { en: "Height", vi: "Cao" },
  "ed.resize.percent": { en: "Percent", vi: "Phần trăm" },
  "ed.resize.note": { en: "The picture keeps its proportions and is never enlarged beyond its original size.", vi: "Ảnh giữ nguyên tỉ lệ và không bao giờ bị phóng to quá kích thước gốc." },
  "ed.resize.result": { en: "Result: about {w} × {h}", vi: "Kết quả: khoảng {w} × {h}" },
  "ed.resize.files": { en: "{n} files will be resized.", vi: "{n} file sẽ được đổi kích thước." },
  "ed.pdf.each": { en: "Each page as its own PDF", vi: "Mỗi trang một file PDF" },
  "ed.pdf.extract": { en: "Selected pages in one new PDF", vi: "Các trang đã chọn gộp thành một PDF mới" },
  "ed.pdf.ranges": { en: "Ranges, one PDF each (e.g. 1-3,5,8-)", vi: "Theo khoảng, mỗi khoảng một PDF (ví dụ 1-3,5,8-)" },
  "ed.pdf.pages": { en: "{n} pages", vi: "{n} trang" },
  "ed.pdf.pickHint": { en: "Click pages to select them; Shift+click selects a range.", vi: "Bấm vào trang để chọn; Shift+bấm để chọn cả khoảng." },
  "ed.pdf.first": { en: "Showing the first {n} pages.", vi: "Đang hiện {n} trang đầu." },
};

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const entry = S[key];
  let text = entry ? entry[lang] : key;
  for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  return text;
}

// ------------------------------------------------------------------ option labels

const OPTION_VI: Record<string, string> = {
  "tool:compress": "Nén nhẹ", "edit:resize": "Đổi kích thước…", "edit:crop": "Cắt khung…", "edit:trim": "Cắt đoạn…",
  "edit:split": "Tách file…", "tool:rotate-right": "Xoay phải", "tool:rotate-left": "Xoay trái", "tool:flip": "Lật ngang",
  "tool:grayscale": "Đen trắng", "tool:mute": "Bỏ âm thanh", "tool:frame": "Chụp khung hình",
  "tool:normalize": "Chuẩn hóa âm lượng", "tool:trim-silence": "Cắt khoảng lặng", "tool:faster": "Tăng tốc 1.5×",
  "tool:extract": "Giải nén", "tool:zip": "Nén zip", "merge:video": "Ghép", "merge:audio": "Ghép", "merge:pdf": "Ghép",
  "merge:images-pdf": "Gộp thành PDF",
  "action:open": "Mở", "action:reveal": "Mở thư mục", "action:copy-path": "Chép đường dẫn", "action:copy-files": "Chép file",
  "action:copy-to": "Sao chép đến…", "action:move-to": "Di chuyển đến…",
  "share:v-chat": "Zalo · Chat", "share:i-chat": "Zalo · Chat", "share:v-email": "Email", "share:i-email": "Email",
  "share:a-email": "Email", "share:p-email": "Email", "share:v-story": "Story 9:16", "share:v-web": "Web 1080p",
  "share:i-web": "Web", "share:i-fb": "Facebook", "share:i-shopee": "Shopee", "share:i-avatar": "Ảnh đại diện",
  "share:a-voice": "Tin nhắn thoại", "share:a-tiny": "Siêu nhỏ", "share:a-podcast": "Podcast",
  "share:p-small": "Nhỏ gọn", "share:p-print": "In ấn",
  "ai:ocr": "Chữ trong ảnh (OCR)", "ai:ocr-pdf": "PDF tìm kiếm được", "ai:rmbg": "Xóa nền", "ai:up2": "Phóng to ×2", "ai:up4": "Phóng to ×4",
  "ai:summary": "Tóm tắt", "ai:talk-summary": "Tóm tắt lời nói", "edit:transcribe": "Phụ đề…",
};

const FORMAT_VI: Record<string, string> = {
  png: "Ảnh PNG", jpg: "Ảnh JPEG", webp: "Ảnh WebP", avif: "Ảnh AVIF", bmp: "Ảnh BMP", tiff: "Ảnh TIFF", ico: "Biểu tượng",
  gif: "GIF động", mp4: "Video MP4", mkv: "Video MKV", webm: "Video WebM", mov: "QuickTime", avi: "Video AVI", wmv: "Video WMV",
  mp3: "Âm thanh MP3", m4a: "Âm thanh M4A", wav: "Âm thanh WAV", flac: "Âm thanh FLAC", ogg: "Âm thanh OGG",
  opus: "Âm thanh Opus", aiff: "Âm thanh AIFF", wma: "Âm thanh WMA", pdf: "PDF", docx: "Word", odt: "OpenDocument",
  html: "Trang web", md: "Markdown", txt: "Văn bản", epub: "Sách điện tử", xlsx: "Excel", ods: "OpenSheet", csv: "CSV",
  tsv: "TSV", pptx: "PowerPoint", zip: "File ZIP", tar: "File TAR", gzip: "File GZIP", srt: "Phụ đề SRT",
  vtt: "WebVTT", ass: "Phụ đề ASS",
};

const SUB_VI: Record<string, string> = { "high quality": "chất lượng cao", "MP3 mono": "MP3 mono" };

export const FORMAT_EN: Record<string, string> = {
  png: "PNG image", jpg: "JPEG image", webp: "WebP image", avif: "AVIF image", bmp: "BMP image", tiff: "TIFF image",
  ico: "Icon", gif: "Animated GIF", mp4: "MP4 video", mkv: "MKV video", webm: "WebM video", mov: "QuickTime",
  avi: "AVI video", wmv: "WMV video", mp3: "MP3 audio", m4a: "M4A audio", wav: "WAV audio", flac: "FLAC audio",
  ogg: "OGG audio", opus: "Opus audio", aiff: "AIFF audio", wma: "WMA audio", pdf: "PDF", docx: "Word",
  odt: "OpenDocument", html: "Web page", md: "Markdown", txt: "Plain text", epub: "eBook", xlsx: "Excel",
  ods: "OpenSheet", csv: "CSV", tsv: "TSV", pptx: "PowerPoint", zip: "ZIP archive", tar: "TAR archive",
  gzip: "GZIP archive", srt: "SRT subtitles", vtt: "WebVTT", ass: "ASS subtitles",
};

/** Label for an option, translated when a translation exists. */
export function optionLabel(id: string, fallback: string): string {
  if (id.startsWith("convert:")) {
    const fmt = id.slice(8);
    return (lang === "vi" ? FORMAT_VI[fmt] : FORMAT_EN[fmt]) ?? fallback;
  }
  return lang === "vi" ? (OPTION_VI[id] ?? fallback) : fallback;
}

export function optionSub(sub: string | null | undefined): string {
  if (!sub) return "";
  return lang === "vi" ? (SUB_VI[sub] ?? sub) : sub;
}

export const modeLabel = (mode: string) => t(`mode.${mode}`);

// ------------------------------------------------------------------ messages from the Rust side

const ERRORS: [RegExp, string][] = [
  [/^Already under (.+) — nothing to shrink$/, "Đã nhỏ hơn $1 — không cần nén"],
  [/^This video is too long to fit in (.+)$/, "Video quá dài, không thể gói gọn trong $1"],
  [/^This audio is too long to fit in (.+)$/, "Âm thanh quá dài, không thể gói gọn trong $1"],
  [/^Could not get this image under (.+)$/, "Không thể nén ảnh này xuống dưới $1"],
  [/^No text found in this PDF/, "Không tìm thấy chữ trong PDF này (có thể là ảnh quét)"],
  [/^(FFmpeg|Pandoc|ImageMagick|Ghostscript|LibreOffice|7-Zip|Microsoft Edge) was not found$/, "Không tìm thấy $1"],
  [/^Cannot read the (video|audio) length$/, "Không đọc được độ dài của file"],
  [/^Cannot convert (.+) to (.+)$/, "Không thể chuyển $1 sang $2"],
  [/^The end must be after the start$/, "Điểm cuối phải sau điểm đầu"],
  [/^Invalid (start|end) time$/, "Thời gian không hợp lệ"],
  [/^The crop area is empty$/, "Vùng cắt đang trống"],
  [/^Enter a width, a height or a percentage$/, "Hãy nhập chiều rộng, chiều cao hoặc phần trăm"],
  [/^Add at least one split point$/, "Hãy thêm ít nhất một điểm tách"],
  [/^Segments must be at least 1 second$/, "Mỗi đoạn phải dài ít nhất 1 giây"],
  [/^Pages must look like/, "Trang phải có dạng 1-3,5,8-"],
  [/^Internal error while processing this file$/, "Lỗi nội bộ khi xử lý file này"],
  [/^This file type cannot be converted$/, "Loại file này không thể chuyển đổi"],
  [/^Compress supports jpg, png and webp$/, "Chỉ nén được ảnh jpg, png và webp"],
  [/^This file has no audio track$/, "File này không có âm thanh"],
  [/^No text was recognised in this document$/, "Không nhận ra chữ nào trong tài liệu này"],
  [/^There is no text to summarise$/, "Không có nội dung để tóm tắt"],
  [/^This PDF has no text layer; the AI add-on/, "PDF này không có lớp chữ; cần gói AI (OCR) để đọc"],
  [/^OCR failed:/, "OCR thất bại"],
];

export function translateError(message: string): string {
  if (lang !== "vi") return message;
  const first = message.split("\n")[0];
  for (const [pattern, replacement] of ERRORS) {
    if (pattern.test(first)) return first.replace(pattern, replacement);
  }
  return message;
}



