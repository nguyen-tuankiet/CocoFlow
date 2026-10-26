//! Turns "file + option id" into a concrete command line.

use crate::catalog::{ext_of, needs_magick, Kind};
use crate::engines::Engines;
use crate::{native, sheet};
use std::collections::HashSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub struct Cmd {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    /// File (or folder) shown to the user when the job finishes.
    pub output: PathBuf,
    /// Folder that must exist before the command runs.
    pub mkdir: Option<PathBuf>,
    /// ffmpeg reports progress on stdout and the duration on stderr.
    pub ffmpeg: bool,
    /// Steps that run first, in order (e.g. PDF to text before text to EPUB).
    pub before: Vec<Cmd>,
    /// Intermediate files or folders removed when the job ends, successful or not.
    pub temp: Vec<PathBuf>,
    /// Work done in-process instead of by an external program (then `program`/`args` are unused).
    pub native: Option<NativeFn>,
}

pub type NativeFn = Box<dyn FnOnce() -> Result<(), String> + Send>;

impl Cmd {
    pub fn run(program: PathBuf, args: Vec<OsString>, output: PathBuf) -> Cmd {
        Cmd { program, args, output, mkdir: None, ffmpeg: false, before: vec![], temp: vec![], native: None }
    }

    pub fn native(output: PathBuf, work: impl FnOnce() -> Result<(), String> + Send + 'static) -> Cmd {
        Cmd {
            program: PathBuf::new(),
            args: vec![],
            output,
            mkdir: None,
            ffmpeg: false,
            before: vec![],
            temp: vec![],
            native: Some(Box::new(work)),
        }
    }

    /// Run `step` before this command and delete `temp` afterwards.
    pub fn after(mut self, step: Cmd, temp: &[PathBuf]) -> Cmd {
        self.before.insert(0, step);
        self.temp.extend(temp.iter().cloned());
        self
    }
}

fn reserved() -> &'static Mutex<HashSet<PathBuf>> {
    static R: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashSet::new()))
}

/// A path next to `dir` that does not exist yet and is not promised to another running job.
pub fn unique(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let name = |n: u32| match (n, ext.is_empty()) {
        (0, true) => stem.to_string(),
        (0, false) => format!("{stem}.{ext}"),
        (n, true) => format!("{stem} ({n})"),
        (n, false) => format!("{stem} ({n}).{ext}"),
    };
    let mut taken = reserved().lock().unwrap();
    let mut n = 0;
    loop {
        let candidate = dir.join(name(n));
        if !candidate.exists() && !taken.contains(&candidate) {
            taken.insert(candidate.clone());
            return candidate;
        }
        n += 1;
    }
}

pub(crate) fn os(items: &[&str]) -> Vec<OsString> {
    items.iter().map(OsString::from).collect()
}

pub(crate) fn parent_of(input: &Path) -> PathBuf {
    input.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."))
}

pub(crate) fn stem_of(input: &Path) -> String {
    input
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "output".into())
}

/// EXIF orientation (1–8) of a JPEG, 1 when there is none. ffmpeg ignores the tag when decoding stills,
/// which would leave phone photos sideways.
pub(crate) fn exif_orientation(path: &Path) -> u8 {
    use std::io::Read;
    let mut buf = Vec::new();
    let Ok(file) = std::fs::File::open(path) else { return 1 };
    if file.take(256 * 1024).read_to_end(&mut buf).is_err() || buf.len() < 12 || buf[0] != 0xFF || buf[1] != 0xD8 {
        return 1;
    }
    let mut i = 2;
    while i + 4 <= buf.len() && buf[i] == 0xFF {
        let marker = buf[i + 1];
        let len = u16::from_be_bytes([buf[i + 2], buf[i + 3]]) as usize;
        if marker == 0xE1 && buf.get(i + 4..i + 10) == Some(b"Exif\0\0".as_slice()) {
            let tiff = &buf[i + 10..(i + 2 + len).min(buf.len())];
            if tiff.len() < 8 {
                return 1;
            }
            let big = &tiff[0..2] == b"MM";
            let u16_at = |o: usize| -> Option<u16> {
                let b = tiff.get(o..o + 2)?;
                Some(if big { u16::from_be_bytes([b[0], b[1]]) } else { u16::from_le_bytes([b[0], b[1]]) })
            };
            let u32_at = |o: usize| -> Option<u32> {
                let b = tiff.get(o..o + 4)?;
                Some(if big { u32::from_be_bytes([b[0], b[1], b[2], b[3]]) } else { u32::from_le_bytes([b[0], b[1], b[2], b[3]]) })
            };
            let Some(ifd) = u32_at(4) else { return 1 };
            let ifd = ifd as usize;
            let Some(count) = u16_at(ifd) else { return 1 };
            for n in 0..count as usize {
                let entry = ifd + 2 + n * 12;
                if u16_at(entry) == Some(0x0112) {
                    return u16_at(entry + 8).filter(|v| (1..=8).contains(v)).map(|v| v as u8).unwrap_or(1);
                }
            }
            return 1;
        }
        i += 2 + len;
    }
    1
}

/// ffmpeg filter that undoes an EXIF orientation.
fn orientation_filter(orientation: u8) -> Option<&'static str> {
    match orientation {
        2 => Some("hflip"),
        3 => Some("hflip,vflip"),
        4 => Some("vflip"),
        5 => Some("transpose=0"),
        6 => Some("transpose=1"),
        7 => Some("transpose=3"),
        8 => Some("transpose=2"),
        _ => None,
    }
}

/// Draws the picture over a white frame so transparent pixels do not turn into whatever colour
/// is stored under them (JPEG has no alpha).
pub(crate) const FLATTEN_ON_WHITE: &str =
    "split[bg][fg];[bg]drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill[wbg];[wbg][fg]overlay=format=auto";

/// JPEG pictures; .jfif is the same format under another extension.
fn is_jpeg(path: &Path) -> bool {
    matches!(ext_of(path).as_str(), "jpg" | "jpeg" | "jfif")
}

fn may_have_alpha(path: &Path) -> bool {
    matches!(ext_of(path).as_str(), "png" | "webp" | "gif" | "tif" | "tiff" | "avif" | "ico" | "bmp")
}

/// Filters that every still-image conversion needs before its own filters: rotate by EXIF, flatten for JPEG.
pub(crate) fn still_prefix(input: &Path, to_jpeg: bool) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    if is_jpeg(input) {
        parts.extend(orientation_filter(exif_orientation(input)));
    }
    if to_jpeg && may_have_alpha(input) {
        parts.push(FLATTEN_ON_WHITE);
    }
    (!parts.is_empty()).then(|| parts.join(","))
}

pub(crate) fn ffmpeg_cmd(eng: &Engines, inputs: &[&Path], pre: &[&str], output: PathBuf) -> Result<Cmd, String> {
    ffmpeg_cmd_in(eng, &[], inputs, pre, output)
}

/// Like `ffmpeg_cmd`, with `input_opts` placed before the first `-i` (e.g. `-ss` for a fast seek).
pub(crate) fn ffmpeg_cmd_in(eng: &Engines, input_opts: &[&str], inputs: &[&Path], pre: &[&str], output: PathBuf) -> Result<Cmd, String> {
    let program = eng.ffmpeg.clone().ok_or("FFmpeg was not found")?;
    let mut args = os(&["-y", "-hide_banner", "-nostats", "-progress", "pipe:1"]);
    args.extend(os(input_opts));
    let mut pre: Vec<String> = pre.iter().map(|s| s.to_string()).collect();

    // Still pictures: apply EXIF rotation ourselves (and keep ffmpeg from rotating twice).
    let single_image = inputs.len() == 1
        && matches!(ext_of(inputs[0]).as_str(), "jpg" | "jpeg" | "jfif" | "png" | "webp" | "gif" | "tif" | "tiff" | "avif" | "ico" | "bmp");
    if single_image {
        let to_jpeg = is_jpeg(&output);
        if let Some(prefix) = still_prefix(inputs[0], to_jpeg) {
            match pre.iter().position(|a| a == "-vf") {
                Some(i) if i + 1 < pre.len() => pre[i + 1] = format!("{prefix},{}", pre[i + 1]),
                _ => pre.extend(["-vf".to_string(), prefix]),
            }
            if is_jpeg(inputs[0]) && exif_orientation(inputs[0]) != 1 {
                // the tag no longer matches the pixels once we have rotated them
                pre.extend(["-map_metadata".to_string(), "-1".to_string()]);
            }
        }
    }
    for input in inputs {
        if is_jpeg(input) {
            args.push("-noautorotate".into());
        }
        args.push("-i".into());
        args.push(input.into());
    }
    args.extend(pre.iter().map(OsString::from));
    // ffmpeg does not know the .jfif extension: it is a JPEG picture
    if ext_of(&output) == "jfif" {
        args.extend(os(&["-f", "image2", "-c:v", "mjpeg"]));
    }
    args.push(output.clone().into());
    Ok(Cmd { program, args, output, mkdir: None, ffmpeg: true, before: vec![], temp: vec![], native: None })
}
fn audio_codec_args(target: &str) -> Vec<&'static str> {
    match target {
        "mp3" => vec!["-vn", "-c:a", "libmp3lame", "-q:a", "2"],
        "wav" => vec!["-vn", "-c:a", "pcm_s16le"],
        "flac" => vec!["-vn", "-c:a", "flac"],
        "ogg" => vec!["-vn", "-c:a", "libvorbis", "-q:a", "5"],
        "m4a" => vec!["-vn", "-c:a", "aac", "-b:a", "192k"],
        "opus" => vec!["-vn", "-c:a", "libopus", "-b:a", "128k"],
        "aiff" => vec!["-vn", "-c:a", "pcm_s16be", "-f", "aiff"],
        "wma" => vec!["-vn", "-c:a", "wmav2", "-b:a", "192k"],
        _ => vec![],
    }
}

const X264: [&str; 12] = [
    "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:a", "aac", "-movflags", "+faststart",
];

/// Print an HTML file to PDF with Edge (headless).
fn edge_print(eng: &Engines, html: &Path, pdf: &Path, profile: &Path) -> Result<Cmd, String> {
    let edge = eng.edge.clone().ok_or("Microsoft Edge was not found")?;
    let args: Vec<OsString> = vec![
        "--headless=new".into(),
        "--disable-gpu".into(),
        "--no-first-run".into(),
        "--disable-extensions".into(),
        "--no-pdf-header-footer".into(),
        format!("--user-data-dir={}", profile.display()).into(),
        format!("--print-to-pdf={}", pdf.display()).into(),
        native::file_url(html).into(),
    ];
    Ok(Cmd::run(edge, args, pdf.to_path_buf()))
}

