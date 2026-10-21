use serde::Serialize;
use std::path::PathBuf;

/// External programs that do the real conversion work.
#[derive(Clone, Default)]
pub struct Engines {
    pub ffmpeg: Option<PathBuf>,
    pub pandoc: Option<PathBuf>,
    pub magick: Option<PathBuf>,
    pub gs: Option<PathBuf>,
    /// 7-Zip: zip, extract and archive conversion (also handles non-ASCII paths, unlike tar.exe).
    pub archiver: Option<PathBuf>,
    /// Microsoft Edge, used to print HTML to PDF.
    pub edge: Option<PathBuf>,
    /// LibreOffice, only needed for slides and layout-preserving PDF import.
    pub soffice: Option<PathBuf>,
    /// The offline AI add-on (folder `ai` next to the tools): OCR, subtitles, background removal, upscaling.
    pub ai: AiEngines,
}

/// Programs and models of the AI add-on. Every part is optional; features appear when their parts exist.
#[derive(Clone, Default)]
pub struct AiEngines {
    pub tesseract: Option<PathBuf>,
    /// Folder with `eng.traineddata`, `vie.traineddata`…
    pub tessdata: Option<PathBuf>,
    pub whisper: Option<PathBuf>,
    /// A `ggml-*.bin` speech model.
    pub whisper_model: Option<PathBuf>,
    /// `onnxruntime.dll`
    pub onnx_dll: Option<PathBuf>,
    /// Background-removal model (`*.onnx`).
    pub bg_model: Option<PathBuf>,
    pub esrgan: Option<PathBuf>,
    pub esrgan_models: Option<PathBuf>,
}

impl AiEngines {
    pub fn any(&self) -> bool {
        self.ocr() || self.transcribe() || self.background() || self.upscale()
    }
    pub fn ocr(&self) -> bool {
        self.tesseract.is_some() && self.tessdata.is_some()
    }
    pub fn transcribe(&self) -> bool {
        self.whisper.is_some() && self.whisper_model.is_some()
    }
    pub fn background(&self) -> bool {
        self.onnx_dll.is_some() && self.bg_model.is_some()
    }
    pub fn upscale(&self) -> bool {
        self.esrgan.is_some() && self.esrgan_models.is_some()
    }

    /// Tesseract language string: Vietnamese and English when both are installed.
    pub fn ocr_languages(&self) -> String {
        let has = |l: &str| self.tessdata.as_ref().is_some_and(|d| d.join(format!("{l}.traineddata")).is_file());
        match (has("vie"), has("eng")) {
            (true, true) => "vie+eng".into(),
            (true, false) => "vie".into(),
            _ => "eng".into(),
        }
    }
}

fn ai_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(custom) = std::env::var_os("COCOFLOW_AI") {
        roots.push(PathBuf::from(custom));
    }
    for dir in search_dirs() {
        roots.push(dir.join("ai"));
        if dir.ends_with("bin") {
            if let Some(parent) = dir.parent() {
                roots.push(parent.join("ai"));
            }
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(local).join("Cocoflow").join("ai"));
    }
    // the AI tools cannot open non-ASCII paths: reach them through an ASCII alias
    roots.into_iter().filter(|r| r.is_dir()).map(|r| crate::native::ascii_alias(&r)).collect()
}

fn detect_ai() -> AiEngines {
    let mut ai = AiEngines::default();
    for root in ai_roots() {
        let file = |rel: &str| Some(root.join(rel)).filter(|p| p.is_file());
        let dir = |rel: &str| Some(root.join(rel)).filter(|p| p.is_dir());
        if ai.tesseract.is_none() {
            ai.tesseract = file("tesseract/tesseract.exe");
            ai.tessdata = dir("tesseract/tessdata");
        }
        if ai.whisper.is_none() {
            ai.whisper = file("whisper/whisper-cli.exe");
        }
        if ai.onnx_dll.is_none() {
            ai.onnx_dll = file("onnxruntime/onnxruntime.dll");
        }
        if ai.esrgan.is_none() {
            ai.esrgan = file("realesrgan/realesrgan-ncnn-vulkan.exe");
            ai.esrgan_models = dir("realesrgan/models");
        }
        // models are single files in <root>/models
        if let Ok(entries) = std::fs::read_dir(root.join("models")) {
            let mut files: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect();
            files.sort();
            let pick = |ext: &str, prefix: &str| {
                files.iter().find(|p| {
                    let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                    name.starts_with(prefix) && name.ends_with(ext)
                })
            };
            if ai.whisper_model.is_none() {
                ai.whisper_model = pick(".bin", "ggml-").cloned();
            }
            if ai.bg_model.is_none() {
                ai.bg_model = pick(".onnx", "").cloned();
            }
        }
    }
    ai
}

