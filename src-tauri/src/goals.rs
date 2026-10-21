//! "Share" presets: pick the purpose (chat, email, story…) instead of a format.
//! The size presets compress *to* a target size, which is the part people usually get wrong by hand.

use crate::catalog::{ext_of, Kind};
use crate::engines::Engines;
use crate::native;
use crate::plan::{ffmpeg_cmd, os, parent_of, stem_of, unique, Cmd};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

const MB: u64 = 1024 * 1024;
const KB: u64 = 1024;

pub struct Goal {
    pub id: &'static str,
    pub label: &'static str,
    /// Short caption under the label; for size goals this is also what the hub shows on hover.
    pub sub: &'static str,
}

const fn goal(id: &'static str, label: &'static str, sub: &'static str) -> Goal {
    Goal { id, label, sub }
}

pub fn goals_for(kind: Kind, eng: &Engines) -> Vec<Goal> {
    let ff = eng.ffmpeg.is_some();
    match kind {
        Kind::Video if ff => vec![
            goal("v-chat", "Zalo · Chat", "≤ 25 MB"),
            goal("v-email", "Email", "≤ 10 MB"),
            goal("v-story", "Story 9:16", "1080×1920"),
            goal("v-web", "Web 1080p", "YouTube · FB"),
        ],
        Kind::Image if ff => vec![
            goal("i-chat", "Zalo · Chat", "≤ 1 MB"),
            goal("i-email", "Email", "≤ 500 KB"),
            goal("i-web", "Web", "≤ 200 KB"),
            goal("i-fb", "Facebook", "2048 px"),
            goal("i-shopee", "Shopee", "1000×1000"),
            goal("i-avatar", "Avatar", "512×512"),
        ],
        Kind::Audio if ff => vec![
            goal("a-voice", "Voice note", "≤ 5 MB"),
            goal("a-email", "Email", "≤ 10 MB"),
            goal("a-tiny", "Tiny", "≤ 1 MB"),
            goal("a-podcast", "Podcast", "MP3 mono"),
        ],
        Kind::Pdf if eng.gs.is_some() => vec![
            goal("p-email", "Email", "≤ 10 MB"),
            goal("p-small", "Small", "≤ 2 MB"),
            goal("p-print", "Print", "high quality"),
        ],
        _ => vec![],
    }
}

