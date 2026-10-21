//! Data for the editors (trim, crop, split): media information and browser-friendly previews.

use crate::catalog::{ext_of, kind_of, Kind};
use crate::engines::Engines;
use crate::goals;
use serde::Serialize;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize, Default)]
pub struct MediaInfo {
    pub duration: Option<f64>,
    pub width: u32,
    pub height: u32,
    pub has_audio: bool,
}

#[derive(Serialize)]
pub struct PdfInfo {
    pub pages: u32,
    /// PNG thumbnails of the first pages, in page order.
    pub thumbs: Vec<String>,
}

pub fn cache_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let dir = base.join("Tangelo").join("cache");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Deletes cached previews older than three days.
pub fn clean_cache() {
    let limit = std::time::Duration::from_secs(3 * 24 * 3600);
    if let Ok(entries) = std::fs::read_dir(cache_dir()) {
        for entry in entries.flatten() {
            let old = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .is_some_and(|age| age > limit);
            if old {
                let path = entry.path();
                let _ = if path.is_dir() { std::fs::remove_dir_all(path) } else { std::fs::remove_file(path) };
            }
        }
    }
}

/// A stable name for the cache entry of one file version.
fn key(path: &Path) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut h);
    if let Ok(meta) = std::fs::metadata(path) {
        meta.len().hash(&mut h);
        if let Ok(t) = meta.modified() {
            t.hash(&mut h);
        }
    }
    format!("{:016x}", h.finish())
}

pub fn probe(eng: &Engines, path: &Path) -> Result<MediaInfo, String> {
    let ffmpeg = eng.ffmpeg.as_ref().ok_or("FFmpeg was not found")?;
    let text = goals::banner(ffmpeg, path);
    let video_line = text.lines().find(|l| l.contains("Stream #") && l.contains("Video:"));
    let (width, height) = video_line
        .and_then(|line| {
            line.split(|c: char| c == ' ' || c == ',' || c == '[').find_map(|t| {
                let (a, b) = t.split_once('x')?;
                let digits = |s: &str| s.len() >= 2 && s.bytes().all(|c| c.is_ascii_digit());
                if digits(a) && digits(b) {
                    Some((a.parse::<u32>().ok()?, b.parse::<u32>().ok()?))
                } else {
                    None
                }
            })
        })
        .unwrap_or((0, 0));    Ok(MediaInfo {
        duration: text.lines().find_map(crate::jobs::parse_duration),
        width,
        height,
        has_audio: text.lines().any(|l| l.contains("Stream #") && l.contains("Audio:")),
    })
}

fn run(program: &Path, args: Vec<OsString>) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    let out = crate::jobs::run_tracked(&mut cmd)?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).lines().rev().take(3).collect::<Vec<_>>().join("\n"))
    }
}

/// A file the web view can play or show: the original when its format is supported, otherwise a
/// small converted copy (cached).
pub fn preview_path(eng: &Engines, path: &Path) -> Result<PathBuf, String> {
    let ext = ext_of(path);
    let kind = kind_of(path);
    let direct = match kind {
        Kind::Video => matches!(ext.as_str(), "mp4" | "m4v" | "webm" | "mov" | "ogv"),
        Kind::Audio => matches!(ext.as_str(), "mp3" | "wav" | "m4a" | "aac" | "ogg" | "opus" | "flac"),
        Kind::Image => matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "avif" | "svg" | "ico"),
        _ => true,
    };
    if direct {
        return Ok(path.to_path_buf());
    }
    let ffmpeg = eng.ffmpeg.clone().ok_or("FFmpeg was not found")?;
    let (suffix, extra): (&str, Vec<&str>) = match kind {
        Kind::Video => ("mp4", vec!["-vf", "scale=-2:'min(480,ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"]),
        Kind::Audio => ("mp3", vec!["-vn", "-c:a", "libmp3lame", "-b:a", "128k"]),
        _ => ("png", vec!["-frames:v", "1", "-vf", "scale='min(2000,iw)':-2"]),
    };
    let out = cache_dir().join(format!("{}.{suffix}", key(path)));
    if out.is_file() && std::fs::metadata(&out).map(|m| m.len() > 0).unwrap_or(false) {
        return Ok(out);
    }
    let partial = out.with_extension(format!("part.{suffix}"));
    let mut args: Vec<OsString> = ["-y", "-hide_banner", "-loglevel", "error", "-i"].iter().map(OsString::from).collect();
    args.push(path.into());
    args.extend(extra.iter().map(OsString::from));
    args.push(partial.clone().into());
    if let Err(e) = run(&ffmpeg, args) {
        let _ = std::fs::remove_file(&partial);
        return Err(e);
    }
    std::fs::rename(&partial, &out).map_err(|e| e.to_string())?;
    Ok(out)
}

/// Page count and thumbnails of a PDF.
pub fn pdf_info(eng: &Engines, path: &Path) -> Result<PdfInfo, String> {
    let gs = eng.gs.clone().ok_or("Ghostscript was not found")?;
    let dir = cache_dir().join(format!("pdf-{}", key(path)));
    let marker = dir.join("pages.txt");
    let cached = std::fs::read_to_string(&marker).ok().and_then(|t| t.trim().parse::<u32>().ok());
    let pages = match cached {
        Some(n) => n,
        None => {
            // PostScript string: escape backslashes and parentheses, use forward slashes for the path.
            let ps = path.display().to_string().replace('\\', "/").replace('(', "\\(").replace(')', "\\)");
            let args: Vec<OsString> = ["-q", "-dNODISPLAY", "-dNOSAFER", "-c"].iter().map(OsString::from).chain([
                OsString::from(format!("({ps}) (r) file runpdfbegin pdfpagecount = quit")),
            ]).collect();
            let mut cmd = Command::new(&gs);
            cmd.args(args);
            let out = crate::jobs::run_tracked(&mut cmd)?;
            let n: u32 = String::from_utf8_lossy(&out.stdout).trim().parse().map_err(|_| "Cannot read the PDF".to_string())?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let mut render: Vec<OsString> = ["-dNOPAUSE", "-dBATCH", "-dSAFER", "-r32", "-dLastPage=120", "-sDEVICE=png16m"]
                .iter()
                .map(OsString::from)
                .collect();
            render.push(format!("-sOutputFile={}", dir.join("p_%03d.png").display()).into());
            render.push(path.into());
            run(&gs, render)?;
            let _ = std::fs::write(&marker, n.to_string());
            n
        }
    };
    let mut thumbs: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "png"))
        .map(|p| p.display().to_string())
        .collect();
    thumbs.sort();
    Ok(PdfInfo { pages, thumbs })
}

