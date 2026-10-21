//! Quick file actions (copy path, reveal, copy/move…) that do not need a job queue entry.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn powershell(script: &str, paths: &[PathBuf]) -> Result<(), String> {
    // Paths travel through an environment variable so quoting never matters ('|' cannot appear in a path).
    let joined = paths.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join("|");
    let status = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("TG_PATHS", joined)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("PowerShell failed".into())
    }
}

fn copy_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(from, to).map(|_| ())
    }
}

fn destination(dir: &Path, source: &Path) -> PathBuf {
    let name = source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let (stem, ext) = match source.extension() {
        Some(e) if source.is_file() => (
            source.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
            e.to_string_lossy().into_owned(),
        ),
        _ => (name, String::new()),
    };
    crate::plan::unique(dir, &stem, &ext)
}

/// Runs an action and returns a short message to show the user.
pub fn run(app: &AppHandle, id: &str, paths: &[PathBuf]) -> Result<String, String> {
    let first = paths.first().ok_or("No files")?;
    let count = paths.len();
    let t = crate::i18n::get();
    match id {
        "open" => {
            Command::new("explorer.exe").arg(first).spawn().map_err(|e| e.to_string())?;
            Ok(t.opened.into())
        }
        "reveal" => {
            reveal(first)?;
            Ok(t.shown_in_folder.into())
        }
        "copy-path" => {
            powershell("Set-Clipboard -Value (($env:TG_PATHS -split '\\|') -join [Environment]::NewLine)", paths)?;
            Ok(if count == 1 { t.path_copied.into() } else { t.n_paths_copied(count) })
        }
        "copy-files" => {
            powershell("Set-Clipboard -LiteralPath ($env:TG_PATHS -split '\\|')", paths)?;
            Ok(if count == 1 { t.file_copied.into() } else { t.n_files_copied(count) })
        }
        "copy-to" | "move-to" => {
            let target = app
                .dialog()
                .file()
                .set_title(if id == "copy-to" { t.copy_to_title } else { t.move_to_title })
                .blocking_pick_folder()
                .ok_or("Cancelled")?
                .into_path()
                .map_err(|e| e.to_string())?;
            for source in paths {
                let dest = destination(&target, source);
                if id == "move-to" && std::fs::rename(source, &dest).is_ok() {
                    continue;
                }
                copy_recursive(source, &dest).map_err(|e| format!("{}: {e}", source.display()))?;
                if id == "move-to" {
                    let removed = if source.is_dir() { std::fs::remove_dir_all(source) } else { std::fs::remove_file(source) };
                    removed.map_err(|e| format!("Copied, but could not remove the original: {e}"))?;
                }
            }
            Ok(t.items_to(id == "copy-to", count, &target.display().to_string()))
        }
        _ => Err(format!("Unknown action {id}")),
    }
}

pub fn reveal(path: &Path) -> Result<(), String> {
    Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{}\"", path.display()))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

