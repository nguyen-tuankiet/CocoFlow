//! Tiny persisted settings: %LOCALAPPDATA%\Tangelo\settings.json

use crate::wheel;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::Ordering;

#[derive(Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub wheel_enabled: bool,
    pub any_app: bool,
    /// "auto" (follow Windows), "en" or "vi".
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { wheel_enabled: true, any_app: true, language: "auto".into() }
    }
}

/// The language setting as chosen by the user ("auto" until they pick one).
static LANGUAGE: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

/// "vi" or "en": the chosen language, or the Windows display language when set to "auto".
pub fn effective_language() -> &'static str {
    let setting = LANGUAGE.lock().unwrap_or_else(|e| e.into_inner()).clone();
    match setting.as_str() {
        "vi" => "vi",
        "en" => "en",
        _ => system_language(),
    }
}

pub fn set_language(setting: &str) {
    *LANGUAGE.lock().unwrap_or_else(|e| e.into_inner()) = setting.to_string();
    crate::i18n::set(effective_language());
    save();
}

fn system_language() -> &'static str {
    use windows_sys::Win32::Globalization::GetUserDefaultLocaleName;
    let mut buf = [0u16; 85];
    let len = unsafe { GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
    let name = String::from_utf16_lossy(&buf[..len.max(1) as usize - 1]);
    if name.to_lowercase().starts_with("vi") { "vi" } else { "en" }
}

fn path() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Tangelo").join("settings.json"))
}

pub fn current() -> Settings {
    Settings {
        wheel_enabled: wheel::ENABLED.load(Ordering::SeqCst),
        any_app: wheel::ANY_APP.load(Ordering::SeqCst),
        language: LANGUAGE.lock().unwrap_or_else(|e| e.into_inner()).clone(),
    }
}

/// Read the file (if any) into the runtime flags.
pub fn load() {
    let Some(path) = path() else { return };
    let Ok(text) = std::fs::read_to_string(path) else { return };
    let Ok(settings) = serde_json::from_str::<Settings>(&text) else { return };
    wheel::ENABLED.store(settings.wheel_enabled, Ordering::SeqCst);
    wheel::ANY_APP.store(settings.any_app, Ordering::SeqCst);
    *LANGUAGE.lock().unwrap_or_else(|e| e.into_inner()) = settings.language;
}

pub fn save() {
    let Some(path) = path() else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string_pretty(&current()) {
        let _ = std::fs::write(path, text);
    }
}