pub fn label_of(id: &str) -> &'static str {
    crate::i18n::get().goal_name(id)
}
/// Runs a tool and waits for it; the run can be paused and cancelled like any other job step.
fn hidden(program: &Path, args: &[OsString]) -> Result<std::process::Output, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    crate::jobs::run_tracked(&mut cmd)
}
fn size_of(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// ffmpeg's description of a file (printed on stderr when no output is given).
pub(crate) fn banner(ffmpeg: &Path, input: &Path) -> String {
    match hidden(ffmpeg, &[OsString::from("-hide_banner"), OsString::from("-i"), input.into()]) {
        Ok(out) => String::from_utf8_lossy(&out.stderr).into_owned(),
        Err(_) => String::new(),
    }
}

/// Length in seconds, read from ffmpeg's banner.
pub(crate) fn duration_of(ffmpeg: &Path, input: &Path) -> Option<f64> {
    banner(ffmpeg, input).lines().find_map(crate::jobs::parse_duration)
}

pub(crate) fn has_audio(ffmpeg: &Path, input: &Path) -> bool {
    banner(ffmpeg, input).lines().any(|l| l.contains("Stream #") && l.contains("Audio:"))
}

fn mb(bytes: u64) -> String {
    if bytes >= MB { format!("{} MB", bytes / MB) } else { format!("{} KB", bytes / KB) }
}

fn already_small(target: u64) -> String {
    format!("Already under {} — nothing to shrink", mb(target))
}

pub fn plan(kind: Kind, id: &str, input: &Path, eng: &Engines) -> Result<Cmd, String> {
    let dir = parent_of(input);
    let stem = stem_of(input);
    match (kind, id) {
        (Kind::Video, "v-chat") => video_to_size(eng, input, &dir, &stem, 25 * MB, "_25MB"),
        (Kind::Video, "v-email") => video_to_size(eng, input, &dir, &stem, 10 * MB, "_10MB"),
        (Kind::Video, "v-story") => {
            let pre = [
                "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
                "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
            ];
            ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_story"), "mp4"))
        }
        (Kind::Video, "v-web") => {
            let pre = [
                "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
            ];
            ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_1080p"), "mp4"))
        }

        (Kind::Image, "i-chat") => image_to_size(eng, input, &dir, &stem, MB, 2048, false, "_1MB"),
        (Kind::Image, "i-email") => image_to_size(eng, input, &dir, &stem, 500 * KB, 1600, false, "_500KB"),
        (Kind::Image, "i-web") => image_to_size(eng, input, &dir, &stem, 200 * KB, 1600, true, "_web"),
        (Kind::Image, "i-fb") => {
            let pre = [
                "-frames:v", "1", "-map_metadata", "-1",
                "-vf", "scale=w='if(gt(iw,ih),min(2048,iw),-2)':h='if(gt(iw,ih),-2,min(2048,ih))'",
                "-q:v", "3",
            ];
            ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_facebook"), "jpg"))
        }
        (Kind::Image, "i-shopee") => {
            // Fit inside a square and pad with white: marketplaces want 1:1 product photos.
            let pre = [
                "-frames:v", "1", "-map_metadata", "-1",
                "-vf", "scale=1000:1000:force_original_aspect_ratio=decrease,pad=1000:1000:(ow-iw)/2:(oh-ih)/2:white",
                "-q:v", "2",
            ];
            ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_shopee"), "jpg"))
        }
        (Kind::Image, "i-avatar") => {
            let pre = [
                "-frames:v", "1", "-map_metadata", "-1",
                "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=512:512",
            ];
            ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_avatar"), "png"))
        }

        (Kind::Audio, "a-voice") => audio_to_size(eng, input, &dir, &stem, 5 * MB, true, "_voice"),
        (Kind::Audio, "a-email") => audio_to_size(eng, input, &dir, &stem, 10 * MB, false, "_10MB"),
        (Kind::Audio, "a-tiny") => audio_to_size(eng, input, &dir, &stem, MB, true, "_tiny"),
        (Kind::Audio, "a-podcast") => {
            let pre = ["-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k"];
            ffmpeg_cmd(eng, &[input], &pre, unique(&dir, &format!("{stem}_podcast"), "mp3"))
        }

        (Kind::Pdf, "p-email") => pdf_to_size(eng, input, &dir, &stem, 10 * MB, "_10MB"),
        (Kind::Pdf, "p-small") => pdf_to_size(eng, input, &dir, &stem, 2 * MB, "_2MB"),
        (Kind::Pdf, "p-print") => pdf_to_size(eng, input, &dir, &stem, 0, "_print"),
        _ => Err(format!("Preset {id} is not available for this file")),
    }
}

/// Two-pass x264 aimed at `target` bytes. Resolution drops when the bitrate is too low for it.
fn video_to_size(eng: &Engines, input: &Path, dir: &Path, stem: &str, target: u64, suffix: &str) -> Result<Cmd, String> {
    let ffmpeg = eng.ffmpeg.clone().ok_or("FFmpeg was not found")?;
    if size_of(input) <= target {
        return Err(already_small(target));
    }
    let seconds = duration_of(&ffmpeg, input).filter(|s| *s > 0.5).ok_or("Cannot read the video length")?;
    let audio_kbps: f64 = if target <= 12 * MB { 64.0 } else { 96.0 };
    // 8 % headroom for container overhead and rate-control drift.
    let total_kbps = target as f64 * 8.0 * 0.92 / seconds / 1000.0;
    let video_kbps = total_kbps - audio_kbps;
    if video_kbps < 60.0 {
        return Err(format!("This video is too long to fit in {}", mb(target)));
    }
    let height = match video_kbps {
        k if k < 250.0 => 360,
        k if k < 600.0 => 480,
        k if k < 1400.0 => 720,
        _ => 1080,
    };
    let filter = format!("scale=-2:'min({height},ih)',format=yuv420p");
    let temp = native::temp_dir("tsize");
    let log = temp.join("pass").display().to_string();
    let bitrate = format!("{}k", video_kbps.round() as u64);
    let abitrate = format!("{}k", audio_kbps as u64);

    let first = ffmpeg_cmd(
        eng,
        &[input],
        &["-vf", &filter, "-c:v", "libx264", "-preset", "medium", "-b:v", &bitrate, "-pass", "1", "-passlogfile", &log, "-an", "-f", "null"],
        PathBuf::from("NUL"),
    )?;
    let output = unique(dir, &format!("{stem}{suffix}"), "mp4");
    let second = ffmpeg_cmd(
        eng,
        &[input],
        &[
            "-vf", &filter, "-c:v", "libx264", "-preset", "medium", "-b:v", &bitrate, "-pass", "2", "-passlogfile",
            &log, "-c:a", "aac", "-b:a", &abitrate, "-ac", "2", "-movflags", "+faststart",
        ],
        output,
    )?;
    Ok(second.after(first, &[temp]))
}

/// Walks a quality ladder, then shrinks the picture, until the file fits.
#[allow(clippy::too_many_arguments)]
fn image_to_size(
    eng: &Engines,
    input: &Path,
    dir: &Path,
    stem: &str,
    target: u64,
    max_edge: u32,
    webp: bool,
    suffix: &str,
) -> Result<Cmd, String> {
    let ffmpeg = eng.ffmpeg.clone().ok_or("FFmpeg was not found")?;
    let ext = if webp { "webp" } else { "jpg" };
    if size_of(input) <= target && ext_of(input) == ext {
        return Err(already_small(target));
    }
    let output = unique(dir, &format!("{stem}{suffix}"), ext);
    let (source, out) = (input.to_path_buf(), output.clone());
    let prefix = crate::plan::still_prefix(input, !webp);
    let jpeg_in = matches!(ext_of(input).as_str(), "jpg" | "jpeg");
    Ok(Cmd::native(output, move || {
        let ladder: &[&str] = if webp { &["92", "82", "72", "62", "52", "42", "32"] } else { &["2", "4", "6", "9", "13", "18", "24"] };
        let flag = if webp { "-quality" } else { "-q:v" };
        let mut factor = 1.0_f64;
        for _ in 0..7 {
            let sizing = format!(
                "scale=w='if(gt(iw,ih),min({e},iw),-2)':h='if(gt(iw,ih),-2,min({e},ih))',scale=trunc(iw*{f:.3}/2)*2:trunc(ih*{f:.3}/2)*2",
                e = max_edge,
                f = factor
            );
            let filter = match &prefix {
                Some(p) => format!("{p},{sizing}"),
                None => sizing,
            };
            for quality in ladder {
                let mut args = os(&["-y", "-hide_banner", "-loglevel", "error"]);
                if jpeg_in {
                    args.push("-noautorotate".into());
                }
                args.push("-i".into());
                args.push(source.clone().into());
                args.extend(os(&["-frames:v", "1", "-map_metadata", "-1", "-vf", &filter, flag, quality]));
                args.push(out.clone().into());
                let run = hidden(&ffmpeg, &args)?;
                if !run.status.success() {
                    return Err(String::from_utf8_lossy(&run.stderr).trim().to_string());
                }
                if size_of(&out) <= target {
                    return Ok(());
                }
            }
            factor *= 0.8;
        }
        Err(format!("Could not get this image under {}", mb(target)))
    }))
}

/// MP3 sized from the clip length: bitrate = target / duration.
fn audio_to_size(eng: &Engines, input: &Path, dir: &Path, stem: &str, target: u64, mono: bool, suffix: &str) -> Result<Cmd, String> {
    let ffmpeg = eng.ffmpeg.clone().ok_or("FFmpeg was not found")?;
    if size_of(input) <= target {
        return Err(already_small(target));
    }
    let seconds = duration_of(&ffmpeg, input).filter(|s| *s > 0.5).ok_or("Cannot read the audio length")?;
    let kbps = (target as f64 * 8.0 * 0.94 / seconds / 1000.0).floor();
    if kbps < 16.0 {
        return Err(format!("This audio is too long to fit in {}", mb(target)));
    }
    let kbps = kbps.min(if mono { 128.0 } else { 192.0 }) as u64;
    let bitrate = format!("{kbps}k");
    let rate = if kbps <= 48 { "24000" } else { "44100" };
    let mut pre = vec!["-vn"];
    if mono {
        pre.extend(["-ac", "1"]);
    }
    pre.extend(["-ar", rate, "-c:a", "libmp3lame", "-b:a", &bitrate]);
    ffmpeg_cmd(eng, &[input], &pre, unique(dir, &format!("{stem}{suffix}"), "mp3"))
}

/// Ghostscript presets from best to smallest quality; the first one that fits wins.
fn pdf_to_size(eng: &Engines, input: &Path, dir: &Path, stem: &str, target: u64, suffix: &str) -> Result<Cmd, String> {
    let gs = eng.gs.clone().ok_or("Ghostscript was not found")?;
    if target > 0 && size_of(input) <= target {
        return Err(already_small(target));
    }
    let output = unique(dir, &format!("{stem}{suffix}"), "pdf");
    let (source, out) = (input.to_path_buf(), output.clone());
    Ok(Cmd::native(output, move || {
        let temp = native::temp_dir("pdfsize");
        let settings: &[&str] = if target == 0 { &["/printer"] } else { &["/printer", "/ebook", "/screen"] };
        let mut best: Option<(u64, PathBuf)> = None;
        for (i, setting) in settings.iter().enumerate() {
            let candidate = temp.join(format!("try{i}.pdf"));
            let mut args = os(&["-sDEVICE=pdfwrite", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-dQUIET"]);
            args.push(format!("-dPDFSETTINGS={setting}").into());
            args.push(format!("-sOutputFile={}", candidate.display()).into());
            args.push(source.clone().into());
            let run = hidden(&gs, &args)?;
            if !run.status.success() {
                let _ = std::fs::remove_dir_all(&temp);
                return Err(String::from_utf8_lossy(&run.stderr).trim().to_string());
            }
            let size = size_of(&candidate);
            if best.as_ref().map_or(true, |(s, _)| size < *s) {
                best = Some((size, candidate));
            }
            if target == 0 || size <= target {
                break;
            }
        }
        let result = match best {
            Some((_, path)) => native::move_file(&path, &out),
            None => Err("Ghostscript produced no output".into()),
        };
        let _ = std::fs::remove_dir_all(&temp);
        result
    }))
}


