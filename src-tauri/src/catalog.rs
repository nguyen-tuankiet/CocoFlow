use crate::engines::Engines;
use serde::Serialize;
use std::path::Path;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Image,
    Video,
    Audio,
    Document,
    Pdf,
    Subtitle,
    Spreadsheet,
    Slides,
    Archive,
    Folder,
    Other,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Kind::Image => "image",
            Kind::Video => "video",
            Kind::Audio => "audio",
            Kind::Document => "document",
            Kind::Pdf => "pdf",
            Kind::Subtitle => "subtitle",
            Kind::Spreadsheet => "spreadsheet",
            Kind::Slides => "slides",
            Kind::Archive => "archive",
            Kind::Folder => "folder",
            Kind::Other => "file",
        }
    }
}

pub fn ext_of(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Image formats that ffmpeg cannot decode and need ImageMagick.
pub fn needs_magick(ext: &str) -> bool {
    matches!(ext, "heic" | "heif" | "svg" | "psd")
}

pub fn kind_of(path: &Path) -> Kind {
    if path.is_dir() {
        return Kind::Folder;
    }
    match ext_of(path).as_str() {
        "png" | "jpg" | "jpeg" | "jfif" | "webp" | "bmp" | "gif" | "tif" | "tiff" | "ico" | "avif" | "heic" | "heif"
        | "svg" | "psd" => Kind::Image,
        "mp4" | "mkv" | "mov" | "avi" | "webm" | "wmv" | "flv" | "m4v" | "mpg" | "mpeg" | "ts" | "3gp" => {
            Kind::Video
        }
        "mp3" | "wav" | "flac" | "ogg" | "m4a" | "aac" | "opus" | "wma" | "aiff" => Kind::Audio,
        "md" | "markdown" | "html" | "htm" | "txt" | "docx" | "odt" | "rtf" | "epub" | "tex" | "rst" => {
            Kind::Document
        }
        "pdf" => Kind::Pdf,
        "srt" | "vtt" | "ass" | "ssa" => Kind::Subtitle,
        "xlsx" | "xls" | "ods" | "csv" | "tsv" => Kind::Spreadsheet,
        "pptx" | "ppt" | "odp" => Kind::Slides,
        "zip" | "tar" | "gz" | "tgz" | "7z" | "rar" | "bz2" | "xz" => Kind::Archive,
        _ => Kind::Other,
    }
}

/// The kind shared by every path, or `Other` when they differ.
pub fn common_kind(paths: &[impl AsRef<Path>]) -> Kind {
    let mut kinds = paths.iter().map(|p| kind_of(p.as_ref()));
    match kinds.next() {
        Some(first) if kinds.all(|k| k == first) => first,
        _ => Kind::Other,
    }
}

#[derive(Serialize, Clone)]
pub struct OptionDto {
    pub id: String,
    pub label: String,
    pub icon: String,
    /// Caption under the label (size goals: the target size).
    pub sub: Option<String>,
}

#[derive(Serialize, Default)]
pub struct AllOptions {
    pub kind: String,
    pub count: usize,
    /// Why there are no conversions, when there are none (e.g. a missing engine).
    pub convert_hint: Option<String>,
    pub convert: Vec<OptionDto>,
    pub tools: Vec<OptionDto>,
    pub actions: Vec<OptionDto>,
    /// Purpose presets (chat, email, story…), opened with Shift+Ctrl.
    pub share: Vec<OptionDto>,
    /// Offline AI tools (OCR, subtitles, background removal, upscaling, summary), opened with Ctrl+Alt.
    pub ai: Vec<OptionDto>,
    /// Why the AI list is empty (add-on missing or nothing for this type).
    pub ai_hint: Option<String>,
    /// Combined size of the files in bytes (shown as 148 MB → ≤ 25 MB).
    pub total_size: u64,
}

fn opt(id: impl Into<String>, label: impl Into<String>, icon: &str) -> OptionDto {
    OptionDto { id: id.into(), label: label.into(), icon: icon.to_string(), sub: None }
}

fn convert_targets(kind: Kind, ext: &str, eng: &Engines) -> Vec<&'static str> {
    let ff = eng.ffmpeg.is_some();
    let list: Vec<&'static str> = match kind {
        Kind::Image if needs_magick(ext) && eng.magick.is_none() => vec![],
        Kind::Image if needs_magick(ext) => vec!["png", "jpg", "jfif", "webp", "pdf"],
        Kind::Image if ff => {
            let mut v = vec!["png", "jpg", "jfif", "webp", "avif", "bmp", "gif", "tiff", "ico"];
            if eng.magick.is_some() {
                v.push("pdf");
            }
            v
        }
        Kind::Video if ff => vec!["mp4", "mkv", "webm", "mov", "avi", "wmv", "gif", "mp3", "m4a"],
        Kind::Audio if ff => vec!["mp3", "wav", "flac", "ogg", "m4a", "opus", "aiff", "wma"],
        Kind::Subtitle => {
            let mut v = if ff { vec!["srt", "vtt", "ass"] } else { vec![] };
            v.push("txt");
            v
        }
        Kind::Document => {
            let mut v = Vec::new();
            if eng.pandoc.is_some() {
                v.extend(["docx", "html", "md", "txt", "epub", "odt"]);
            }
            // Printing to PDF goes through Edge; HTML needs no Pandoc, everything else does.
            if eng.edge.is_some() && (eng.pandoc.is_some() || matches!(ext, "html" | "htm")) {
                v.push("pdf");
            }
            v
        }
        Kind::Pdf => {
            let mut v = Vec::new();
            if eng.gs.is_some() {
                v.extend(["png", "jpg", "txt", "md"]);
                if eng.pandoc.is_some() {
                    v.push("epub");
                }
            }
            // Layout-preserving import needs LibreOffice; without it DOCX falls back to plain text.
            if eng.soffice.is_some() || (eng.gs.is_some() && eng.pandoc.is_some()) {
                v.push("docx");
            }
            if eng.soffice.is_some() {
                v.push("pptx");
            }
            v
        }
        Kind::Slides => {
            let mut v = Vec::new();
            if eng.soffice.is_some() {
                v.push("pdf");
                if eng.gs.is_some() {
                    v.extend(["jpg", "png"]);
                }
            }
            v
        }
        Kind::Spreadsheet => {
            let mut v = vec!["xlsx", "ods", "csv", "tsv"];
            if eng.edge.is_some() {
                v.push("pdf");
            }
            v
        }
        Kind::Archive if eng.archiver.is_some() => vec!["zip", "tar", "gzip"],
        _ => vec![],
    };
    // "jpeg" is the same format as "jpg"; gz/tgz archives are the "gzip" target.
    let same = match ext {
        "jpeg" => "jpg",
        "gz" | "tgz" => "gzip",
        "htm" => "html",
        "markdown" => "md",
        "tif" => "tiff",
        other => other,
    };
    list.into_iter().filter(|t| *t != same).collect()
}

