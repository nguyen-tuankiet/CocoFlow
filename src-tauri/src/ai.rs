//! Offline AI tools: OCR (Tesseract), subtitles (whisper.cpp), background removal (ONNX Runtime),
//! upscaling (Real-ESRGAN) and an extractive summary. Everything runs on this PC.

use crate::catalog::{ext_of, Kind};
use crate::engines::Engines;
use crate::plan::{ffmpeg_cmd, os, parent_of, stem_of, unique, Cmd, Params};
use crate::{bgremove, goals, native, summarize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// Runs a tool as a step of the current job (pausable, cancellable) and returns its output on success.
fn run(program: &Path, args: Vec<OsString>, cwd: Option<&Path>, what: &str) -> Result<Output, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out = crate::jobs::run_tracked(&mut cmd)?;
    if out.status.success() {
        return Ok(out);
    }
    let text = format!("{}\n{}", String::from_utf8_lossy(&out.stderr), String::from_utf8_lossy(&out.stdout));
    let tail: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let tail = tail.iter().rev().take(3).rev().cloned().collect::<Vec<_>>().join("\n");
    Err(format!("{what} failed:\n{tail}"))
}

fn path_arg(p: &Path) -> OsString {
    p.as_os_str().to_owned()
}

pub fn plan(kind: Kind, id: &str, input: &Path, eng: &Engines, p: &Params) -> Result<Cmd, String> {
    let dir = parent_of(input);
    let stem = stem_of(input);
    let ai = &eng.ai;
    match (kind, id) {
        (Kind::Image, "ocr") if ai.ocr() => ocr_image(eng, input, &dir, &stem, false),
        (Kind::Image, "ocr-pdf") if ai.ocr() => ocr_image(eng, input, &dir, &stem, true),
        (Kind::Pdf, "ocr") if ai.ocr() => ocr_pdf(eng, input, &dir, &stem, false),
        (Kind::Pdf, "ocr-pdf") if ai.ocr() => ocr_pdf(eng, input, &dir, &stem, true),
        (Kind::Image, "rmbg") if ai.background() => remove_background(eng, input, &dir, &stem),
        (Kind::Image, "up2") if ai.upscale() => upscale(eng, input, &dir, &stem, 2),
        (Kind::Image, "up4") if ai.upscale() => upscale(eng, input, &dir, &stem, 4),
        (Kind::Video | Kind::Audio, "transcribe") if ai.transcribe() => transcribe(eng, input, &dir, &stem, p),
        (Kind::Video | Kind::Audio, "talk-summary") if ai.transcribe() => talk_summary(eng, input, &dir, &stem, p),
        (Kind::Pdf | Kind::Document, "summary") => summary(eng, kind, input, &dir, &stem),
        _ => Err("This AI tool is not available for this file (is the AI add-on installed?)".into()),
    }
}

// ------------------------------------------------------------------ OCR

fn tesseract(eng: &Engines, image: &Path, base: &Path, searchable: bool) -> Result<(), String> {
    let ai = &eng.ai;
    let (exe, data) = (ai.tesseract.as_ref().ok_or("Tesseract was not found")?, ai.tessdata.as_ref().ok_or("OCR data was not found")?);
    // Relative file names + the scratch folder as working directory keep non-ASCII profile paths away from Tesseract.
    let cwd = base.parent().unwrap_or(Path::new("."));
    let mut args: Vec<OsString> = vec![
        path_arg(image.strip_prefix(cwd).unwrap_or(image)),
        path_arg(base.strip_prefix(cwd).unwrap_or(base)),
        "-l".into(),
        ai.ocr_languages().into(),
        "--tessdata-dir".into(),
        path_arg(data),
        "--psm".into(),
        "3".into(),
    ];
    args.push(if searchable { "pdf" } else { "txt" }.into());
    run(exe, args, Some(cwd), "OCR").map(|_| ())
}

fn ocr_image(eng: &Engines, input: &Path, dir: &Path, stem: &str, searchable: bool) -> Result<Cmd, String> {
    let temp = native::temp_dir("ocr");
    let png = temp.join("page.png");
    let base = temp.join("out");
    // ffmpeg first: it understands every picture format and applies the EXIF rotation.
    let normalise = ffmpeg_cmd(eng, &[input], &["-frames:v", "1", "-update", "1"], png.clone())?;
    let ext = if searchable { "pdf" } else { "txt" };
    let output = unique(dir, &format!("{stem}_ocr"), ext);
    let (engines, out) = (eng.clone(), output.clone());
    let main = Cmd::native(output, move || {
        tesseract(&engines, &png, &base, searchable)?;
        native::move_file(&base.with_extension(ext), &out)
    });
    Ok(main.after(normalise, &[temp]))
}

