//! Small in-process helpers used as steps of a conversion.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};

/// Subtitles to plain text: drop indexes, timestamps, cue settings and markup.
pub fn subtitle_to_text(input: &Path, output: &Path) -> Result<(), String> {
    let bytes = std::fs::read(input).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes);
    let ext = crate::catalog::ext_of(input);
    let mut lines: Vec<String> = Vec::new();
    for raw in text.trim_start_matches('\u{feff}').lines() {
        let line = raw.trim();
        let skip = line.is_empty()
            || line.contains("-->")
            || line == "WEBVTT"
            || line.starts_with("NOTE")
            || line.starts_with("STYLE")
            || line.chars().all(|c| c.is_ascii_digit());
        if ext == "ass" || ext == "ssa" {
            // "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Text"
            if let Some(rest) = line.strip_prefix("Dialogue:") {
                let fields: Vec<&str> = rest.splitn(10, ',').collect();
                if let Some(text) = fields.get(9) {
                    lines.push(strip_markup(&text.replace("\\N", " ").replace("\\n", " ")));
                }
            }
            continue;
        }
        if !skip {
            lines.push(strip_markup(line));
        }
    }
    std::fs::write(output, lines.join("\n") + "\n").map_err(|e| e.to_string())
}

/// Removes `<i>…</i>` and `{\an8}` style tags.
fn strip_markup(line: &str) -> String {
    let mut out = String::new();
    let mut depth_html = false;
    let mut depth_brace = false;
    for c in line.chars() {
        match c {
            '<' => depth_html = true,
            '>' if depth_html => depth_html = false,
            '{' => depth_brace = true,
            '}' if depth_brace => depth_brace = false,
            _ if depth_html || depth_brace => {}
            _ => out.push(c),
        }
    }
    out.trim().to_string()
}

/// Ghostscript's raw text (hard-wrapped lines, form feeds between pages) as simple Markdown paragraphs.
pub fn pdf_text_to_markdown(input: &Path, output: &Path) -> Result<(), String> {
    let bytes = std::fs::read(input).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes);
    let mut paragraphs: Vec<String> = Vec::new();
    let mut current = String::new();
    let flush = |current: &mut String, paragraphs: &mut Vec<String>| {
        if !current.is_empty() {
            paragraphs.push(std::mem::take(current));
        }
    };
    for raw in text.replace('\u{feff}', "").split('\n') {
        for (index, piece) in raw.split('\u{c}').enumerate() {
            if index > 0 {
                flush(&mut current, &mut paragraphs); // page break
            }
            let line = piece.trim();
            if line.is_empty() {
                flush(&mut current, &mut paragraphs);
            } else {
                if !current.is_empty() {
                    current.push(' ');
                }
                current.push_str(line);
            }
        }
    }
    flush(&mut current, &mut paragraphs);
    if paragraphs.is_empty() {
        return Err(NO_TEXT.into());
    }
    std::fs::write(output, paragraphs.join("\n\n") + "\n").map_err(|e| e.to_string())
}

pub const NO_TEXT: &str = "No text found in this PDF (it may be scanned images)";

/// Copies extracted text, refusing an empty result.
pub fn copy_text(input: &Path, output: &Path) -> Result<(), String> {
    let text = std::fs::read(input).map_err(|e| e.to_string())?;
    if String::from_utf8_lossy(&text).chars().all(|c| c.is_whitespace() || c == '\u{c}') {
        return Err(NO_TEXT.into());
    }
    std::fs::write(output, text).map_err(|e| e.to_string())
}