fn convert_icon(kind: Kind, target: &str) -> &'static str {
    match target {
        "mp3" | "m4a" | "wav" | "flac" | "ogg" | "opus" | "aiff" | "wma" => "🎵",
        "gif" => "🎞️",
        "pdf" => "📕",
        "xlsx" | "ods" | "csv" | "tsv" => "📊",
        "pptx" => "📽️",
        "zip" | "tar" | "gzip" => "🗃️",
        "epub" => "📖",
        "txt" | "md" => "📝",
        _ => match kind {
            Kind::Video => "🎬",
            Kind::Image => "🖼️",
            Kind::Audio => "🎵",
            Kind::Pdf | Kind::Slides => "🖼️",
            Kind::Spreadsheet => "📊",
            _ => "📄",
        },
    }
}

fn tool_options(kind: Kind, ext: &str, count: usize, eng: &Engines) -> Vec<OptionDto> {
    let mut v = Vec::new();
    let ff = eng.ffmpeg.is_some();
    match kind {
        Kind::Image if ff && !needs_magick(ext) => {
            if matches!(ext, "jpg" | "jpeg" | "jfif" | "png" | "webp") {
                v.push(opt("tool:compress", "Compress", "🗜️"));
            }
            v.push(opt("edit:resize", "Resize…", "📐"));
            if count == 1 {
                v.push(opt("edit:crop", "Crop…", "✂️"));
            }
            if eng.magick.is_some() {
                // straightens the page by itself; the second one lets the user place the four corners
                v.push(opt("edit:autoscan", "Straighten document", "📄"));
                if count == 1 {
                    v.push(opt("edit:scan", "Straighten (adjust corners)…", "📐"));
                }
            }
            v.push(opt("tool:rotate-right", "Rotate right", "↻"));
            v.push(opt("tool:rotate-left", "Rotate left", "↺"));
            v.push(opt("tool:flip", "Flip", "↔️"));
            v.push(opt("tool:grayscale", "Grayscale", "⚫"));
        }
        Kind::Video if ff => {
            v.push(opt("tool:compress", "Compress", "🗜️"));
            v.push(opt("edit:resize", "Resize…", "📺"));
            if count == 1 {
                v.push(opt("edit:trim", "Trim…", "✂️"));
                v.push(opt("edit:crop", "Crop…", "🔲"));
                v.push(opt("edit:split", "Split…", "🔀"));
            }
            v.push(opt("tool:mute", "Remove audio", "🔇"));
            v.push(opt("tool:rotate-right", "Rotate right", "↻"));
            v.push(opt("tool:frame", "Grab frame", "📸"));
        }
        Kind::Audio if ff => {
            v.push(opt("tool:normalize", "Normalize", "📊"));
            v.push(opt("tool:trim-silence", "Trim silence", "✂️"));
            v.push(opt("tool:faster", "Speed 1.5×", "⏩"));
            if count == 1 {
                v.push(opt("edit:trim", "Trim…", "✂️"));
                v.push(opt("edit:split", "Split…", "🔀"));
            }
        }
        Kind::Pdf if eng.gs.is_some() => {
            v.push(opt("tool:compress", "Compress", "🗜️"));
            if count == 1 {
                v.push(opt("edit:split", "Split…", "🔀"));
            }
        }
        Kind::Archive if eng.archiver.is_some() => {
            v.push(opt("tool:extract", "Extract here", "📂"));
        }
        _ => {}
    }
    if count >= 2 {
        match kind {
            Kind::Video if ff => v.push(opt("merge:video", "Merge", "🔗")),
            Kind::Audio if ff => v.push(opt("merge:audio", "Merge", "🔗")),
            Kind::Pdf if eng.gs.is_some() => v.push(opt("merge:pdf", "Merge", "🔗")),
            Kind::Image if eng.magick.is_some() && !needs_magick(ext) => {
                v.push(opt("merge:images-pdf", "Combine to PDF", "📕"))
            }
            _ => {}
        }
    }
    if eng.archiver.is_some() {
        v.push(opt("tool:zip", "Zip", "🗃️"));
    }
    v
}