fn pandoc_cmd(eng: &Engines, input: &Path, output: &Path, extra: &[&str]) -> Result<Cmd, String> {
    let program = eng.pandoc.clone().ok_or("Pandoc was not found")?;
    let mut args: Vec<OsString> = vec![input.into(), "-o".into(), output.into()];
    args.extend(os(extra));
    Ok(Cmd::run(program, args, output.to_path_buf()))
}

/// soffice command converting `input` into `temp/<stem>.<format>`; `filter` selects the import filter.
fn soffice_cmd(eng: &Engines, input: &Path, temp: &Path, format: &str, filter: Option<&str>) -> Result<Cmd, String> {
    let soffice = eng.soffice.clone().ok_or("LibreOffice was not found")?;
    // A persistent profile: creating one takes ~30 s, reusing it is much faster.
    let profile = std::env::var_os("LOCALAPPDATA")
        .map(|d| PathBuf::from(d).join("Cocoflow").join("lo-profile"))
        .unwrap_or_else(|| temp.join("lo-profile"));
    let _ = std::fs::create_dir_all(&profile);
    let mut args: Vec<OsString> = vec![
        format!("-env:UserInstallation={}", native::file_url(&profile)).into(),
        "--headless".into(),
        "--norestore".into(),
    ];
    if let Some(filter) = filter {
        args.push(format!("--infilter={filter}").into());
    }
    args.extend(["--convert-to".into(), format.into(), "--outdir".into(), temp.into(), input.into()]);
    let produced = temp.join(format!("{}.{}", stem_of(input), format.split(':').next().unwrap_or(format)));
    Ok(Cmd::run(soffice, args, produced))
}

/// Pages of a PDF as images (300 DPI, like the original app) into a new `<stem>_pages` folder.
fn gs_pages(eng: &Engines, pdf: &Path, dir: &Path, stem: &str, target: &str, dpi: u32) -> Result<Cmd, String> {
    let program = eng.gs.clone().ok_or("Ghostscript was not found")?;
    let pages = unique(dir, &format!("{stem}_pages"), "");
    let device = if target == "jpg" { "jpeg" } else { "png16m" };
    let pattern = pages.join(format!("page_%03d.{target}"));
    let mut args = os(&["-dNOPAUSE", "-dBATCH", "-dSAFER", &format!("-r{dpi}"), &format!("-sDEVICE={device}")]);
    args.push(OsString::from(format!("-sOutputFile={}", pattern.display())));
    args.push(pdf.into());
    let mut cmd = Cmd::run(program, args, pages.clone());
    cmd.mkdir = Some(pages);
    Ok(cmd)
}

/// Text of a PDF written by Ghostscript's txtwrite device.
fn gs_text(eng: &Engines, pdf: &Path, text: &Path) -> Result<Cmd, String> {
    let program = eng.gs.clone().ok_or("Ghostscript was not found")?;
    let mut args = os(&["-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=txtwrite"]);
    args.push(OsString::from(format!("-sOutputFile={}", text.display())));
    args.push(pdf.into());
    Ok(Cmd::run(program, args, text.to_path_buf()))
}

fn convert_document(target: &str, input: &Path, output: PathBuf, eng: &Engines) -> Result<Cmd, String> {
    let in_ext = ext_of(input);
    match target {
        "pdf" => {
            let temp = native::temp_dir("doc");
            let profile = temp.join("edge-profile");
            if matches!(in_ext.as_str(), "html" | "htm") {
                let print = edge_print(eng, input, &output, &profile)?;
                return Ok(Cmd { temp: vec![temp], ..print });
            }
            let html = temp.join("document.html");
            let title = stem_of(input);
            let pandoc = pandoc_cmd(eng, input, &html, &["-s", "--embed-resources", "--metadata", &format!("pagetitle={title}")])?;
            Ok(edge_print(eng, &html, &output, &profile)?.after(pandoc, &[temp]))
        }
        "html" => pandoc_cmd(eng, input, &output, &["-s", "--embed-resources", "--metadata", &format!("title={}", stem_of(input))]),
        "epub" => pandoc_cmd(eng, input, &output, &["-s", "--metadata", &format!("title={}", stem_of(input))]),
        "md" => pandoc_cmd(eng, input, &output, &["-t", "gfm", "--wrap=none"]),
        "txt" => pandoc_cmd(eng, input, &output, &["-t", "plain", "--wrap=none"]),
        _ => pandoc_cmd(eng, input, &output, &[]),
    }
}

fn convert_pdf(target: &str, input: &Path, output: PathBuf, eng: &Engines) -> Result<Cmd, String> {
    let dir = parent_of(input);
    let stem = stem_of(input);
    match target {
        "png" | "jpg" => gs_pages(eng, input, &dir, &stem, target, 300),
        "txt" => {
            let temp = native::temp_dir("pdf");
            let raw = temp.join("raw.txt");
            let (from, to) = (raw.clone(), output.clone());
            let copy = Cmd::native(output.clone(), move || native::copy_text(&from, &to));
            Ok(copy.after(gs_text(eng, input, &raw)?, &[temp]))
        }
        "md" => {
            let temp = native::temp_dir("pdf");
            let raw = temp.join("raw.txt");
            let (from, to) = (raw.clone(), output.clone());
            let clean = Cmd::native(output.clone(), move || native::pdf_text_to_markdown(&from, &to));
            Ok(clean.after(gs_text(eng, input, &raw)?, &[temp]))
        }
        "epub" | "docx" if target == "epub" || eng.soffice.is_none() => {
            // No layout engine: extract the text and let Pandoc build the document from it.
            let temp = native::temp_dir("pdf");
            let raw = temp.join("raw.txt");
            let md = temp.join("text.md");
            let (from, to) = (raw.clone(), md.clone());
            let clean = Cmd::native(md.clone(), move || native::pdf_text_to_markdown(&from, &to));
            let title = format!("title={stem}");
            let pandoc = pandoc_cmd(eng, &md, &output, &["-s", "--metadata", &title])?;
            Ok(pandoc.after(clean, &[]).after(gs_text(eng, input, &raw)?, &[temp]))
        }
        "docx" | "pptx" => {
            let (format, filter) = if target == "docx" {
                ("docx:MS Word 2007 XML", "writer_pdf_import")
            } else {
                ("pptx", "impress_pdf_import")
            };
            let temp = native::temp_dir("pdf");
            let office = soffice_cmd(eng, input, &temp, format, Some(filter))?;
            let produced = office.output.clone();
            let out = output.clone();
            let place = Cmd::native(output, move || native::move_file(&produced, &out));
            Ok(place.after(office, &[temp]))
        }
        _ => Err(format!("Cannot convert PDF to {target}")),
    }
}

fn convert_slides(target: &str, input: &Path, output: PathBuf, eng: &Engines) -> Result<Cmd, String> {
    let dir = parent_of(input);
    let stem = stem_of(input);
    let temp = native::temp_dir("slides");
    let office = soffice_cmd(eng, input, &temp, "pdf", None)?;
    let pdf = office.output.clone();
    match target {
        "pdf" => {
            let out = output.clone();
            let place = Cmd::native(output, move || native::move_file(&pdf, &out));
            Ok(place.after(office, &[temp]))
        }
        "png" | "jpg" => Ok(gs_pages(eng, &pdf, &dir, &stem, target, 200)?.after(office, &[temp])),
        _ => Err(format!("Cannot convert slides to {target}")),
    }
}