/// Pages of a scanned PDF rendered at 300 DPI.
fn render_pages(eng: &Engines, pdf: &Path, folder: &Path) -> Result<Vec<PathBuf>, String> {
    let gs = eng.gs.as_ref().ok_or("Ghostscript was not found")?;
    let mut args = os(&["-dNOPAUSE", "-dBATCH", "-dSAFER", "-r300", "-sDEVICE=png16m"]);
    args.push(format!("-sOutputFile={}", folder.join("p_%04d.png").display()).into());
    args.push(pdf.into());
    run(gs, args, None, "Rendering the PDF")?;
    let mut pages: Vec<PathBuf> =
        std::fs::read_dir(folder).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).filter(|p| ext_of(p) == "png").collect();
    pages.sort();
    if pages.is_empty() {
        return Err("The PDF has no pages".into());
    }
    Ok(pages)
}

/// Text of every page, in order (pages separated by a form feed).
fn ocr_pages_text(eng: &Engines, pages: &[PathBuf]) -> Result<String, String> {
    let mut text = String::new();
    for (i, page) in pages.iter().enumerate() {
        let base = page.with_extension("");
        tesseract(eng, page, &base, false)?;
        if i > 0 {
            text.push('\u{c}');
        }
        text.push_str(&std::fs::read_to_string(base.with_extension("txt")).unwrap_or_default());
    }
    Ok(text)
}

