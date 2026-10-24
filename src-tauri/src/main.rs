#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod actions;
mod ai;
mod bgremove;
mod archive;
mod catalog;
mod clipboard;
mod engines;
mod goals;
mod i18n;
mod jobs;
mod native;
mod plan;
mod preview;
mod proc;
mod sheet;
mod settings;
mod summarize;
mod wheel;

use catalog::{common_kind, kind_of, AllOptions, Kind};
use engines::{EngineInfo, Engines};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WindowEvent};

struct AppState {
    engines: Arc<Engines>,
}

fn to_paths(paths: &[String]) -> Vec<PathBuf> {
    paths.iter().map(PathBuf::from).collect()
}

fn file_name(path: &std::path::Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.display().to_string())
}

#[tauri::command]
fn get_all_options(paths: Vec<String>, state: State<AppState>) -> AllOptions {
    catalog::options_for(&to_paths(&paths), &state.engines)
}

#[tauri::command]
fn engine_status(state: State<AppState>) -> Vec<EngineInfo> {
    state.engines.info()
}

#[tauri::command]
fn describe_paths(paths: Vec<String>) -> BTreeMap<String, String> {
    paths.iter().map(|p| (p.clone(), kind_of(std::path::Path::new(p)).name().to_string())).collect()
}

#[derive(serde::Serialize, Clone)]
struct EditorRequest {
    paths: Vec<String>,
    kind: String,
    tool: String,
}

/// Tools that need the options window (or parameters) instead of running right away.
fn needs_params(id: &str) -> bool {
    matches!(id, "trim" | "crop" | "split" | "resize" | "scan")
}

#[tauri::command]
fn run_option(
    app: AppHandle,
    paths: Vec<String>,
    option_id: String,
    params: Option<plan::Params>,
    state: State<AppState>,
) -> Result<(), String> {
    let strings: Vec<String> = paths.clone();
    let paths = to_paths(&paths);
    if paths.is_empty() {
        return Ok(());
    }
    let (family, id) = option_id.split_once(':').ok_or("Bad option id")?;
    let engines = state.engines.clone();
    let kind = common_kind(&paths);
    let t = i18n::get();

    match family {
        "edit" => {
            let request = EditorRequest { paths: strings, kind: kind.name().to_string(), tool: id.to_string() };
            if id == "autoscan" {
                // Finds the page and straightens it without asking anything: the (hidden) main window does the
                // analysis and then queues the job, so no window needs to appear.
                let _ = app.emit_to("main", "auto-scan", request);
            } else {
                // Trim, crop, split and resize are set up in the main window, with a preview.
                show_main(&app);
                let _ = app.emit_to("main", "open-editor", request);
            }
        }
        "action" => {
            let id = id.to_string();
            std::thread::spawn(move || match actions::run(&app, &id, &paths) {
                Ok(message) => jobs::notify(&app, i18n::get().app, &message),
                Err(err) if err == "Cancelled" => {}
                Err(err) => jobs::notify(&app, i18n::get().action_failed, &err),
            });
        }
        "merge" => {
            let title = t.merge_title(paths.len());
            let cmd = plan::merge(id, &paths, &engines);
            jobs::submit_cmd(&app, title, cmd);
        }
        "ai" => {
            let params = params.unwrap_or_default();
            for path in paths {
                let item_kind = if kind == Kind::Other { kind_of(&path) } else { kind };
                let title = format!("{} · {}", file_name(&path), t.ai_name(id));
                jobs::submit_cmd(&app, title, ai::plan(item_kind, id, &path, &engines, &params));
            }
        }
        "share" => {
            for path in paths {
                let item_kind = if kind == Kind::Other { kind_of(&path) } else { kind };
                let title = format!("{} → {}", file_name(&path), goals::label_of(id));
                jobs::submit_cmd(&app, title, goals::plan(item_kind, id, &path, &engines));
            }
        }
        "tool" if id == "zip" => {
            // One archive per folder, so that every entry can be stored relative to its parent.
            let mut groups: BTreeMap<PathBuf, Vec<PathBuf>> = BTreeMap::new();
            for p in paths {
                groups.entry(p.parent().map(PathBuf::from).unwrap_or_default()).or_default().push(p);
            }
            for items in groups.into_values() {
                let what = if items.len() == 1 { file_name(&items[0]) } else { t.n_items(items.len()) };
                jobs::submit_cmd(&app, t.zip_title(&what), plan::zip(&items, &engines));
            }
        }
        "convert" | "tool" => {
            let params = params.unwrap_or_default();
            for path in paths {
                let item_kind = if kind == Kind::Other { kind_of(&path) } else { kind };
                let (title, cmd) = if family == "convert" {
                    (format!("{} → {}", file_name(&path), id.to_uppercase()), plan::convert(item_kind, id, &path, &engines))
                } else if needs_params(id) {
                    (
                        format!("{} · {}", file_name(&path), t.tool_name(id)),
                        plan::tool_params(item_kind, id, &path, &engines, &params),
                    )
                } else {
                    (format!("{} · {}", file_name(&path), t.tool_name(id)), plan::tool(item_kind, id, &path, &engines))
                };
                jobs::submit_cmd(&app, title, cmd);
            }
        }
        _ => return Err(format!("Unknown option {option_id}")),
    }
    Ok(())
}