fn convert_spreadsheet(target: &str, input: &Path, output: PathBuf, eng: &Engines) -> Result<Cmd, String> {
    let source = input.to_path_buf();
    let target = target.to_string();
    if target == "pdf" {
        let temp = native::temp_dir("sheet");
        let html = temp.join("sheet.html");
        let (src, page) = (source, html.clone());
        let write = Cmd::native(html.clone(), move || sheet::write_html(&sheet::read(&src)?, &page));
        return Ok(edge_print(eng, &html, &output, &temp.join("edge-profile"))?.after(write, &[temp]));
    }
    let out = output.clone();
    Ok(Cmd::native(output, move || {
        let sheets = sheet::read(&source)?;
        match target.as_str() {
            "xlsx" => sheet::write_xlsx(&sheets, &out),
            "ods" => sheet::write_ods(&sheets, &out),
            "csv" | "tsv" => {
                let delimiter = if target == "csv" { ',' } else { '\t' };
                sheet::write_delimited(&sheets[0], &out, delimiter)?;
                // Further sheets go to sibling files named after the sheet.
                let stem = out.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                for extra in sheets.iter().skip(1) {
                    let safe: String = extra.name.chars().map(|c| if r#"\/:*?"<>|"#.contains(c) { '_' } else { c }).collect();
                    let path = out.with_file_name(format!("{stem}_{safe}.{target}"));
                    sheet::write_delimited(extra, &path, delimiter)?;
                }
                Ok(())
            }
            other => Err(format!("Cannot convert a spreadsheet to {other}")),
        }
    }))
}

fn convert_archive(target: &str, input: &Path, output: PathBuf, eng: &Engines) -> Result<Cmd, String> {
    let seven = eng.archiver.clone().ok_or("7-Zip was not found")?;
    if !matches!(target, "zip" | "tar" | "gzip") {
        return Err(format!("Cannot convert an archive to {target}"));
    }
    let (source, out, target) = (input.to_path_buf(), output.clone(), target.to_string());
    Ok(Cmd::native(output, move || crate::archive::convert(&seven, &source, &target, &out)))
}
pub fn convert(kind: Kind, target: &str, input: &Path, eng: &Engines) -> Result<Cmd, String> {
    let dir = parent_of(input);
    let stem = stem_of(input);
    let stem = if kind == Kind::Archive { stem.strip_suffix(".tar").unwrap_or(&stem).to_string() } else { stem };
    let out_ext = if target == "gzip" { "tar.gz" } else { target };
    let output = unique(&dir, &stem, out_ext);
    let result = convert_inner(kind, target, input, eng, &dir, &stem, output.clone());
    // PDF/slides to images write a "<name>_pages" folder, so the plain name was never used; a failed plan used nothing.
    if result.is_err() || (matches!(kind, Kind::Pdf | Kind::Slides) && matches!(target, "png" | "jpg")) {
        release(&output);
    }
    result
}

fn convert_inner(kind: Kind, target: &str, input: &Path, eng: &Engines, dir: &Path, stem: &str, output: PathBuf) -> Result<Cmd, String> {
    let in_ext = ext_of(input);
    let (dir, stem) = (dir.to_path_buf(), stem.to_string());
    let _ = (&dir, &stem);

    match kind {
        Kind::Image if needs_magick(&in_ext) || target == "pdf" => {
            let program = eng.magick.clone().ok_or("ImageMagick was not found")?;
            let mut args: Vec<OsString> = Vec::new();
            if in_ext == "svg" {
                args.extend(os(&["-background", "none", "-density", "192"]));
            }
            args.push(input.into());
            args.push("-auto-orient".into());
            if matches!(target, "jpg" | "jfif") {
                args.extend(os(&["-background", "white", "-flatten"]));
            }
            if target == "jfif" {
                // ImageMagick does not know the .jfif extension either
                let mut out = OsString::from("jpeg:");
                out.push(&output);
                args.push(out);
            } else {
                args.push(output.clone().into());
            }
            Ok(Cmd::run(program, args, output))
        }
        Kind::Image => {
            let mut pre: Vec<&str> = Vec::new();
            // Animated GIF → still image would otherwise write a numbered sequence.
            if target != "gif" {
                pre.extend(["-frames:v", "1", "-update", "1"]);
            }
            match target {
                "jpg" | "jfif" => pre.extend(["-q:v", "2"]),
                "avif" => pre.extend(["-c:v", "libaom-av1", "-crf", "30", "-b:v", "0", "-cpu-used", "6", "-still-picture", "1"]),
                "ico" => pre.extend([
                    "-vf",
                    "scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease",
                ]),
                _ => {}
            }
            ffmpeg_cmd(eng, &[input], &pre, output)
        }
        Kind::Video => {
            let pre: Vec<&str> = match target {
                "mp4" | "mov" => {
                    let mut v = vec!["-crf", "20"];
                    v.extend(X264);
                    v.extend(["-b:a", "160k"]);
                    v
                }
                "webm" => vec![
                    "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-c:a", "libopus", "-b:a",
                    "128k",
                ],
                "mkv" => vec!["-c", "copy"],
                "avi" => vec!["-c:v", "mpeg4", "-q:v", "3", "-c:a", "libmp3lame", "-q:a", "3"],
                "wmv" => vec!["-c:v", "wmv2", "-q:v", "3", "-c:a", "wmav2", "-b:a", "160k"],
                "gif" => vec![
                    "-an",
                    "-vf",
                    "fps=12,scale='min(480,iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
                ],
                t if !audio_codec_args(t).is_empty() => audio_codec_args(t),
                _ => return Err(format!("Cannot convert video to {target}")),
            };
            ffmpeg_cmd(eng, &[input], &pre, output)
        }
        Kind::Audio => {
            let pre = audio_codec_args(target);
            if pre.is_empty() {
                return Err(format!("Cannot convert audio to {target}"));
            }
            ffmpeg_cmd(eng, &[input], &pre, output)
        }
        Kind::Subtitle if target == "txt" => {
            let (from, to) = (input.to_path_buf(), output.clone());
            Ok(Cmd::native(output, move || native::subtitle_to_text(&from, &to)))
        }
        Kind::Subtitle => ffmpeg_cmd(eng, &[input], &[], output),
        Kind::Document => convert_document(target, input, output, eng),
        Kind::Pdf => convert_pdf(target, input, output, eng),
        Kind::Slides => convert_slides(target, input, output, eng),
        Kind::Spreadsheet => convert_spreadsheet(target, input, output, eng),
        Kind::Archive => convert_archive(target, input, output, eng),
        _ => Err("This file type cannot be converted".into()),
    }
}

pub fn tool(kind: Kind, id: &str, input: &Path, eng: &Engines) -> Result<Cmd, String> {
    let dir = parent_of(input);
    let stem = stem_of(input);
    let in_ext = ext_of(input);
    let in_ext_out = if in_ext == "jpeg" { "jpg".to_string() } else { in_ext.clone() };

    if id == "zip" {
        return zip(&[input.to_path_buf()], eng);
    }
    if id == "extract" {
        let seven = eng.archiver.clone().ok_or("7-Zip was not found")?;
        let base = stem.strip_suffix(".tar").unwrap_or(&stem).to_string();
        let target = unique(&dir, &base, "");
        let (source, dest) = (input.to_path_buf(), target.clone());
        let mut cmd = Cmd::native(target.clone(), move || crate::archive::extract(&seven, &source, &dest));
        cmd.mkdir = Some(target); // a failed extraction removes the folder it created
        return Ok(cmd);
    }
    match (kind, id) {
        (Kind::Image, _) => {
            let (suffix, pre): (&str, Vec<&str>) = match id {
                "compress" => match in_ext_out.as_str() {
                    "jpg" | "jfif" => ("_compressed", vec!["-q:v", "5"]),
                    "png" => ("_compressed", vec!["-compression_level", "9"]),
                    "webp" => ("_compressed", vec!["-quality", "70"]),
                    _ => return Err("Compress supports jpg, jfif, png and webp".into()),
                },
                "half" => ("_half", vec!["-vf", "scale=trunc(iw/4)*2:trunc(ih/4)*2"]),
                "max1920" => ("_1920", vec!["-vf", "scale='min(1920,iw)':-2"]),
                "max1080" => ("_1080", vec!["-vf", "scale='min(1080,iw)':-2"]),
                "max512" => ("_512", vec!["-vf", "scale='min(512,iw)':-2"]),
                "rotate-right" => ("_rotated", vec!["-vf", "transpose=1"]),
                "rotate-left" => ("_rotated", vec!["-vf", "transpose=2"]),
                "flip" => ("_flipped", vec!["-vf", "hflip"]),
                "grayscale" => ("_gray", vec!["-vf", "hue=s=0"]),
                _ => return Err(format!("Unknown tool {id}")),
            };
            let mut args = vec!["-frames:v", "1", "-update", "1"];
            args.extend(pre);
            ffmpeg_cmd(eng, &[input], &args, unique(&dir, &format!("{stem}{suffix}"), &in_ext_out))
        }
        (Kind::Video, _) => {
            let scale = |h: u32| format!("scale=-2:'min({h},ih)'");
            let strings = |items: &[&str]| -> Vec<String> { items.iter().map(|s| s.to_string()).collect() };
            let (suffix, ext, pre): (String, String, Vec<String>) = match id {
                "compress" => {
                    let mut v = strings(&["-crf", "28"]);
                    v.extend(strings(&X264));
                    v.extend(strings(&["-b:a", "96k"]));
                    ("_compressed".into(), "mp4".into(), v)
                }
                "p1080" | "p720" | "p480" => {
                    let h: u32 = id[1..].parse().unwrap_or(720);
                    let mut v = strings(&["-crf", "23", "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p"]);
                    v.extend(["-vf".to_string(), scale(h)]);
                    v.extend(strings(&["-c:a", "aac", "-movflags", "+faststart"]));
                    (format!("_{h}p"), "mp4".into(), v)
                }
                "mute" => ("_muted".into(), in_ext_out.clone(), strings(&["-an", "-c:v", "copy"])),
                "rotate-right" => (
                    "_rotated".into(),
                    "mp4".into(),
                    strings(&["-vf", "transpose=1", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "copy"]),
                ),
                "frame" => ("_frame".into(), "jpg".into(), strings(&["-ss", "1", "-frames:v", "1", "-q:v", "2"])),
                _ => return Err(format!("Unknown tool {id}")),
            };
            let refs: Vec<&str> = pre.iter().map(String::as_str).collect();
            ffmpeg_cmd(eng, &[input], &refs, unique(&dir, &format!("{stem}{suffix}"), &ext))
        }
        (Kind::Audio, _) => {
            let (suffix, pre): (&str, Vec<&str>) = match id {
                "normalize" => ("_normalized", vec!["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"]),
                "trim-silence" => (
                    "_trimmed",
                    vec![
                        "-af",
                        "silenceremove=start_periods=1:start_threshold=-50dB,areverse,\
                         silenceremove=start_periods=1:start_threshold=-50dB,areverse",
                    ],
                ),
                "faster" => ("_1.5x", vec!["-af", "atempo=1.5"]),
                _ => return Err(format!("Unknown tool {id}")),
            };
            ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}{suffix}"), &in_ext_out))
        }
        (Kind::Pdf, "compress") => {
            let program = eng.gs.clone().ok_or("Ghostscript was not found")?;
            let output = unique(&dir, &format!("{stem}_compressed"), "pdf");
            let mut args = os(&["-sDEVICE=pdfwrite", "-dPDFSETTINGS=/ebook", "-dNOPAUSE", "-dBATCH", "-dSAFER"]);
            args.push(format!("-sOutputFile={}", output.display()).into());
            args.push(input.into());
            Ok(Cmd { program, args, output, mkdir: None, ffmpeg: false, before: vec![], temp: vec![], native: None })
        }
        _ => Err(format!("Tool {id} is not available for this file")),
    }
}

// ---------------------------------------------------------------- tools that take parameters

pub type Params = std::collections::HashMap<String, String>;

/// "90", "1:30", "01:02:03.5" → seconds.
pub fn parse_time(text: &str) -> Option<f64> {
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    let mut seconds = 0.0;
    for part in t.split(':') {
        seconds = seconds * 60.0 + part.trim().replace(',', ".").parse::<f64>().ok()?;
    }
    (seconds.is_finite() && seconds >= 0.0).then_some(seconds)
}

fn param<'a>(p: &'a Params, key: &str) -> Option<&'a str> {
    p.get(key).map(String::as_str).map(str::trim).filter(|s| !s.is_empty())
}

fn flag(p: &Params, key: &str) -> bool {
    matches!(param(p, key), Some("1" | "true" | "on"))
}

fn number(p: &Params, key: &str) -> Result<u32, String> {
    param(p, key)
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| *v >= 0.0 && v.is_finite())
        .map(|v| v.round() as u32)
        .ok_or_else(|| format!("Missing or invalid value: {key}"))
}

fn decimal(p: &Params, key: &str) -> Result<f64, String> {
    param(p, key)
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| v.is_finite() && v.abs() < 1.0e6)
        .ok_or_else(|| format!("Missing or invalid value: {key}"))
}

/// Page ranges such as "1-3,5,8-": digits, dashes and commas only (the text goes to Ghostscript).
fn clean_pages(text: &str) -> Result<String, String> {
    let t: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    if t.is_empty() || !t.chars().all(|c| c.is_ascii_digit() || c == '-' || c == ',') {
        return Err("Pages must look like 1-3,5,8-".into());
    }
    Ok(t)
}