fn ocr_pdf(eng: &Engines, input: &Path, dir: &Path, stem: &str, searchable: bool) -> Result<Cmd, String> {
    if eng.gs.is_none() {
        return Err("Ghostscript was not found".into());
    }
    let ext = if searchable { "pdf" } else { "txt" };
    let output = unique(dir, &format!("{stem}_ocr"), ext);
    let (engines, source, out) = (eng.clone(), input.to_path_buf(), output.clone());
    Ok(Cmd::native(output, move || {
        let temp = native::temp_dir("ocrpdf");
        let result = (|| {
            let pages = render_pages(&engines, &source, &temp)?;
            if !searchable {
                let text = ocr_pages_text(&engines, &pages)?;
                if text.chars().all(|c| c.is_whitespace()) {
                    return Err("No text was recognised in this document".to_string());
                }
                return std::fs::write(&out, text.replace('\u{c}', "\n\n")).map_err(|e| e.to_string());
            }
            // One searchable PDF per page, then joined into one file.
            let mut parts: Vec<PathBuf> = Vec::new();
            for page in &pages {
                let base = page.with_extension("");
                tesseract(&engines, page, &base, true)?;
                parts.push(base.with_extension("pdf"));
            }
            let gs = engines.gs.as_ref().ok_or("Ghostscript was not found")?;
            let mut args = os(&["-sDEVICE=pdfwrite", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-dQUIET"]);
            args.push(format!("-sOutputFile={}", out.display()).into());
            args.extend(parts.iter().map(|p| path_arg(p)));
            run(gs, args, None, "Joining the pages").map(|_| ())
        })();
        let _ = std::fs::remove_dir_all(&temp);
        result
    }))
}

// ------------------------------------------------------------------ summary

fn read_text(eng: &Engines, kind: Kind, input: &Path) -> Result<String, String> {
    match kind {
        Kind::Document if matches!(ext_of(input).as_str(), "txt" | "md" | "markdown") => {
            let bytes = std::fs::read(input).map_err(|e| e.to_string())?;
            Ok(String::from_utf8_lossy(&bytes).into_owned())
        }
        Kind::Document => {
            let pandoc = eng.pandoc.as_ref().ok_or("Pandoc was not found")?;
            let out = run(pandoc, vec![path_arg(input), "-t".into(), "plain".into(), "--wrap=none".into()], None, "Reading the document")?;
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        }
        Kind::Pdf => {
            let gs = eng.gs.as_ref().ok_or("Ghostscript was not found")?;
            let temp = native::temp_dir("sum");
            let txt = temp.join("text.txt");
            let mut args = os(&["-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=txtwrite"]);
            args.push(format!("-sOutputFile={}", txt.display()).into());
            args.push(input.into());
            let result = (|| {
                run(gs, args, None, "Reading the PDF")?;
                let mut text = std::fs::read_to_string(&txt).unwrap_or_default();
                if text.chars().filter(|c| c.is_alphanumeric()).count() < 80 {
                    // scanned PDF: no text layer, read it with OCR
                    if !eng.ai.ocr() {
                        return Err("This PDF has no text layer; the AI add-on (OCR) is needed to read it".to_string());
                    }
                    let pages = render_pages(eng, input, &temp)?;
                    text = ocr_pages_text(eng, &pages)?;
                }
                Ok(text)
            })();
            let _ = std::fs::remove_dir_all(&temp);
            result
        }
        _ => Err("Cannot summarise this file".into()),
    }
}

fn summary(eng: &Engines, kind: Kind, input: &Path, dir: &Path, stem: &str) -> Result<Cmd, String> {
    let output = unique(dir, &format!("{stem}_summary"), "txt");
    let (engines, source, out) = (eng.clone(), input.to_path_buf(), output.clone());
    Ok(Cmd::native(output, move || {
        let text = read_text(&engines, kind, &source)?;
        let result = summarize::summarize(&text, None);
        if result.trim().is_empty() {
            return Err("There is no text to summarise".into());
        }
        std::fs::write(&out, result).map_err(|e| e.to_string())
    }))
}

// ------------------------------------------------------------------ subtitles

fn transcribe(eng: &Engines, input: &Path, dir: &Path, stem: &str, p: &Params) -> Result<Cmd, String> {
    let ai = &eng.ai;
    let ffmpeg = eng.ffmpeg.clone().ok_or("FFmpeg was not found")?;
    if !goals::has_audio(&ffmpeg, input) {
        return Err("This file has no audio track".into());
    }
    let whisper = ai.whisper.clone().ok_or("Whisper was not found")?;
    let model = ai.whisper_model.clone().ok_or("The speech model was not found")?;

    let language = p.get("language").map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).unwrap_or_else(|| "auto".into());
    if !language.chars().all(|c| c.is_ascii_alphabetic()) || language.len() > 8 {
        return Err("Invalid language".into());
    }
    let wanted: Vec<&str> = p
        .get("formats")
        .map(String::as_str)
        .unwrap_or("srt")
        .split(',')
        .map(str::trim)
        .filter(|f| matches!(*f, "srt" | "vtt" | "txt"))
        .collect();
    if wanted.is_empty() {
        return Err("Choose at least one output format".into());
    }
    let translate = matches!(p.get("translate").map(String::as_str), Some("1" | "true"));

    let temp = native::temp_dir("whisper");
    let wav = temp.join("audio.wav");
    let base = temp.join("out");
    let to_wav = ffmpeg_cmd(eng, &[input], &["-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"], wav.clone())?;

    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(2, 12).to_string();
    let mut args: Vec<OsString> = vec![
        "-m".into(), path_arg(&model), "-f".into(), path_arg(&wav), "-l".into(), language.into(),
        "-t".into(), threads.into(), "-of".into(), path_arg(&base), "-pp".into(),
    ];
    for f in &wanted {
        args.push(format!("-o{f}").into());
    }
    if translate {
        args.push("-tr".into());
    }
    let first = wanted[0].to_string();
    let output = unique(dir, stem, &first);
    let run_whisper = Cmd::run(whisper, args, output.clone());

    // move the results next to the original under free names
    let (dir, stem, wanted_owned, out0) = (dir.to_path_buf(), stem.to_string(), wanted.iter().map(|s| s.to_string()).collect::<Vec<_>>(), output.clone());
    let finish = Cmd::native(output, move || {
        for (i, f) in wanted_owned.iter().enumerate() {
            let produced = base.with_extension(f);
            if !produced.is_file() {
                return Err(format!("Whisper produced no .{f} file"));
            }
            let target = if i == 0 { out0.clone() } else { unique(&dir, &stem, f) };
            native::move_file(&produced, &target)?;
        }
        Ok(())
    });
    Ok(finish.after(run_whisper, &[]).after(to_wav, &[temp]))
}

/// Speech to text with whisper, then the extractive summary of the transcript.
fn talk_summary(eng: &Engines, input: &Path, dir: &Path, stem: &str, p: &Params) -> Result<Cmd, String> {
    let mut params = p.clone();
    params.insert("formats".into(), "txt".into());
    params.entry("language".into()).or_insert_with(|| "auto".into());
    // reuse the subtitle pipeline, writing only the plain transcript
    let transcript = transcribe(eng, input, dir, &format!("{stem}_talk"), &params)?;
    let transcript_path = transcript.output.clone();
    let output = unique(dir, &format!("{stem}_summary"), "txt");
    let out = output.clone();
    let finish = Cmd::native(output, move || {
        let text = std::fs::read_to_string(&transcript_path).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&transcript_path);
        let result = summarize::summarize(&text, None);
        if result.trim().is_empty() {
            return Err("There is no text to summarise".into());
        }
        std::fs::write(&out, result).map_err(|e| e.to_string())
    });
    Ok(finish.after(transcript, &[]))
}