#[derive(Serialize)]
pub struct EngineInfo {
    pub name: &'static str,
    pub purpose: &'static str,
    pub found: bool,
    pub path: Option<String>,
    pub install: &'static str,
}

fn search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.join("bin"));
            dirs.push(parent.to_path_buf());
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local).join("Cocoflow").join("bin"));
    }
    dirs
}

/// `<dir>/<name>.exe`, or one level down: `<dir>/<tool>/<name>.exe` and `<dir>/<tool>/bin/<name>.exe`
/// (bundled tools keep their own folders: bin\pandoc, bin\magick, bin\gs\bin).
fn find_in(dir: &std::path::Path, exe: &str) -> Option<PathBuf> {
    let direct = dir.join(exe);
    if direct.is_file() {
        return Some(direct);
    }
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let sub = entry.path();
        if !sub.is_dir() {
            continue;
        }
        for candidate in [sub.join(exe), sub.join("bin").join(exe), sub.join("program").join(exe)] {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn find(names: &[&str]) -> Option<PathBuf> {
    for name in names {
        let exe = format!("{name}.exe");
        // Only the bin folders are scanned one level deep, not the exe folder itself.
        for dir in search_dirs().into_iter().filter(|d| d.ends_with("bin")) {
            if let Some(found) = find_in(&dir, &exe) {
                return Some(found);
            }
        }
        if let Some(found) = search_dirs().into_iter().map(|d| d.join(&exe)).find(|p| p.is_file()) {
            return Some(found);
        }
        if let Ok(path) = which::which(name) {
            return Some(path);
        }
    }
    None
}

fn program_files() -> Vec<PathBuf> {
    ["ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"]
        .iter()
        .filter_map(|v| std::env::var_os(v).map(PathBuf::from))
        .collect()
}

fn find_edge() -> Option<PathBuf> {
    program_files()
        .into_iter()
        .map(|root| root.join("Microsoft").join("Edge").join("Application").join("msedge.exe"))
        .find(|p| p.is_file())
}

fn find_installed_7zip() -> Option<PathBuf> {
    program_files()
        .into_iter()
        .map(|root| root.join("7-Zip").join("7z.exe"))
        .find(|p| p.is_file())
}

fn find_installed_libreoffice() -> Option<PathBuf> {
    program_files()
        .into_iter()
        .map(|root| root.join("LibreOffice").join("program").join("soffice.exe"))
        .find(|p| p.is_file())
}

impl Engines {
    pub fn detect() -> Self {
        Engines {
            ffmpeg: find(&["ffmpeg"]),
            pandoc: find(&["pandoc"]),
            magick: find(&["magick"]),
            gs: find(&["gswin64c", "gswin32c"]),
            archiver: find(&["7z"]).or_else(find_installed_7zip),
            edge: find_edge(),
            soffice: find(&["soffice"]).or_else(find_installed_libreoffice),
            ai: detect_ai(),
        }
    }

    pub fn info(&self) -> Vec<EngineInfo> {
        let row = |name, purpose, p: &Option<PathBuf>, install| EngineInfo {
            name,
            purpose,
            found: p.is_some(),
            path: p.as_ref().map(|p| p.display().to_string()),
            install,
        };
        vec![
            row("FFmpeg", "Video, audio, images, subtitles", &self.ffmpeg, "winget install Gyan.FFmpeg"),
            row("Pandoc", "Documents (docx, html, md, epub…)", &self.pandoc, "winget install JohnMacFarlane.Pandoc"),
            row("ImageMagick", "HEIC, SVG, image to PDF", &self.magick, "winget install ImageMagick.ImageMagick"),
            row("Ghostscript", "PDF compress, merge, to images", &self.gs, "winget install ArtifexSoftware.GhostScript"),
            row("Microsoft Edge", "Documents and spreadsheets to PDF", &self.edge, "Built into Windows 10/11"),
            row("LibreOffice", "Slides, PDF to PPTX (optional)", &self.soffice, "winget install TheDocumentFoundation.LibreOffice"),
            row("7-Zip", "Zip, extract, convert archives", &self.archiver, "winget install 7zip.7zip"),
            row("Tesseract", "AI: text from images and scans (OCR)", &self.ai.tesseract, "AI add-on"),
            row("Whisper", "AI: subtitles from speech", &self.ai.whisper_model, "AI add-on"),
            row("ONNX Runtime", "AI: remove image background", &self.ai.bg_model, "AI add-on"),
            row("Real-ESRGAN", "AI: upscale images", &self.ai.esrgan, "AI add-on"),
        ]
    }
}