/// Tools with options (trim, crop, split). Anything else falls through to `tool`.
pub fn tool_params(kind: Kind, id: &str, input: &Path, eng: &Engines, p: &Params) -> Result<Cmd, String> {
    let dir = parent_of(input);
    let stem = stem_of(input);
    let ext = ext_of(input);
    let ext = if ext == "jpeg" { "jpg".to_string() } else { ext };

    match (kind, id) {
        (Kind::Video | Kind::Audio, "trim") => {
            let start = param(p, "start").map(|s| parse_time(s).ok_or("Invalid start time")).transpose()?.unwrap_or(0.0);
            let end = param(p, "end").map(|s| parse_time(s).ok_or("Invalid end time")).transpose()?;
            if end.is_some_and(|e| e <= start) {
                return Err("The end must be after the start".into());
            }
            let start_text = format!("{start:.3}");
            let mut pre: Vec<String> = Vec::new();
            if let Some(e) = end {
                pre.extend(["-t".to_string(), format!("{:.3}", e - start)]);
            }
            if flag(p, "fast") {
                pre.extend(["-c", "copy", "-avoid_negative_ts", "make_zero"].map(String::from));
            }
            let refs: Vec<&str> = pre.iter().map(String::as_str).collect();
            let output = unique(&dir, &format!("{stem}_trim"), &ext);
            ffmpeg_cmd_in(eng, &["-ss", &start_text], &[input], &refs, output)
        }
        (Kind::Image | Kind::Video, "resize") => {
            let filter = if let Some(percent) = param(p, "percent").and_then(|v| v.parse::<f64>().ok()).filter(|v| *v > 0.0 && *v <= 1000.0) {
                format!("scale=trunc(iw*{percent}/200)*2:trunc(ih*{percent}/200)*2")
            } else {
                let w = param(p, "w").and_then(|v| v.parse::<u32>().ok()).filter(|v| *v > 0);
                let h = param(p, "h").and_then(|v| v.parse::<u32>().ok()).filter(|v| *v > 0);
                match (w, h) {
                    (Some(w), Some(h)) => format!(
                        "scale='min({w},iw)':'min({h},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"
                    ),
                    (Some(w), None) => format!("scale='min({w},iw)':-2"),
                    (None, Some(h)) => format!("scale=-2:'min({h},ih)'"),
                    (None, None) => return Err("Enter a width, a height or a percentage".into()),
                }
            };
            if kind == Kind::Image {
                let quality: &[&str] = if ext == "jpg" { &["-q:v", "2"] } else { &[] };
                let mut pre = vec!["-frames:v", "1", "-vf", &filter];
                pre.extend_from_slice(quality);
                ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_resized"), &ext))
            } else {
                let pre = [
                    "-vf", &filter, "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
                ];
                ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_resized"), "mp4"))
            }
        }
        (Kind::Image | Kind::Video, "crop") => {
            let (x, y, mut w, mut h) = (number(p, "x")?, number(p, "y")?, number(p, "w")?, number(p, "h")?);
            if w < 2 || h < 2 {
                return Err("The crop area is empty".into());
            }
            if kind == Kind::Video {
                // h264 needs even sizes
                w &= !1;
                h &= !1;
            }
            let filter = format!("crop={w}:{h}:{x}:{y}");
            if kind == Kind::Image {
                let quality: &[&str] = if ext == "jpg" { &["-q:v", "2"] } else { &[] };
                let mut pre = vec!["-frames:v", "1", "-vf", &filter];
                pre.extend_from_slice(quality);
                ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_crop"), &ext))
            } else {
                let pre = [
                    "-vf", &filter, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
                ];
                ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_crop"), "mp4"))
            }
        }
        // A photographed page straightened into a rectangle: the four corners the user placed (top-left, top-right,
        // bottom-right, bottom-left, in pixels of the picture) are stretched onto a w x h canvas.
        (Kind::Image, "scan") => {
            let program = eng.magick.clone().ok_or("ImageMagick was not found")?;
            let (w, h) = (number(p, "w")?, number(p, "h")?);
            if !(16..=12000).contains(&w) || !(16..=12000).contains(&h) {
                return Err("The scan area is empty".into());
            }
            let mut pairs = String::new();
            let targets = [(0, 0), (w, 0), (w, h), (0, h)];
            for (i, (tx, ty)) in targets.iter().enumerate() {
                let (x, y) = (decimal(p, &format!("x{i}"))?, decimal(p, &format!("y{i}"))?);
                pairs.push_str(&format!("{x:.1},{y:.1} {tx},{ty} "));
            }
            let out_ext = if matches!(ext.as_str(), "png" | "webp") { ext.clone() } else { "jpg".to_string() };
            let output = unique(&dir, &format!("{stem}_scan"), &out_ext);
            let mut args: Vec<OsString> = vec![input.into()];
            args.extend(os(&["-auto-orient", "-virtual-pixel", "white", "-define", &format!("distort:viewport={w}x{h}+0+0")]));
            // Lanczos keeps the edges of the letters sharper than the default filter
            args.extend(os(&["-filter", "Lanczos", "-distort", "Perspective", pairs.trim_end(), "+repage"]));
            let look = param(p, "look").unwrap_or("color");
            if look == "clear" || look == "bw" {
                // Divide by a heavy blur of the page itself: uneven light and shadows disappear, paper turns white.
                let sigma = (w.max(h) / 35).max(8);
                args.extend(os(&["-colorspace", "Gray", "(", "+clone", "-blur", &format!("0x{sigma}"), ")", "-compose", "Divide_Src", "-composite"]));
                args.extend(os(&["-compose", "Over"]));
                if look == "bw" {
                    args.extend(os(&["-level", "20%,98%", "-threshold", "84%"]));
                } else {
                    args.extend(os(&["-level", "15%,92%", "-unsharp", "0x1.0+0.9+0.02"]));
                }
            } else if look == "white" {
                // White paper: each colour channel is divided by the brightness of the paper around it, so shadows and a
                // colour cast disappear, the paper turns white and the ink keeps its colour. The paper level comes from a
                // second copy of the page whose edges are extended (instead of white), shrunk, with the brightest
                // neighbour kept (text is thin), blurred and enlarged again.
                let mut level: Vec<OsString> = vec!["(".into(), input.into()];
                level.extend(os(&["-auto-orient", "-virtual-pixel", "edge", "-define", &format!("distort:viewport={w}x{h}+0+0")]));
                level.extend(os(&["-filter", "Triangle", "-distort", "Perspective", pairs.trim_end(), "+repage"]));
                level.extend(os(&["-resize", "20%", "-morphology", "Dilate", "Disk:5", "-blur", "0x4", "-resize", &format!("{w}x{h}!"), ")"]));
                args.extend(level);
                args.extend(os(&["-compose", "Divide_Src", "-composite", "-compose", "Over", "-level", "0%,94%", "-unsharp", "0x1.0+0.9+0.02"]));
            } else {
                // original colours: a light unsharp mask makes up for the resampling
                args.extend(os(&["-unsharp", "0x1.0+0.9+0.02"]));
            }
            if out_ext == "jpg" {
                args.extend(os(&["-sampling-factor", "4:4:4", "-quality", "95"]));
            }
            args.push(output.clone().into());
            Ok(Cmd::run(program, args, output))
        }
        (Kind::Video | Kind::Audio, "split") => {
            let fast = flag(p, "fast");
            let out_ext = if kind == Kind::Video && !fast { "mp4".to_string() } else { ext.clone() };
            let out_dir = unique(&dir, &format!("{stem}_parts"), "");
            let pattern = out_dir.join(format!("{stem}_%03d.{out_ext}"));
            let mut pre: Vec<String> = ["-map", "0:v?", "-map", "0:a?"].map(String::from).to_vec();
            let accurate_video = kind == Kind::Video && !fast;
            match param(p, "mode") {
                Some("points") => {
                    let mut points: Vec<f64> = param(p, "points")
                        .ok_or("Add at least one split point")?
                        .split(',')
                        .map(|t| parse_time(t).ok_or("Invalid split point"))
                        .collect::<Result<_, _>>()?;
                    points.retain(|v| *v > 0.0);
                    points.sort_by(|a, b| a.total_cmp(b));
                    points.dedup();
                    if points.is_empty() {
                        return Err("Add at least one split point".into());
                    }
                    let list = points.iter().map(|v| format!("{v:.3}")).collect::<Vec<_>>().join(",");
                    if accurate_video {
                        pre.extend(["-force_key_frames".to_string(), list.clone()]);
                    }
                    pre.extend(["-f".to_string(), "segment".to_string(), "-segment_times".to_string(), list]);
                }
                _ => {
                    let every = param(p, "every").and_then(parse_time).filter(|v| *v >= 1.0).ok_or("Segments must be at least 1 second")?;
                    if accurate_video {
                        pre.extend(["-force_key_frames".to_string(), format!("expr:gte(t,n_forced*{every})")]);
                    }
                    pre.extend(["-f".to_string(), "segment".to_string(), "-segment_time".to_string(), format!("{every}")]);
                }
            }
            pre.extend(["-reset_timestamps".to_string(), "1".to_string()]);
            if fast {
                pre.extend(["-c".to_string(), "copy".to_string()]);
            } else if accurate_video {
                pre.extend(
                    ["-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac"].map(String::from),
                );
            }
            let refs: Vec<&str> = pre.iter().map(String::as_str).collect();
            let mut cmd = ffmpeg_cmd(eng, &[input], &refs, pattern)?;
            cmd.output = out_dir.clone();
            cmd.mkdir = Some(out_dir);
            Ok(cmd)
        }
        (Kind::Pdf, "split") => pdf_split(eng, input, &dir, &stem, p),
        _ => tool(kind, id, input, eng),
    }
}

/// Split a PDF with Ghostscript: every page, a selection in one file, or several ranges.
fn pdf_split(eng: &Engines, input: &Path, dir: &Path, stem: &str, p: &Params) -> Result<Cmd, String> {
    let gs = eng.gs.clone().ok_or("Ghostscript was not found")?;
    let mode = param(p, "mode").unwrap_or("each").to_string();
    let pages = match mode.as_str() {
        "each" => String::new(),
        _ => clean_pages(param(p, "pages").unwrap_or(""))?,
    };
    let out_dir = unique(dir, &format!("{stem}_parts"), "");
    let (source, out, stem) = (input.to_path_buf(), out_dir.clone(), stem.to_string());
    let mut cmd = Cmd::native(out_dir.clone(), move || {
        std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        let base = ["-dSAFER", "-dQUIET", "-sDEVICE=pdfwrite"];
        let run = |extra: Vec<OsString>, target: PathBuf| -> Result<(), String> {
            let mut args = os(&base);
            args.extend(extra);
            args.push(format!("-sOutputFile={}", target.display()).into());
            args.push("-dNOPAUSE".into());
            args.push("-dBATCH".into());
            args.push((&source).into());
            let mut c = std::process::Command::new(&gs);
            c.args(&args);
            let o = crate::jobs::run_tracked(&mut c)?;
            if o.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&o.stderr).trim().to_string()) }
        };
        match mode.as_str() {
            "each" => run(vec![], out.join(format!("{stem}_page%03d.pdf"))),
            "extract" => run(vec![format!("-sPageList={pages}").into()], out.join(format!("{stem}_selection.pdf"))),
            _ => {
                for range in pages.split(',').filter(|r| !r.is_empty()) {
                    let (first, last) = match range.split_once('-') {
                        Some((a, b)) => (a, b),
                        None => (range, range),
                    };
                    let mut extra: Vec<OsString> = Vec::new();
                    if !first.is_empty() {
                        extra.push(format!("-dFirstPage={first}").into());
                    }
                    if !last.is_empty() {
                        extra.push(format!("-dLastPage={last}").into());
                    }
                    run(extra, out.join(format!("{stem}_pages_{range}.pdf")))?;
                }
                Ok(())
            }
        }
    });
    cmd.mkdir = Some(out_dir);
    Ok(cmd)
}