// ------------------------------------------------------------------ background removal

fn remove_background(eng: &Engines, input: &Path, dir: &Path, stem: &str) -> Result<Cmd, String> {
    let ai = &eng.ai;
    let (dll, model) = (ai.onnx_dll.clone().ok_or("ONNX Runtime was not found")?, ai.bg_model.clone().ok_or("The background model was not found")?);
    let temp = native::temp_dir("rmbg");
    let (norm, raw, pgm) = (temp.join("norm.png"), temp.join("in.rgb"), temp.join("mask.pgm"));
    let size = bgremove::SIZE;
    // 1. a clean copy (EXIF rotation applied), 2. the 320x320 frame the model reads, 3. the model, 4. mask + picture
    let normalise = ffmpeg_cmd(eng, &[input], &["-frames:v", "1", "-update", "1"], norm.clone())?;
    let scale = format!("scale={size}:{size}:flags=bicubic,format=rgb24");
    let frame = ffmpeg_cmd(eng, &[norm.as_path()], &["-frames:v", "1", "-vf", &scale, "-f", "rawvideo"], raw.clone())?;
    let (raw2, pgm2) = (raw.clone(), pgm.clone());
    let infer = Cmd::native(pgm.clone(), move || {
        let rgb = std::fs::read(&raw2).map_err(|e| e.to_string())?;
        let mask = bgremove::mask(&dll, &model, &rgb)?;
        bgremove::write_pgm(&pgm2, &mask)
    });
    let output = unique(dir, &format!("{stem}_nobg"), "png");
    let graph = "[1:v][0:v]scale2ref=flags=bicubic[m][i];[i]format=rgba[c];[c][m]alphamerge";
    let merge = ffmpeg_cmd(eng, &[norm.as_path(), pgm.as_path()], &["-filter_complex", graph, "-frames:v", "1"], output)?;
    Ok(merge.after(infer, &[]).after(frame, &[]).after(normalise, &[temp]))
}

// ------------------------------------------------------------------ upscale

fn upscale(eng: &Engines, input: &Path, dir: &Path, stem: &str, factor: u32) -> Result<Cmd, String> {
    let ai = &eng.ai;
    let (exe, models) = (ai.esrgan.clone().ok_or("Real-ESRGAN was not found")?, ai.esrgan_models.clone().ok_or("The upscaling models were not found")?);
    let temp = native::temp_dir("esrgan");
    let (norm, big) = (temp.join("in.png"), temp.join("x4.png"));
    let normalise = ffmpeg_cmd(eng, &[input], &["-frames:v", "1", "-update", "1"], norm.clone())?;
    let args: Vec<OsString> = vec![
        "-i".into(), path_arg(&norm), "-o".into(), path_arg(&big), "-n".into(), "realesrgan-x4plus".into(),
        "-s".into(), "4".into(), "-m".into(), path_arg(&models), "-f".into(), "png".into(),
    ];
    let upscaled = Cmd::run(exe, args, big.clone());
    let output = unique(dir, &format!("{stem}_x{factor}"), "png");
    let last = if factor == 4 {
        let out = output.clone();
        Cmd::native(output, move || native::move_file(&big, &out))
    } else {
        // the model is 4x; halve it for x2
        ffmpeg_cmd(eng, &[big.as_path()], &["-vf", "scale=iw/2:ih/2:flags=lanczos"], output)?
    };
    Ok(last.after(upscaled, &[]).after(normalise, &[temp]))
}