/// `file:///E:/My%20Docs/a.html` for a local path.
pub fn file_url(path: &Path) -> String {
    let text = path.display().to_string().replace('\\', "/");
    let mut out = String::from("file:///");
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' | b':' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Move a file; falls back to copy+delete across volumes.
pub fn move_file(from: &Path, to: &Path) -> Result<(), String> {
    if std::fs::rename(from, to).is_ok() {
        return Ok(());
    }
    std::fs::copy(from, to).map_err(|e| format!("Cannot write {}: {e}", to.display()))?;
    let _ = std::fs::remove_file(from);
    Ok(())
}

/// Some tools (Tesseract, whisper.cpp, Real-ESRGAN) read their arguments with the legacy code page and cannot
/// open paths such as "E:\Dự án". True when a path is safe for them.
pub fn is_ascii_path(path: &Path) -> bool {
    path.to_str().is_some_and(|s| s.is_ascii())
}

fn program_data() -> Option<PathBuf> {
    std::env::var_os("ProgramData").map(PathBuf::from).filter(|p| is_ascii_path(p))
}

/// An ASCII-named path that leads to `dir`: the folder itself when its path is plain ASCII, otherwise a
/// directory junction under %ProgramData%\Tangelo\links (junctions need no administrator rights).
pub fn ascii_alias(dir: &Path) -> PathBuf {
    if is_ascii_path(dir) {
        return dir.to_path_buf();
    }
    let Some(base) = program_data() else { return dir.to_path_buf() };
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    dir.hash(&mut h);
    let links = base.join("Tangelo").join("links");
    let link = links.join(format!("{:016x}", h.finish()));
    if std::fs::read_dir(&link).is_ok() {
        return link;
    }
    let _ = std::fs::create_dir_all(&links);
    let made = std::process::Command::new("cmd")
        .arg("/C")
        .arg("mklink")
        .arg("/J")
        .arg(&link)
        .arg(dir)
        .creation_flags(0x0800_0000)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if made && std::fs::read_dir(&link).is_ok() {
        link
    } else {
        dir.to_path_buf()
    }
}

/// Folder for scratch files: the system temp dir, or %ProgramData%\Tangelo\tmp when the user profile
/// path is not ASCII (a profile named "Nguyễn Văn A" would otherwise break the AI tools).
fn temp_base() -> PathBuf {
    let system = std::env::temp_dir();
    if is_ascii_path(&system) {
        return system;
    }
    match program_data() {
        Some(base) => {
            let dir = base.join("Tangelo").join("tmp");
            if std::fs::create_dir_all(&dir).is_ok() { dir } else { system }
        }
        None => system,
    }
}

/// Per-job scratch folder next to the system temp dir.
pub fn temp_dir(tag: &str) -> PathBuf {
    let dir = temp_base().join("Tangelo").join(format!("{tag}-{}", std::process::id())).join(format!(
        "{}",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
    ));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn srt_to_text() {
        let dir = temp_dir("t");
        let input = dir.join("a.srt");
        std::fs::write(&input, "1\n00:00:00,000 --> 00:00:02,000\n<i>Hello</i>\n\n2\n00:00:02,000 --> 00:00:03,000\nWorld\n").unwrap();
        let out = dir.join("a.txt");
        subtitle_to_text(&input, &out).unwrap();
        assert_eq!(std::fs::read_to_string(out).unwrap(), "Hello\nWorld\n");
    }

    #[test]
    fn non_ascii_folders_get_an_ascii_alias() {
        let base = std::env::temp_dir().join("tangelo-tests").join("alias");
        let real = base.join("Thư mục tiếng Việt");
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("a.txt"), "xin chào").unwrap();
        let alias = ascii_alias(&real);
        assert!(is_ascii_path(&alias), "{alias:?} is not ASCII");
        assert_eq!(std::fs::read_to_string(alias.join("a.txt")).unwrap(), "xin chào");
        assert_eq!(ascii_alias(Path::new(r"C:\plain\path")), PathBuf::from(r"C:\plain\path"));
    }

    #[test]
    fn url_is_encoded() {
        assert_eq!(file_url(Path::new(r"E:\Dự án\a b.html")), "file:///E:/D%E1%BB%B1%20%C3%A1n/a%20b.html");
    }
}