/// Zip one or more items that live in the same folder.
pub fn zip(items: &[PathBuf], eng: &Engines) -> Result<Cmd, String> {
    let seven = eng.archiver.clone().ok_or("7-Zip was not found")?;
    let first = items.first().ok_or("Nothing to zip")?;
    let dir = parent_of(first);
    let name = if items.len() == 1 { stem_of(first) } else { "Archive".to_string() };
    let output = unique(&dir, &name, "zip");
    let names: Vec<OsString> = items.iter().filter_map(|i| i.file_name().map(OsString::from)).collect();
    if names.is_empty() {
        return Err("Bad file name".into());
    }
    let out = output.clone();
    Ok(Cmd::native(output, move || crate::archive::zip_items(&seven, &dir, &names, &out)))
}
/// Merge several files into one (videos, audios, PDFs, images → PDF).
pub fn merge(id: &str, inputs: &[PathBuf], eng: &Engines) -> Result<Cmd, String> {
    let first = inputs.first().ok_or("Nothing to merge")?;
    let dir = parent_of(first);
    let n = inputs.len();
    let refs: Vec<&Path> = inputs.iter().map(PathBuf::as_path).collect();
    match id {
        "video" => {
            // Normalise every clip to 1280x720 / 30 fps / 44.1 kHz so the concat filter accepts them.
            // A clip without an audio track (screen recordings) gets silence of the same length.
            let ffmpeg = eng.ffmpeg.clone().ok_or("FFmpeg was not found")?;
            let mut graph = String::new();
            for (i, input) in inputs.iter().enumerate() {
                graph.push_str(&format!(
                    "[{i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v{i}];"
                ));
                if crate::goals::has_audio(&ffmpeg, input) {
                    graph.push_str(&format!("[{i}:a]aresample=44100[a{i}];"));
                } else {
                    let seconds = crate::goals::duration_of(&ffmpeg, input).ok_or("Cannot read a clip's length")?;
                    graph.push_str(&format!("anullsrc=r=44100:cl=stereo,atrim=0:{seconds:.3},asetpts=PTS-STARTPTS[a{i}];"));
                }
            }            for i in 0..n {
                graph.push_str(&format!("[v{i}][a{i}]"));
            }
            graph.push_str(&format!("concat=n={n}:v=1:a=1[v][a]"));
            let output = unique(&dir, &format!("{}_merged", stem_of(first)), "mp4");
            let pre = [
                "-filter_complex", graph.as_str(), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "20",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
            ];
            ffmpeg_cmd(eng, &refs, &pre, output)
        }
        "audio" => {
            let mut graph = String::new();
            for i in 0..n {
                graph.push_str(&format!("[{i}:a]"));
            }
            graph.push_str(&format!("concat=n={n}:v=0:a=1[a]"));
            let ext = ext_of(first);
            let ext = if ext.is_empty() { "mp3".to_string() } else { ext };
            let output = unique(&dir, &format!("{}_merged", stem_of(first)), &ext);
            let pre = ["-filter_complex", graph.as_str(), "-map", "[a]"];
            ffmpeg_cmd(eng, &refs, &pre, output)
        }
        "pdf" => {
            let program = eng.gs.clone().ok_or("Ghostscript was not found")?;
            let output = unique(&dir, &format!("{}_merged", stem_of(first)), "pdf");
            let mut args = os(&["-sDEVICE=pdfwrite", "-dNOPAUSE", "-dBATCH", "-dSAFER"]);
            args.push(format!("-sOutputFile={}", output.display()).into());
            args.extend(inputs.iter().map(OsString::from));
            Ok(Cmd { program, args, output, mkdir: None, ffmpeg: false, before: vec![], temp: vec![], native: None })
        }
        "images-pdf" => {
            let program = eng.magick.clone().ok_or("ImageMagick was not found")?;
            let output = unique(&dir, &format!("{}_combined", stem_of(first)), "pdf");
            let mut args: Vec<OsString> = inputs.iter().map(OsString::from).collect();
            args.push(output.clone().into());
            Ok(Cmd { program, args, output, mkdir: None, ffmpeg: false, before: vec![], temp: vec![], native: None })
        }
        _ => Err(format!("Unknown merge {id}")),
    }
}