// ---- job control

#[tauri::command]
fn cancel_job(app: AppHandle, id: u64) {
    jobs::cancel(&app, id);
}

#[tauri::command]
fn pause_job(app: AppHandle, id: u64) {
    jobs::pause(&app, id);
}

#[tauri::command]
fn resume_job(app: AppHandle, id: u64) {
    jobs::resume(&app, id);
}

#[tauri::command]
fn cancel_all_jobs(app: AppHandle) {
    jobs::cancel_all(&app);
}

// ---- data for the editors

#[tauri::command]
fn media_info(path: String, state: State<AppState>) -> Result<preview::MediaInfo, String> {
    preview::probe(&state.engines, std::path::Path::new(&path))
}

#[tauri::command]
async fn preview_file(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let engines = state.engines.clone();
    tauri::async_runtime::spawn_blocking(move || {
        preview::preview_path(&engines, std::path::Path::new(&path)).map(|p| p.display().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pdf_info(path: String, state: State<'_, AppState>) -> Result<preview::PdfInfo, String> {
    let engines = state.engines.clone();
    tauri::async_runtime::spawn_blocking(move || preview::pdf_info(&engines, std::path::Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

// ---- language

#[derive(serde::Serialize)]
struct LanguageInfo {
    setting: String,
    effective: &'static str,
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    let _ = if enabled { launcher.enable() } else { launcher.disable() };
    launcher.is_enabled().unwrap_or(false)
}

#[tauri::command]
fn get_language() -> LanguageInfo {
    let setting = settings::current().language;
    LanguageInfo { setting: if setting.is_empty() { "auto".into() } else { setting }, effective: settings::effective_language() }
}

#[tauri::command]
fn set_language(app: AppHandle, setting: String) -> LanguageInfo {
    settings::set_language(&setting);
    let info = get_language();
    let _ = app.emit("language-changed", info.effective);
    info
}
#[tauri::command]
fn reveal(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if path.is_dir() {
        std::process::Command::new("explorer.exe").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
    } else {
        actions::reveal(&path)
    }
}

const RELEASES_URL: &str = "https://github.com/nguyen-tuankiet/CocoFlow/releases";

/// Opens a Cocoflow release page in the default browser. Only that repository's releases are allowed,
/// so the web UI cannot make the app open an arbitrary address.
#[tauri::command]
fn open_release_page(url: String) -> Result<(), String> {
    if !url.starts_with(RELEASES_URL) || url.chars().any(|c| c.is_whitespace() || c == '"' || c == '&' || c == '^') {
        return Err("address not allowed".into());
    }
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Percent-decoding of a header value (the web UI sends the photo's path with encodeURIComponent).
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).ok();
            if let Some(v) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Saves a page straightened by the web UI (the request body is the encoded image) next to the photo it came from,
/// as `<name>_scan.jpg|png`, through the job queue so it shows in Activity and ends with a notification.
#[tauri::command]
fn save_scan(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the image bytes".into());
    };
    let header = |key: &str| request.headers().get(key).and_then(|v| v.to_str().ok()).map(percent_decode);
    let source = PathBuf::from(header("x-source").ok_or("Missing source")?);
    // only next to a photo that exists, with a fixed name: the web UI cannot write anywhere else
    if !source.is_file() {
        return Err("The photo was not found".into());
    }
    let ext = if header("x-ext").as_deref() == Some("png") { "png" } else { "jpg" };
    let dir = source.parent().map(PathBuf::from).unwrap_or_default();
    let stem = source.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "scan".into());
    let output = plan::unique(&dir, &format!("{stem}_scan"), ext);
    let data = bytes.clone();
    let target = output.clone();
    let title = format!("{} · {}", file_name(&source), i18n::get().tool_name("scan"));
    jobs::submit_cmd(&app, title, Ok(plan::Cmd::native(output, move || std::fs::write(&target, &data).map_err(|e| e.to_string()))));
    Ok(())
}

/// A Windows notification with text made by the web UI (already in the user's language).
#[tauri::command]
fn notify_text(app: AppHandle, title: String, body: String) {
    jobs::notify(&app, &title, &body);
}

#[tauri::command]
fn notify_update(app: AppHandle, version: String) {
    let s = i18n::get();
    jobs::notify(&app, &s.update_title(&version), s.update_body());
}

#[tauri::command]
fn js_log(message: String) {
    wheel::log(&format!("js: {message}"));
}

#[tauri::command]
fn hide_wheel(app: AppHandle) {
    wheel::hide(&app);
}

#[tauri::command]
fn set_detection(enabled: bool, app: AppHandle) {
    wheel::ENABLED.store(enabled, Ordering::SeqCst);
    if !enabled {
        wheel::hide(&app);
    }
    settings::save();
}

#[tauri::command]
fn set_any_app(enabled: bool) {
    wheel::ANY_APP.store(enabled, Ordering::SeqCst);
    settings::save();
}

#[tauri::command]
fn get_settings() -> settings::Settings {
    settings::current()
}

/// Ctrl+V / the Paste button: the files arrive through the `files-added` event.
#[tauri::command]
fn paste_clipboard(app: AppHandle) -> Result<usize, String> {
    clipboard::paste_into_window(&app)
}

/// Tray item and global hotkey have no window to show an error in, so they notify instead.
fn paste_from_anywhere(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(err) = clipboard::paste_into_window(&app) {
            jobs::notify(&app, i18n::get().action_failed, &err);
        }
    });
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let t = i18n::get();
    let open = MenuItem::with_id(app, "open", t.tray_open, true, None::<&str>)?;
    let paste = MenuItem::with_id(app, "paste", t.tray_paste, true, None::<&str>)?;
    let detect = CheckMenuItem::with_id(
        app,
        "detect",
        t.tray_wheel,
        true,
        wheel::ENABLED.load(Ordering::SeqCst),
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", t.tray_quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &paste, &detect, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut builder = TrayIconBuilder::with_id("tray")
        .tooltip("Cocoflow")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "paste" => paste_from_anywhere(app),
            "detect" => {
                let enabled = detect.is_checked().unwrap_or(true);
                set_detection(enabled, app.clone());
            }
            "quit" => {
                jobs::cancel_all(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn main() {
    use tauri_plugin_global_shortcut::{Builder as ShortcutBuilder, Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
    let paste_key = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyV);

    tauri::Builder::default()
        .plugin(
            ShortcutBuilder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &paste_key && event.state() == ShortcutState::Pressed {
                        paste_from_anywhere(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_notification::init())
        .manage(AppState { engines: Arc::new(Engines::detect()) })
        .invoke_handler(tauri::generate_handler![
            get_all_options,
            engine_status,
            describe_paths,
            run_option,
            cancel_job,
            pause_job,
            resume_job,
            cancel_all_jobs,
            media_info,
            preview_file,
            pdf_info,
            get_language,
            set_language,
            get_autostart,
            set_autostart,
            reveal,
            open_release_page,
            notify_update,
            notify_text,
            save_scan,
            hide_wheel,
            js_log,
            set_detection,
            set_any_app,
            get_settings,
            paste_clipboard,
        ])
        .on_window_event(|window, event| match (window.label(), event) {
            ("main", WindowEvent::CloseRequested { api, .. }) => {
                api.prevent_close();
                let _ = window.hide();
            }
            ("wheel", WindowEvent::DragDrop(DragDropEvent::Enter { paths, .. })) => {
                wheel::LOCKED.store(true, Ordering::SeqCst);
                wheel::log(&format!("drag enter with {} path(s)", paths.len()));
            }
            ("wheel", WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. })) => {
                wheel::log(&format!("drop with {} path(s)", paths.len()));
            }
            _ => {}
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            settings::load();
            i18n::set(settings::effective_language());
            std::thread::spawn(preview::clean_cache);
            // Started by Windows at login (--minimized): stay in the tray, show the window only on request.
            if !std::env::args().any(|a| a == "--minimized") {
                show_main(&handle);
            }
            jobs::start_workers(&handle);
            build_tray(&handle)?;
            // Another app may already own Ctrl+Alt+V; the tray item and Ctrl+V in the window still work.
            if let Err(err) = handle.global_shortcut().register(paste_key) {
                wheel::log(&format!("could not register Ctrl+Alt+V: {err}"));
            }
            wheel::init(&handle);
            wheel::spawn_watcher(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cocoflow");
}





