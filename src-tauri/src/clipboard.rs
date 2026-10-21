//! "Paste to convert": turns whatever is on the clipboard into files Tangelo can work on.
//! Files copied in Explorer are used as they are; a copied image (browser "Copy image", screenshot,
//! Snipping Tool…) is saved as a PNG in Pictures\Tangelo so that it can go through the usual options.

use crate::i18n;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use windows_sys::Win32::Foundation::SYSTEMTIME;
use windows_sys::Win32::System::SystemInformation::GetLocalTime;

/// Paths for what is on the clipboard (files first, then an image).
pub fn read(app: &AppHandle) -> Result<Vec<String>, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|_| i18n::get().clipboard_unreadable.to_string())?;

    if let Ok(files) = clipboard.get().file_list() {
        let existing: Vec<String> = files.iter().filter(|p| p.exists()).map(|p| p.display().to_string()).collect();
        if !existing.is_empty() {
            return Ok(existing);
        }
    }

    let image = clipboard.get_image().map_err(|_| i18n::get().clipboard_empty.to_string())?;
    let dir = save_dir(app)?;
    let path = unique_path(&dir, &stamp());
    write_png(&path, image.width, image.height, &image.bytes)?;
    Ok(vec![path.display().to_string()])
}

/// Reads the clipboard, then hands the files to the main window.
pub fn paste_into_window(app: &AppHandle) -> Result<usize, String> {
    let paths = read(app)?;
    let n = paths.len();
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
    let _ = app.emit_to("main", "files-added", paths);
    Ok(n)
}

fn save_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .picture_dir()
        .or_else(|_| app.path().download_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("Tangelo");
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(dir)
}

fn stamp() -> String {
    let mut t = SYSTEMTIME { wYear: 0, wMonth: 0, wDayOfWeek: 0, wDay: 0, wHour: 0, wMinute: 0, wSecond: 0, wMilliseconds: 0 };
    unsafe { GetLocalTime(&mut t) };
    format!("clipboard-{:04}{:02}{:02}-{:02}{:02}{:02}", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond)
}

fn unique_path(dir: &Path, stem: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.png"));
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{stem}-{n}.png")))
        .find(|p| !p.exists())
        .expect("unbounded range")
}

/// Encodes straight RGBA pixels as a PNG.
fn write_png(path: &Path, width: usize, height: usize, rgba: &[u8]) -> Result<(), String> {
    let mut pixels = rgba.to_vec();
    // Some sources (plain 24-bit bitmaps) arrive with every alpha byte at 0, which would save an invisible image.
    if pixels.chunks_exact(4).all(|p| p[3] == 0) {
        pixels.chunks_exact_mut(4).for_each(|p| p[3] = 255);
    }
    let file = std::fs::File::create(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut encoder = png::Encoder::new(std::io::BufWriter::new(file), width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&pixels).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_roundtrip_and_alpha_fix() {
        let dir = std::env::temp_dir().join("tangelo-clip-test");
        let _ = std::fs::create_dir_all(&dir);
        let path = unique_path(&dir, "t");
        // 2x1 image, both alpha bytes 0 -> must come out opaque
        write_png(&path, 2, 1, &[10, 20, 30, 0, 40, 50, 60, 0]).unwrap();
        let decoder = png::Decoder::new(std::fs::File::open(&path).unwrap());
        let mut reader = decoder.read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!((info.width, info.height), (2, 1));
        assert_eq!(&buf[..8], &[10, 20, 30, 255, 40, 50, 60, 255]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn names_do_not_collide() {
        let dir = std::env::temp_dir().join("tangelo-clip-names");
        let _ = std::fs::create_dir_all(&dir);
        let a = unique_path(&dir, "x");
        std::fs::write(&a, b"1").unwrap();
        let b = unique_path(&dir, "x");
        assert_ne!(a, b);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