/// Give a reserved name back when a job fails before creating its output.
pub fn release(path: &Path) {
    reserved().lock().unwrap().remove(path);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{options_for, Kind};
    use crate::goals;
    use std::process::Command;

    /// Small media files generated by ffmpeg, see COCOFLOW_TEST_MEDIA.
    fn media() -> Option<PathBuf> {
        std::env::var_os("COCOFLOW_TEST_MEDIA").map(PathBuf::from)
    }

    fn run_step(mut cmd: Cmd) {
        for before in std::mem::take(&mut cmd.before) {
            run_step(before);
        }
        if let Some(dir) = &cmd.mkdir {
            std::fs::create_dir_all(dir).unwrap();
        }
        if let Some(work) = cmd.native.take() {
            work().unwrap();
            return;
        }
        let out = Command::new(&cmd.program).args(&cmd.args).output().unwrap();
        assert!(
            out.status.success(),
            "{} failed:\n{}",
            cmd.program.display(),
            String::from_utf8_lossy(&out.stderr)
        );
    }

    /// Runs a whole plan (chained steps, native work, temp cleanup) and returns its non-empty output.
    fn run_ok(mut cmd: Cmd) -> PathBuf {
        let temps = std::mem::take(&mut cmd.temp);
        let output = cmd.output.clone();
        run_step(cmd);
        for t in temps {
            let _ = if t.is_dir() { std::fs::remove_dir_all(&t) } else { std::fs::remove_file(&t) };
        }
        assert!(output.exists(), "missing output {}", output.display());
        if output.is_file() {
            assert!(std::fs::metadata(&output).unwrap().len() > 0, "empty output {}", output.display());
        }
        output
    }
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("cocoflow-tests").join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn copy_in(src: &Path, dir: &Path) -> PathBuf {
        let dest = dir.join(src.file_name().unwrap());
        std::fs::copy(src, &dest).unwrap();
        dest
    }

    #[test]
    fn every_offered_option_works() {
        let Some(media) = media() else {
            eprintln!("COCOFLOW_TEST_MEDIA not set, skipping");
            return;
        };
        let eng = Engines::detect();
        let dir = scratch("all");
        let files = [
            "clip1.mp4", "pic.png", "tone.wav", "sub.srt", "doc.md", "vector.svg", "text.pdf", "data.csv", "sample.zip",
        ];
        let mut failures = Vec::new();
        for file in files {
            let input = copy_in(&media.join(file), &dir);
            let all = options_for(&[input.clone()], &eng);
            let kind = crate::catalog::kind_of(&input);
            for o in all.convert.iter().chain(all.tools.iter()) {
                let (family, id) = o.id.split_once(':').unwrap();
                if family == "merge" || family == "edit" || id == "zip" {
                    continue;
                }
                let cmd = if family == "convert" { convert(kind, id, &input, &eng) } else { tool(kind, id, &input, &eng) };
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_ok(cmd.unwrap())));
                match result {
                    Ok(p) => eprintln!("ok   {file} {} -> {}", o.id, p.file_name().unwrap().to_string_lossy()),
                    Err(_) => failures.push(format!("{file} {}", o.id)),
                }
            }
        }
        assert!(failures.is_empty(), "failed options: {failures:?}");
    }

    #[test]
    fn jfif_is_written_as_jpeg_and_read_back() {
        let Some(media) = media() else {
            eprintln!("COCOFLOW_TEST_MEDIA not set, skipping");
            return;
        };
        let eng = Engines::detect();
        let dir = scratch("jfif");
        let is_jpeg = |p: &Path| std::fs::read(p).unwrap().starts_with(&[0xFF, 0xD8, 0xFF]);
        // PNG → JFIF with ffmpeg, SVG → JFIF with ImageMagick
        let png = copy_in(&media.join("pic.png"), &dir);
        let jfif = run_ok(convert(Kind::Image, "jfif", &png, &eng).unwrap());
        assert_eq!(ext_of(&jfif), "jfif");
        assert!(is_jpeg(&jfif), "not a JPEG: {}", jfif.display());
        let svg = copy_in(&media.join("vector.svg"), &dir);
        let from_svg = run_ok(convert(Kind::Image, "jfif", &svg, &eng).unwrap());
        assert!(is_jpeg(&from_svg), "not a JPEG: {}", from_svg.display());
        // a .jfif file is an image that can be converted and compressed like a JPEG
        assert_eq!(crate::catalog::kind_of(&jfif), Kind::Image);
        let back = run_ok(convert(Kind::Image, "png", &jfif, &eng).unwrap());
        assert!(std::fs::read(&back).unwrap().starts_with(&[0x89, b'P', b'N', b'G']));
        let small = run_ok(tool(Kind::Image, "compress", &jfif, &eng).unwrap());
        assert!(is_jpeg(&small), "compressed JFIF is not a JPEG");
    }

    #[test]
    fn merge_video_and_audio_and_zip() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("merge");
        let v1 = copy_in(&media.join("clip1.mp4"), &dir);
        let v2 = copy_in(&media.join("clip2.mp4"), &dir);
        let a1 = copy_in(&media.join("tone.wav"), &dir);
        let a2 = copy_in(&media.join("tone2.wav"), &dir);
        run_ok(merge("video", &[v1.clone(), v2.clone()], &eng).unwrap());
        run_ok(merge("audio", &[a1.clone(), a2.clone()], &eng).unwrap());
        run_ok(zip(&[v1, v2], &eng).unwrap());
    }

    #[test]
    fn merge_pdfs_and_images_to_pdf() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        if eng.gs.is_none() || eng.magick.is_none() {
            eprintln!("Ghostscript/ImageMagick not found, skipping");
            return;
        }
        let dir = scratch("pdfmerge");
        let a = copy_in(&media.join("two.pdf"), &dir);
        let b = dir.join("second.pdf");
        std::fs::copy(&a, &b).unwrap();
        run_ok(merge("pdf", &[a, b], &eng).unwrap());
        let p1 = copy_in(&media.join("pic.png"), &dir);
        let p2 = dir.join("pic2.png");
        std::fs::copy(&p1, &p2).unwrap();
        run_ok(merge("images-pdf", &[p1, p2], &eng).unwrap());
    }

    #[test]
    fn pdf_text_is_extracted_and_image_pdfs_report_no_text() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        if eng.gs.is_none() {
            return;
        }
        let dir = scratch("pdftext");
        let text_pdf = copy_in(&media.join("text.pdf"), &dir);
        let txt = run_ok(convert(Kind::Pdf, "txt", &text_pdf, &eng).unwrap());
        assert!(std::fs::read_to_string(txt).unwrap().contains("Cocoflow"));
        let md = run_ok(convert(Kind::Pdf, "md", &text_pdf, &eng).unwrap());
        assert!(std::fs::read_to_string(md).unwrap().contains("first paragraph"));
        let image_pdf = copy_in(&media.join("two.pdf"), &dir);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run_ok(convert(Kind::Pdf, "txt", &image_pdf, &eng).unwrap())
        }));
        assert!(result.is_err(), "an image-only PDF must not produce an empty text file");
    }

    #[test]
    fn slides_and_pdf_to_pptx_with_libreoffice() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        if eng.soffice.is_none() || eng.gs.is_none() {
            eprintln!("LibreOffice/Ghostscript not found, skipping");
            return;
        }
        let dir = scratch("slides");
        let text_pdf = copy_in(&media.join("text.pdf"), &dir);
        // PDF → PPTX gives us a real presentation to feed the slide conversions.
        let pptx = run_ok(convert(Kind::Pdf, "pptx", &text_pdf, &eng).unwrap());
        assert_eq!(crate::catalog::kind_of(&pptx), Kind::Slides);
        let pdf = run_ok(convert(Kind::Slides, "pdf", &pptx, &eng).unwrap());
        assert!(std::fs::metadata(&pdf).unwrap().len() > 1000);
        let png_dir = run_ok(convert(Kind::Slides, "png", &pptx, &eng).unwrap());
        assert!(png_dir.join("page_001.png").exists());
        let jpg_dir = run_ok(convert(Kind::Slides, "jpg", &pptx, &eng).unwrap());
        assert!(jpg_dir.join("page_001.jpg").exists());
        // PDF → DOCX with layout (LibreOffice) instead of the plain-text fallback
        run_ok(convert(Kind::Pdf, "docx", &text_pdf, &eng).unwrap());
    }

    fn size_of(p: &Path) -> u64 {
        std::fs::metadata(p).unwrap().len()
    }

    /// Width and height of the first video/image stream, read from ffmpeg's banner.
    fn dims(eng: &Engines, p: &Path) -> (u32, u32) {
        let out = Command::new(eng.ffmpeg.as_ref().unwrap()).args(["-hide_banner", "-i"]).arg(p).output().unwrap();
        let text = String::from_utf8_lossy(&out.stderr).to_string();
        let line = text.lines().find(|l| l.contains("Video:")).expect("no video stream");
        let token = line
            .split(|c: char| c == ' ' || c == ',' || c == '[')
            .find(|t| {
                let mut parts = t.split('x');
                matches!((parts.next(), parts.next(), parts.next()), (Some(a), Some(b), None)
                    if a.len() >= 2 && b.len() >= 2 && a.chars().all(|c| c.is_ascii_digit()) && b.chars().all(|c| c.is_ascii_digit()))
            })
            .expect("no size in stream line");
        let (w, h) = token.split_once('x').unwrap();
        (w.parse().unwrap(), h.parse().unwrap())
    }

    #[test]
    fn share_presets_hit_their_target_size() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        if eng.ffmpeg.is_none() || eng.gs.is_none() {
            return;
        }
        let (mb, kb) = (1024 * 1024u64, 1024u64);
        let dir = scratch("goals");
        let video = copy_in(&media.join("big.mp4"), &dir);
        let image = copy_in(&media.join("big.png"), &dir);
        let audio = copy_in(&media.join("big.wav"), &dir);
        let pdf = copy_in(&media.join("big.pdf"), &dir);

        let sized: [(Kind, &Path, &str, u64); 11] = [
            (Kind::Video, &video, "v-chat", 25 * mb),
            (Kind::Video, &video, "v-email", 10 * mb),
            (Kind::Image, &image, "i-chat", mb),
            (Kind::Image, &image, "i-email", 500 * kb),
            (Kind::Image, &image, "i-web", 200 * kb),
            (Kind::Audio, &audio, "a-voice", 5 * mb),
            (Kind::Audio, &audio, "a-email", 10 * mb),
            (Kind::Audio, &audio, "a-tiny", mb),
            (Kind::Pdf, &pdf, "p-email", 10 * mb),
            (Kind::Pdf, &pdf, "p-small", 2 * mb),
            (Kind::Pdf, &pdf, "p-print", u64::MAX),
        ];
        for (kind, input, id, limit) in sized {
            let out = run_ok(goals::plan(kind, id, input, &eng).unwrap());
            let size = size_of(&out);
            eprintln!("{id}: {} KB (limit {} KB)", size / 1024, limit.min(u64::MAX / 2) / 1024);
            assert!(size <= limit, "{id} produced {size} bytes, limit {limit}");
        }

        // fixed-geometry presets
        let shopee = run_ok(goals::plan(Kind::Image, "i-shopee", &image, &eng).unwrap());
        assert_eq!(dims(&eng, &shopee), (1000, 1000));
        let avatar = run_ok(goals::plan(Kind::Image, "i-avatar", &image, &eng).unwrap());
        assert_eq!(dims(&eng, &avatar), (512, 512));
        let story = run_ok(goals::plan(Kind::Video, "v-story", &video, &eng).unwrap());
        assert_eq!(dims(&eng, &story), (1080, 1920));

        // a file that is already small is reported, not re-encoded
        let tiny = copy_in(&media.join("clip1.mp4"), &dir);
        assert!(goals::plan(Kind::Video, "v-chat", &tiny, &eng).is_err());
    }

    // ------------------------------------------------------------------ QA probes (edge cases)

    fn try_run(cmd: Result<Cmd, String>) -> Result<PathBuf, String> {
        match cmd {
            Err(e) => Err(e),
            Ok(cmd) => std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_ok(cmd)))
                .map_err(|e| e.downcast_ref::<String>().cloned().unwrap_or_else(|| "panic".into())),
        }
    }

    fn pixel(eng: &Engines, image: &Path, x: u32, y: u32) -> (u8, u8, u8) {
        let out = Command::new(eng.ffmpeg.as_ref().unwrap())
            .args(["-hide_banner", "-loglevel", "error", "-i"])
            .arg(image)
            .args(["-vf", &format!("crop=1:1:{x}:{y}"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
            .output()
            .unwrap();
        (out.stdout[0], out.stdout[1], out.stdout[2])
    }

    #[test]
    fn qa_unicode_paths_work_for_every_engine() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = std::env::temp_dir().join("cocoflow-tests").join("Thư mục thử – dấu");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut failures = Vec::new();
        for file in ["pic.png", "clip1.mp4", "tone.wav", "doc.md", "text.pdf", "data.csv", "sample.zip", "sub.srt"] {
            let input = copy_in(&media.join(file), &dir);
            let kind = crate::catalog::kind_of(&input);
            let all = options_for(&[input.clone()], &eng);
            for o in all.convert.iter().chain(all.tools.iter()).chain(all.share.iter()) {
                let (family, id) = o.id.split_once(':').unwrap();
                if family == "merge" || family == "edit" {
                    continue; // editors take parameters and have their own test
                }
                let plan = match family {
                    "convert" => convert(kind, id, &input, &eng),
                    "share" => goals::plan(kind, id, &input, &eng),
                    _ => tool(kind, id, &input, &eng),
                };
                if matches!(&plan, Err(e) if e.starts_with("Already under")) {
                    continue;
                }
                if let Err(e) = try_run(plan) {
                    failures.push(format!("{file} {}: {}", o.id, e.lines().next().unwrap_or("")));
                }
            }
        }
        assert!(failures.is_empty(), "failures with non-ASCII paths: {failures:#?}");
    }

    #[test]
    fn qa_transparent_png_is_flattened_on_white_for_jpg() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("alpha");
        let input = copy_in(&media.join("alpha.png"), &dir);
        let jpg = run_ok(convert(Kind::Image, "jpg", &input, &eng).unwrap());
        let (r, g, b) = pixel(&eng, &jpg, 5, 5); // a fully transparent corner
        assert!(r > 200 && g > 200 && b > 200, "transparent area became ({r},{g},{b}), expected white");
        let shared = run_ok(goals::plan(Kind::Image, "i-fb", &input, &eng).unwrap());
        let (r, g, b) = pixel(&eng, &shared, 5, 5);
        assert!(r > 200 && g > 200 && b > 200, "Share preset: transparent area became ({r},{g},{b})");
    }

    #[test]
    fn qa_video_without_audio_can_be_merged() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("silent");
        let a = copy_in(&media.join("silent.mp4"), &dir);
        let b = copy_in(&media.join("clip1.mp4"), &dir);
        let merged = try_run(merge("video", &[a, b], &eng));
        assert!(merged.is_ok(), "merge failed: {merged:?}");
    }

    /// A copy of `src` (a plain JPEG) with an EXIF block that carries `orientation`.
    fn with_exif(src: &Path, dst: &Path, orientation: u8, big_endian: bool) {
        let jpeg = std::fs::read(src).unwrap();
        assert_eq!(&jpeg[..2], &[0xFF, 0xD8]);
        let (head, short): (&[u8], fn(u16) -> [u8; 2]) =
            if big_endian { (b"MM\0*", u16::to_be_bytes) } else { (b"II*\0", u16::to_le_bytes) };
        let long = |v: u32| if big_endian { v.to_be_bytes() } else { v.to_le_bytes() };
        let mut tiff = Vec::new();
        tiff.extend_from_slice(head);
        tiff.extend_from_slice(&long(8));
        tiff.extend_from_slice(&short(1)); // one entry
        tiff.extend_from_slice(&short(0x0112)); // Orientation
        tiff.extend_from_slice(&short(3)); // SHORT
        tiff.extend_from_slice(&long(1));
        tiff.extend_from_slice(&short(orientation as u16));
        tiff.extend_from_slice(&[0, 0]);
        tiff.extend_from_slice(&long(0)); // no next IFD
        let mut app1 = vec![0xFF, 0xE1];
        app1.extend_from_slice(&((tiff.len() + 6 + 2) as u16).to_be_bytes());
        app1.extend_from_slice(b"Exif\0\0");
        app1.extend_from_slice(&tiff);
        let mut out = jpeg[..2].to_vec();
        out.extend_from_slice(&app1);
        out.extend_from_slice(&jpeg[2..]);
        std::fs::write(dst, out).unwrap();
    }

    #[test]
    fn qa_exif_orientation_is_read_and_applied() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("exif");
        let plain = copy_in(&media.join("rot.jpg"), &dir); // 300x100, no EXIF
        assert_eq!(exif_orientation(&plain), 1);
        assert_eq!(dims(&eng, &plain), (300, 100));

        for (orientation, big_endian, expected) in
            [(6u8, false, (100, 300)), (6, true, (100, 300)), (8, false, (100, 300)), (3, false, (300, 100)), (1, false, (300, 100))]
        {
            let tagged = dir.join(format!("o{orientation}{}.jpg", if big_endian { "m" } else { "i" }));
            with_exif(&plain, &tagged, orientation, big_endian);
            assert_eq!(exif_orientation(&tagged), orientation);
            let png = run_ok(convert(Kind::Image, "png", &tagged, &eng).unwrap());
            assert_eq!(dims(&eng, &png), expected, "orientation {orientation} ({}) in convert", if big_endian { "MM" } else { "II" });
        }

        // tools and Share presets rotate too, and a jpg result must not carry the old tag on top of rotated pixels
        let tagged = dir.join("o6i.jpg");
        let half = run_ok(tool(Kind::Image, "half", &tagged, &eng).unwrap());
        assert_eq!(dims(&eng, &half), (50, 150));
        assert_eq!(exif_orientation(&half), 1, "stale orientation tag would rotate the picture twice");
        let shared = run_ok(goals::plan(Kind::Image, "i-fb", &tagged, &eng).unwrap());
        assert_eq!(dims(&eng, &shared), (100, 300));
        let sized = run_ok(goals::plan(Kind::Image, "i-web", &tagged, &eng).unwrap());
        assert_eq!(dims(&eng, &sized), (100, 300));
    }
    #[test]
    fn qa_docx_images_survive_pdf_export() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        if eng.magick.is_none() || eng.gs.is_none() {
            return;
        }
        let dir = scratch("docximg");
        let input = copy_in(&media.join("withimage.docx"), &dir);
        let pdf = run_ok(convert(Kind::Document, "pdf", &input, &eng).unwrap());
        let png = dir.join("page.png");
        let gs = Command::new(eng.gs.as_ref().unwrap())
            .args(["-dNOPAUSE", "-dBATCH", "-dSAFER", "-dFirstPage=1", "-dLastPage=1", "-r60", "-sDEVICE=png16m"])
            .arg(format!("-sOutputFile={}", png.display()))
            .arg(&pdf)
            .output()
            .unwrap();
        assert!(gs.status.success());
        let colors = Command::new(eng.magick.as_ref().unwrap())
            .args(["identify", "-format", "%k"])
            .arg(&png)
            .output()
            .unwrap();
        let colors: u32 = String::from_utf8_lossy(&colors.stdout).trim().parse().unwrap();
        assert!(colors > 150, "page has only {colors} colours: the embedded image is missing (text alone is ~50)");
    }

    #[test]
    fn qa_broken_inputs_report_errors_instead_of_panicking() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("broken");
        let bad_video = copy_in(&media.join("garbage.mp4"), &dir);
        let empty = copy_in(&media.join("empty.png"), &dir);
        assert!(try_run(convert(Kind::Video, "webm", &bad_video, &eng)).is_err());
        assert!(try_run(convert(Kind::Image, "jpg", &empty, &eng)).is_err());
        assert!(try_run(goals::plan(Kind::Video, "v-email", &bad_video, &eng)).is_err());
    }

    #[test]
    fn qa_folders_mixed_selections_and_odd_names() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("odd");
        let sub = dir.join("Thư mục con");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("a.txt"), "x").unwrap();
        assert_eq!(crate::catalog::kind_of(&sub), Kind::Folder);
        let all = options_for(&[sub.clone()], &eng);
        assert!(all.tools.iter().any(|o| o.id == "tool:zip"));
        assert!(all.convert.is_empty() && all.share.is_empty());
        let zip = run_ok(tool(Kind::Folder, "zip", &sub, &eng).unwrap());
        assert!(zip.is_file());

        let a = copy_in(&media.join("pic.png"), &dir);
        let b = copy_in(&media.join("tone.wav"), &dir);
        let mixed = options_for(&[a, b], &eng);
        assert!(mixed.convert.is_empty() && mixed.share.is_empty());
        assert!(mixed.tools.iter().any(|o| o.id == "tool:zip"));

        let upper = copy_in(&media.join("PIC_UPPER.PNG"), &dir);
        let jpg = run_ok(convert(Kind::Image, "jpg", &upper, &eng).unwrap());
        assert!(jpg.is_file());
        let noext = copy_in(&media.join("noext"), &dir);
        let o = options_for(&[noext], &eng);
        assert!(o.convert.is_empty() && !o.actions.is_empty());
    }

    #[test]
    fn qa_unused_output_names_are_not_reserved_forever() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("reserve");
        let pdf = copy_in(&media.join("text.pdf"), &dir);
        // PDF -> PNG writes a "<name>_pages" folder; the plain "<name>.png" name must stay free.
        let _plan = convert(Kind::Pdf, "png", &pdf, &eng).unwrap();
        let free = unique(&dir, "text", "png");
        assert_eq!(free.file_name().unwrap().to_string_lossy(), "text.png", "name stayed reserved");
    }

    #[test]
    fn qa_legacy_office_inputs_xls_and_ppt() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let Some(soffice) = eng.soffice.clone() else { return };
        let dir = scratch("legacy");
        let csv = copy_in(&media.join("data.csv"), &dir);
        let profile = dir.join("lo");
        let make = |input: &Path, format: &str| {
            let out = Command::new(&soffice)
                .arg(format!("-env:UserInstallation={}", native::file_url(&profile)))
                .args(["--headless", "--norestore", "--convert-to", format, "--outdir"])
                .arg(&dir)
                .arg(input)
                .output()
                .unwrap();
            assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        };
        make(&csv, "xls");
        let xls = dir.join("data.xls");
        assert!(xls.is_file());
        let xlsx = run_ok(convert(Kind::Spreadsheet, "xlsx", &xls, &eng).unwrap());
        assert!(crate::sheet::read(&xlsx).unwrap()[0].rows.len() >= 2);

        let text_pdf = copy_in(&media.join("text.pdf"), &dir);
        let pptx = run_ok(convert(Kind::Pdf, "pptx", &text_pdf, &eng).unwrap());
        make(&pptx, "ppt");
        let ppt = dir.join("text.ppt");
        assert!(ppt.is_file());
        assert_eq!(crate::catalog::kind_of(&ppt), Kind::Slides);
        run_ok(convert(Kind::Slides, "pdf", &ppt, &eng).unwrap());
    }

    fn params(items: &[(&str, &str)]) -> Params {
        items.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    fn count_files(dir: &Path) -> usize {
        std::fs::read_dir(dir).unwrap().flatten().filter(|e| e.path().is_file()).count()
    }

    #[test]
    fn scan_document_straightens_a_quad() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        if eng.magick.is_none() {
            eprintln!("ImageMagick not found, skipping");
            return;
        }
        let dir = scratch("scan");
        let image = copy_in(&media.join("pic.png"), &dir); // 800x600
        let quad = |look: &str| {
            params(&[
                ("x0", "60"), ("y0", "40"), ("x1", "700"), ("y1", "70"), ("x2", "740"), ("y2", "540"), ("x3", "30"), ("y3", "560"),
                ("w", "500"), ("h", "400"), ("look", look),
            ])
        };
        for look in ["color", "white", "clear", "bw"] {
            let out = run_ok(tool_params(Kind::Image, "scan", &image, &eng, &quad(look)).unwrap());
            assert_eq!(dims(&eng, &out), (500, 400), "look {look}");
            assert!(out.file_name().unwrap().to_string_lossy().contains("_scan"));
        }
        assert!(tool_params(Kind::Image, "scan", &image, &eng, &params(&[("w", "0"), ("h", "10")])).is_err());
        let mut missing = quad("color");
        missing.remove("x2");
        assert!(tool_params(Kind::Image, "scan", &image, &eng, &missing).is_err());
    }

    #[test]
    fn editors_trim_crop_resize_split() {
        use crate::preview;
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("editors");
        let video = copy_in(&media.join("clip1.mp4"), &dir); // 4 s, 640x360, with audio
        let image = copy_in(&media.join("pic.png"), &dir); // 800x600
        let audio = copy_in(&media.join("tone.wav"), &dir); // 3 s
        let secs = |p: &Path| preview::probe(&eng, p).unwrap().duration.unwrap();

        // trim: accurate and fast
        let t = run_ok(tool_params(Kind::Video, "trim", &video, &eng, &params(&[("start", "1"), ("end", "3")])).unwrap());
        assert!((secs(&t) - 2.0).abs() < 0.25, "accurate trim is {} s", secs(&t));
        let t = run_ok(tool_params(Kind::Video, "trim", &video, &eng, &params(&[("start", "0:01"), ("end", "0:03"), ("fast", "1")])).unwrap());
        assert!((secs(&t) - 2.0).abs() < 1.2, "fast trim is {} s", secs(&t));
        let t = run_ok(tool_params(Kind::Audio, "trim", &audio, &eng, &params(&[("start", "0.5")])).unwrap());
        assert!((secs(&t) - 2.5).abs() < 0.2, "open-ended trim is {} s", secs(&t));
        assert!(tool_params(Kind::Video, "trim", &video, &eng, &params(&[("start", "3"), ("end", "2")])).is_err());

        // crop and resize
        let c = run_ok(tool_params(Kind::Image, "crop", &image, &eng, &params(&[("x", "100"), ("y", "50"), ("w", "400"), ("h", "300")])).unwrap());
        assert_eq!(dims(&eng, &c), (400, 300));
        let c = run_ok(tool_params(Kind::Video, "crop", &video, &eng, &params(&[("x", "10"), ("y", "10"), ("w", "301"), ("h", "200")])).unwrap());
        assert_eq!(dims(&eng, &c), (300, 200), "video crop must be even-sized");
        assert!(tool_params(Kind::Image, "crop", &image, &eng, &params(&[("x", "0"), ("y", "0"), ("w", "0"), ("h", "10")])).is_err());
        for (items, expected) in [
            (vec![("percent", "50")], (400, 300)),
            (vec![("w", "200")], (200, 150)),
            (vec![("w", "100"), ("h", "100")], (100, 76)),
            (vec![("w", "5000")], (800, 600)), // never enlarges
        ] {
            let r = run_ok(tool_params(Kind::Image, "resize", &image, &eng, &params(&items)).unwrap());
            let got = dims(&eng, &r);
            assert!((got.0 as i32 - expected.0).abs() <= 2 && (got.1 as i32 - expected.1).abs() <= 2, "{items:?}: got {got:?}, expected {expected:?}");
        }
        let r = run_ok(tool_params(Kind::Video, "resize", &video, &eng, &params(&[("h", "180")])).unwrap());
        assert_eq!(dims(&eng, &r), (320, 180));

        // split media
        let parts = run_ok(tool_params(Kind::Video, "split", &video, &eng, &params(&[("mode", "every"), ("every", "1.5")])).unwrap());
        assert!(count_files(&parts) >= 2, "{} parts", count_files(&parts));
        let parts = run_ok(tool_params(Kind::Video, "split", &video, &eng, &params(&[("mode", "points"), ("points", "1, 2.5")])).unwrap());
        assert_eq!(count_files(&parts), 3);
        let parts = run_ok(tool_params(Kind::Audio, "split", &audio, &eng, &params(&[("mode", "every"), ("every", "1"), ("fast", "1")])).unwrap());
        assert_eq!(count_files(&parts), 3);
        assert!(tool_params(Kind::Video, "split", &video, &eng, &params(&[("mode", "every"), ("every", "0")])).is_err());

        // split a PDF
        if eng.gs.is_some() {
            let two = copy_in(&media.join("two.pdf"), &dir);
            let two_b = dir.join("two_b.pdf");
            std::fs::copy(&two, &two_b).unwrap();
            let four = run_ok(merge("pdf", &[two, two_b], &eng).unwrap()); // 4 pages
            let info = preview::pdf_info(&eng, &four).unwrap();
            assert_eq!(info.pages, 4);
            assert_eq!(info.thumbs.len(), 4);
            let each = run_ok(tool_params(Kind::Pdf, "split", &four, &eng, &params(&[("mode", "each")])).unwrap());
            assert_eq!(count_files(&each), 4);
            let sel = run_ok(tool_params(Kind::Pdf, "split", &four, &eng, &params(&[("mode", "extract"), ("pages", "1,3-4")])).unwrap());
            assert_eq!(count_files(&sel), 1);
            let one = sel.join(std::fs::read_dir(&sel).unwrap().flatten().next().unwrap().file_name());
            assert_eq!(preview::pdf_info(&eng, &one).unwrap().pages, 3);
            let ranges = run_ok(tool_params(Kind::Pdf, "split", &four, &eng, &params(&[("mode", "ranges"), ("pages", "1-2,4")])).unwrap());
            assert_eq!(count_files(&ranges), 2);
            assert!(tool_params(Kind::Pdf, "split", &four, &eng, &params(&[("mode", "extract"), ("pages", "1;rm")])).is_err());
        }
    }

    #[test]
    fn preview_files_are_browser_friendly() {
        use crate::preview;
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("previews");
        // a format the web view cannot play gets a converted copy; supported ones are used as they are
        let mkv = run_ok(convert(Kind::Video, "mkv", &copy_in(&media.join("clip1.mp4"), &dir), &eng).unwrap());
        let mp4 = copy_in(&media.join("clip1.mp4"), &dir);
        assert_eq!(preview::preview_path(&eng, &mp4).unwrap(), mp4);
        let proxy = preview::preview_path(&eng, &mkv).unwrap();
        assert_ne!(proxy, mkv);
        assert_eq!(ext_of(&proxy), "mp4");
        assert!(proxy.is_file());
        let info = preview::probe(&eng, &mp4).unwrap();
        assert_eq!((info.width, info.height), (640, 360));
        assert!(info.has_audio && info.duration.unwrap() > 3.5);
    }

    #[test]
    fn process_tree_can_be_paused_resumed_and_killed() {
        use crate::proc;
        use std::time::{Duration, Instant};
        // `ping -n 4` takes about 3 seconds
        let mut child = Command::new("ping").args(["-n", "4", "127.0.0.1"]).stdout(std::process::Stdio::null()).spawn().unwrap();
        let pid = child.id();
        proc::suspend_tree(pid);
        std::thread::sleep(Duration::from_millis(4000));
        assert!(child.try_wait().unwrap().is_none(), "a paused process must not finish");
        proc::resume_tree(pid);
        let started = Instant::now();
        while child.try_wait().unwrap().is_none() {
            assert!(started.elapsed() < Duration::from_secs(10), "resumed process never finished");
            std::thread::sleep(Duration::from_millis(100));
        }
        let mut long = Command::new("ping").args(["-n", "30", "127.0.0.1"]).stdout(std::process::Stdio::null()).spawn().unwrap();
        std::thread::sleep(Duration::from_millis(300));
        proc::kill_tree(long.id());
        let started = Instant::now();
        while long.try_wait().unwrap().is_none() {
            assert!(started.elapsed() < Duration::from_secs(5), "kill_tree did not stop the process");
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    // ------------------------------------------------------------------ offline AI

    fn ai_engines() -> Option<Engines> {
        let eng = Engines::detect();
        eng.ai.any().then_some(eng)
    }

    fn rgba_at(eng: &Engines, image: &Path, x: u32, y: u32) -> [u8; 4] {
        let out = Command::new(eng.ffmpeg.as_ref().unwrap())
            .args(["-hide_banner", "-loglevel", "error", "-i"])
            .arg(image)
            .args(["-vf", &format!("crop=1:1:{x}:{y}"), "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
            .output()
            .unwrap();
        [out.stdout[0], out.stdout[1], out.stdout[2], out.stdout[3]]
    }

    fn pdf_text(eng: &Engines, pdf: &Path) -> String {
        let out = Command::new(eng.gs.as_ref().unwrap())
            .args(["-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=txtwrite", "-o", "-"])
            .arg(pdf)
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    #[test]
    fn ai_ocr_reads_vietnamese_images_and_scanned_pdfs() {
        use crate::ai;
        let Some(media) = media() else { return };
        let Some(eng) = ai_engines() else { return };
        if !eng.ai.ocr() {
            return;
        }
        let dir = scratch("ocr");
        let image = copy_in(&media.join("ocr.png"), &dir);
        let txt = run_ok(ai::plan(Kind::Image, "ocr", &image, &eng, &Params::new()).unwrap());
        let text = std::fs::read_to_string(&txt).unwrap();
        eprintln!("OCR image: {text:?}");
        assert!(text.contains("Việt Nam"), "Vietnamese diacritics lost: {text:?}");
        assert!(text.contains("Cocoflow"), "{text:?}");

        let searchable = run_ok(ai::plan(Kind::Image, "ocr-pdf", &image, &eng, &Params::new()).unwrap());
        assert!(pdf_text(&eng, &searchable).contains("Cocoflow"), "the PDF has no text layer");

        let scan = copy_in(&media.join("scan.pdf"), &dir);
        let from_pdf = run_ok(ai::plan(Kind::Pdf, "ocr", &scan, &eng, &Params::new()).unwrap());
        assert!(std::fs::read_to_string(from_pdf).unwrap().contains("Cocoflow"));
        let pdf2 = run_ok(ai::plan(Kind::Pdf, "ocr-pdf", &scan, &eng, &Params::new()).unwrap());
        assert!(pdf_text(&eng, &pdf2).contains("Cocoflow"));
        // the summary of a scanned PDF falls back to OCR
        let sum = run_ok(ai::plan(Kind::Pdf, "summary", &scan, &eng, &Params::new()).unwrap());
        assert!(std::fs::read_to_string(sum).unwrap().contains("Cocoflow"));
    }

    #[test]
    fn ai_transcribes_speech_to_subtitles() {
        use crate::ai;
        let Some(media) = media() else { return };
        let Some(eng) = ai_engines() else { return };
        if !eng.ai.transcribe() {
            return;
        }
        let dir = scratch("whisper");
        let speech = copy_in(&media.join("speech.wav"), &dir);
        let started = std::time::Instant::now();
        let srt = run_ok(
            ai::plan(Kind::Audio, "transcribe", &speech, &eng, &params(&[("language", "en"), ("formats", "srt,vtt,txt")])).unwrap(),
        );
        eprintln!("whisper took {:?}", started.elapsed());
        let text = std::fs::read_to_string(&srt).unwrap().to_lowercase();
        eprintln!("SRT: {text}");
        assert!(text.contains("-->"), "not an SRT file");
        assert!(text.contains("hello"), "{text}");
        assert!(dir.join("speech (1).vtt").exists() || dir.join("speech.vtt").exists());
        assert!(dir.join("speech.txt").exists());
        // speech summary = transcript + extractive summary
        let talk = run_ok(ai::plan(Kind::Audio, "talk-summary", &speech, &eng, &params(&[("language", "en")])).unwrap());
        let summary = std::fs::read_to_string(&talk).unwrap().to_lowercase();
        eprintln!("talk summary: {summary}");
        assert!(summary.contains("cocoflow") || summary.contains("hello"), "{summary}");
        assert!(!dir.join("speech_talk.txt").exists(), "the intermediate transcript must be removed");
        // a video without sound is refused clearly
        let silent = copy_in(&media.join("silent.mp4"), &dir);
        assert!(ai::plan(Kind::Video, "transcribe", &silent, &eng, &Params::new()).is_err());
    }

    #[test]
    fn ai_removes_background_and_upscales() {
        use crate::ai;
        let Some(media) = media() else { return };
        let Some(eng) = ai_engines() else { return };
        let dir = scratch("vision");
        if eng.ai.background() {
            let object = copy_in(&media.join("object.png"), &dir);
            let out = run_ok(ai::plan(Kind::Image, "rmbg", &object, &eng, &Params::new()).unwrap());
            let corner = rgba_at(&eng, &out, 4, 4);
            let centre = rgba_at(&eng, &out, 240, 240);
            eprintln!("alpha corner={} centre={}", corner[3], centre[3]);
            assert!(corner[3] < 90, "the background should be transparent, alpha = {}", corner[3]);
            assert!(centre[3] > 200, "the object should stay opaque, alpha = {}", centre[3]);
            assert_eq!(dims(&eng, &out), (480, 480));
        }
        if eng.ai.upscale() {
            let small = copy_in(&media.join("small.png"), &dir);
            let x4 = run_ok(ai::plan(Kind::Image, "up4", &small, &eng, &Params::new()).unwrap());
            assert_eq!(dims(&eng, &x4), (256, 192));
            let x2 = run_ok(ai::plan(Kind::Image, "up2", &small, &eng, &Params::new()).unwrap());
            assert_eq!(dims(&eng, &x2), (128, 96));
        }
    }

    #[test]
    fn archives_convert_between_formats() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("archives");
        let zip_in = copy_in(&media.join("sample.zip"), &dir);
        let tgz = run_ok(convert(Kind::Archive, "gzip", &zip_in, &eng).unwrap());
        assert!(tgz.to_string_lossy().ends_with(".tar.gz"));
        let back = run_ok(convert(Kind::Archive, "zip", &tgz, &eng).unwrap());
        assert_eq!(back.file_name().unwrap().to_string_lossy(), "sample (1).zip");
        let folder = run_ok(tool(Kind::Archive, "extract", &back, &eng).unwrap());
        assert!(folder.join("pic.png").exists());
    }

    #[test]
    fn extract_zip_roundtrip() {
        let Some(media) = media() else { return };
        let eng = Engines::detect();
        let dir = scratch("zip");
        let pic = copy_in(&media.join("pic.png"), &dir);
        let archive = run_ok(zip(&[pic], &eng).unwrap());
        let cmd = tool(Kind::Archive, "extract", &archive, &eng).unwrap();
        let folder = run_ok(cmd);
        assert!(folder.join("pic.png").exists());
    }

    #[test]
    fn unique_names_do_not_collide() {
        let dir = scratch("unique");
        let a = unique(&dir, "x", "mp4");
        let b = unique(&dir, "x", "mp4");
        assert_ne!(a, b);
    }
}





