fn ai_options(kind: Kind, ext: &str, count: usize, eng: &Engines) -> Vec<OptionDto> {
    let ai = &eng.ai;
    let ff = eng.ffmpeg.is_some();
    let mut v = Vec::new();
    match kind {
        Kind::Image if ff && !needs_magick(ext) => {
            if ai.ocr() {
                v.push(opt("ai:ocr", "Text (OCR)", "🔤"));
                v.push(opt("ai:ocr-pdf", "Searchable PDF", "📕"));
            }
            if ai.background() {
                v.push(opt("ai:rmbg", "Remove background", "✨"));
            }
            if ai.upscale() {
                v.push(opt("ai:up2", "Upscale ×2", "🔍"));
                v.push(opt("ai:up4", "Upscale ×4", "🔍"));
            }
        }
        Kind::Video | Kind::Audio if ff && ai.transcribe() && count == 1 => {
            v.push(opt("edit:transcribe", "Subtitles…", "💬"));
            v.push(opt("ai:talk-summary", "Summary of speech", "📝"));
        }
        Kind::Pdf if eng.gs.is_some() => {
            if ai.ocr() {
                v.push(opt("ai:ocr", "Text (OCR)", "🔤"));
                v.push(opt("ai:ocr-pdf", "Searchable PDF", "📕"));
            }
            v.push(opt("ai:summary", "Summary", "📝"));
        }
        Kind::Document if eng.pandoc.is_some() || matches!(ext, "txt" | "md" | "markdown") => {
            v.push(opt("ai:summary", "Summary", "📝"));
        }
        _ => {}
    }
    v
}

fn action_options() -> Vec<OptionDto> {
    vec![
        opt("action:open", "Open", "↗️"),
        opt("action:reveal", "Show in folder", "📁"),
        opt("action:copy-path", "Copy path", "📋"),
        opt("action:copy-files", "Copy file", "📄"),
        opt("action:copy-to", "Copy to…", "📥"),
        opt("action:move-to", "Move to…", "📦"),
    ]
}

pub fn options_for(paths: &[impl AsRef<Path>], eng: &Engines) -> AllOptions {
    let Some(first) = paths.first() else {
        return AllOptions::default();
    };
    let kind = common_kind(paths);
    let ext = ext_of(first.as_ref());
    let convert = if kind == Kind::Other || kind == Kind::Folder {
        vec![]
    } else {
        convert_targets(kind, &ext, eng)
            .into_iter()
            .map(|t| opt(format!("convert:{t}"), t.to_uppercase(), convert_icon(kind, t)))
            .collect()
    };
    let convert_hint = convert.is_empty().then(|| {
        match kind {
            Kind::Image if needs_magick(&ext) => "Needs ImageMagick (HEIC, SVG)",
            Kind::Image | Kind::Video | Kind::Audio | Kind::Subtitle => "Needs FFmpeg",
            Kind::Document => "Needs Pandoc to convert documents",
            Kind::Pdf => "Needs Ghostscript to convert PDFs",
            Kind::Slides => "Needs LibreOffice to convert slides",
            _ => "Nothing to convert for this type",
        }
        .to_string()
    });
    AllOptions {
        kind: kind.name().to_string(),
        count: paths.len(),
        convert_hint,
        convert,
        tools: tool_options(kind, &ext, paths.len(), eng),
        actions: action_options(),
        ai_hint: {
            let tools = ai_options(kind, &ext, paths.len(), eng);
            if tools.is_empty() {
                Some(if eng.ai.any() { "No AI tools for this type of file" } else { "Needs the AI add-on" }.to_string())
            } else {
                None
            }
        },
        ai: ai_options(kind, &ext, paths.len(), eng),
        share: crate::goals::goals_for(kind, eng)
            .into_iter()
            .map(|g| OptionDto { id: format!("share:{}", g.id), label: g.label.into(), icon: String::new(), sub: Some(g.sub.into()) })
            .collect(),
        total_size: paths.iter().filter_map(|p| std::fs::metadata(p.as_ref()).ok()).filter(|m| m.is_file()).map(|m| m.len()).sum(),
    }
}






