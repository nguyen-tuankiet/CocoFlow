//! Archives through 7-Zip. (Windows' own tar.exe cannot open non-ASCII paths such as "E:\Dự án".)

use crate::native;
use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

fn run7z(seven: &Path, args: &[OsString], cwd: Option<&Path>) -> Result<(), String> {
    let mut cmd = Command::new(seven);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out = crate::jobs::run_tracked(&mut cmd)?;
    if out.status.success() {
        return Ok(());
    }
    // 7-Zip reports problems on stdout.
    let text = format!("{}\n{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    let detail: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let tail = detail.iter().rev().take(4).rev().cloned().collect::<Vec<_>>().join("\n");
    Err(format!("7-Zip failed:\n{tail}"))
}
fn args(items: &[&str]) -> Vec<OsString> {
    items.iter().map(OsString::from).collect()
}

fn with_prefix(prefix: &str, path: &Path) -> OsString {
    let mut s = OsString::from(prefix);
    s.push(path);
    s
}

/// Zip files and folders that live in `parent` (stored under their own names).
pub fn zip_items(seven: &Path, parent: &Path, names: &[OsString], out: &Path) -> Result<(), String> {
    let mut a = args(&["a", "-tzip", "-mcu=on", "-y"]);
    a.push(out.into());
    a.extend(names.iter().cloned());
    run7z(seven, &a, Some(parent))
}

/// Extract into `dest`; a `.tar.gz` (a tar inside a gzip) is unpacked fully.
pub fn extract(seven: &Path, archive: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let mut a = args(&["x", "-y"]);
    a.push(with_prefix("-o", dest));
    a.push(archive.into());
    run7z(seven, &a, None)?;

    let entries: Vec<_> = std::fs::read_dir(dest).map_err(|e| e.to_string())?.flatten().collect();
    if let [only] = entries.as_slice() {
        let path = only.path();
        if path.is_file() && crate::catalog::ext_of(&path) == "tar" {
            let mut inner = args(&["x", "-y"]);
            inner.push(with_prefix("-o", dest));
            inner.push((&path).into());
            run7z(seven, &inner, None)?;
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

/// Convert between zip / tar / tar.gz by unpacking to a scratch folder and packing again.
pub fn convert(seven: &Path, input: &Path, target: &str, out: &Path) -> Result<(), String> {
    let scratch = native::temp_dir("arc");
    let content = scratch.join("content");
    let result = (|| {
        extract(seven, input, &content)?;
        let mut a = match target {
            "zip" => args(&["a", "-tzip", "-mcu=on", "-y"]),
            "tar" => args(&["a", "-ttar", "-y"]),
            "gzip" => args(&["a", "-ttar", "-y"]),
            other => return Err(format!("Cannot convert an archive to {other}")),
        };
        if target == "gzip" {
            // tar first, then gzip the tar
            let tar = scratch.join("bundle.tar");
            a.push((&tar).into());
            a.push("*".into());
            run7z(seven, &a, Some(&content))?;
            let mut g = args(&["a", "-tgzip", "-y"]);
            g.push(out.into());
            g.push((&tar).into());
            return run7z(seven, &g, None);
        }
        a.push(out.into());
        a.push("*".into());
        run7z(seven, &a, Some(&content))
    })();
    let _ = std::fs::remove_dir_all(&scratch);
    result
}

