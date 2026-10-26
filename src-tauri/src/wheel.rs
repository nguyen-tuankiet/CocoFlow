//! Watches the mouse/keyboard for "dragging a file from Explorer with a modifier held" and
//! shows the (initially invisible) wheel window under the cursor so it can receive the drop.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_LBUTTON, VK_MENU, VK_SHIFT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, WindowFromPoint,
    GA_ROOT, GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, WS_CAPTION, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX,
    WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
};

pub const WHEEL_SIZE: f64 = 480.0;

pub static ENABLED: AtomicBool = AtomicBool::new(true);
/// Also open the wheel for drags that start in other apps (browser, chat, editor…), not only Explorer/desktop.
pub static ANY_APP: AtomicBool = AtomicBool::new(true);
static SHOWN: AtomicBool = AtomicBool::new(false);
/// Set once the wheel received a drag-enter with real files; the wheel then stops following the cursor.
pub static LOCKED: AtomicBool = AtomicBool::new(false);
/// Set when the drag under way carries no files (text dragged in Word, a link in a browser…): the wheel has moved
/// out of the way and stays away until the mouse button is released, so the other app gets its own drop.
static STEPPED_ASIDE: AtomicBool = AtomicBool::new(false);

const MODES: [&str; 5] = ["convert", "tools", "actions", "share", "ai"];

fn key_down(vk: u16) -> bool {
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

fn cursor() -> POINT {
    let mut pt = POINT { x: 0, y: 0 };
    unsafe { GetCursorPos(&mut pt) };
    pt
}

/// Window class of the top-level window under the point.
fn class_at(pt: POINT) -> String {
    unsafe {
        let hwnd = GetAncestor(WindowFromPoint(pt), GA_ROOT);
        if hwnd.is_null() {
            return String::new();
        }
        let mut buf = [0u16; 64];
        let len = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        String::from_utf16_lossy(&buf[..len.max(0) as usize])
    }
}

/// Whether a drag that starts in this window may open the wheel.
fn is_source_allowed(class: &str) -> bool {
    match class {
        "CabinetWClass" | "ExploreWClass" | "Progman" | "WorkerW" => true,
        // Our own windows, the taskbar and empty class names never start file drags.
        "Tauri Window" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "" => false,
        _ => ANY_APP.load(Ordering::Relaxed),
    }
}

fn current_mode() -> Option<u8> {
    if key_down(VK_CONTROL) && key_down(VK_MENU) && !key_down(VK_SHIFT) {
        Some(4)
    } else if key_down(VK_SHIFT) && key_down(VK_CONTROL) {
        Some(3)
    } else if key_down(VK_SHIFT) {
        Some(0)
    } else if key_down(VK_CONTROL) {
        Some(1)
    } else if key_down(VK_MENU) {
        Some(2)
    } else {
        None
    }
}

/// Appends a line to %LOCALAPPDATA%\Cocoflow\wheel.log (helps diagnosing "the wheel does not show").
pub fn log(message: &str) {
    use std::io::Write;
    let Some(dir) = std::env::var_os("LOCALAPPDATA").map(|d| std::path::PathBuf::from(d).join("Cocoflow")) else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("wheel.log");
    // keep the file small
    if std::fs::metadata(&path).map(|m| m.len() > 200_000).unwrap_or(false) {
        let _ = std::fs::remove_file(&path);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
    }
}

/// The wheel must be a borderless, non-activating tool window. Tauri's `decorations: false`
/// has been seen to leave a caption on this window, so enforce the style directly.
pub fn enforce_wheel_style(app: &AppHandle) {
    let Some(win) = app.get_webview_window("wheel") else { return };
    let Ok(hwnd) = win.hwnd() else { return };
    let hwnd = hwnd.0 as _;
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let remove = (WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX) as isize;
        let wanted = (style & !remove) | WS_POPUP as isize;
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let wanted_ex = ex | (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) as isize;
        if wanted != style || wanted_ex != ex {
            SetWindowLongPtrW(hwnd, GWL_STYLE, wanted);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, wanted_ex);
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            log(&format!("wheel style fixed: {style:#x} -> {wanted:#x}"));
        }
    }
}

fn place_wheel(app: &AppHandle, pt: POINT) {
    let Some(win) = app.get_webview_window("wheel") else { return };
    let Ok(hwnd) = win.hwnd() else { return };
    enforce_wheel_style(app);
    let (x, y, size) = match win.monitor_from_point(pt.x as f64, pt.y as f64) {
        Ok(Some(m)) => {
            let size = (WHEEL_SIZE * m.scale_factor()).round() as i32;
            let (pos, dim) = (m.position(), m.size());
            (
                (pt.x - size / 2).clamp(pos.x, (pos.x + dim.width as i32 - size).max(pos.x)),
                (pt.y - size / 2).clamp(pos.y, (pos.y + dim.height as i32 - size).max(pos.y)),
                size,
            )
        }
        _ => {
            let size = WHEEL_SIZE as i32;
            (pt.x - size / 2, pt.y - size / 2, size)
        }
    };
    unsafe {
        SetWindowPos(hwnd.0 as _, HWND_TOPMOST, x, y, size, size, SWP_NOACTIVATE);
    }
}

/// Idle position: the window stays "shown" (a hidden WebView2 does not take part in drag and drop)
/// but is parked so that only its bottom-right pixel touches the top-left corner of the screen.
fn park(app: &AppHandle) {
    let Some(win) = app.get_webview_window("wheel") else { return };
    let Ok(hwnd) = win.hwnd() else { return };
    let size = win.outer_size().map(|s| s.width as i32).unwrap_or(700);
    unsafe {
        SetWindowPos(hwnd.0 as _, HWND_TOPMOST, 1 - size, 1 - size, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

/// Call once at startup: fix the window style, show it and park it out of sight.
pub fn init(app: &AppHandle) {
    let Some(win) = app.get_webview_window("wheel") else { return };
    enforce_wheel_style(app);
    let _ = win.show();
    enforce_wheel_style(app); // show() re-applies Tauri's own style flags
    park(app);
}

/// The drag under the wheel has no files, so the wheel cannot use it: get out of the way at once so the drop lands
/// in the app below (Ctrl+drag to copy text in Word, for example), and stay away for this drag.
fn step_aside(app: &AppHandle) {
    if !STEPPED_ASIDE.swap(true, Ordering::SeqCst) {
        log("drag without files: wheel steps aside");
    }
    hide(app);
}

pub fn hide(app: &AppHandle) {
    LOCKED.store(false, Ordering::SeqCst);
    if SHOWN.swap(false, Ordering::SeqCst) {
        park(app);
        let _ = app.emit_to("wheel", "wheel-reset", ());
    }
}


pub fn spawn_watcher(app: AppHandle) {
    std::thread::spawn(move || loop {
        let app = app.clone();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || watch(app)));
        if result.is_err() {
            log("watcher crashed, restarting");
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

fn watch(app: AppHandle) {
    {
        let mut was_down = false;
        let mut armed = false; // button went down on Explorer
        let mut dragging = false;
        let mut press = POINT { x: 0, y: 0 };
        let mut released_at: Option<Instant> = None;
        // Last mode announced to the wheel page; pressing a modifier again switches mode even
        // if the user already picked another mode with the mouse.
        let mut announced: Option<u8> = None;
        // When and where the wheel appeared under the cursor during this drag.
        let mut shown_at: Option<(Instant, POINT)> = None;

        loop {
            std::thread::sleep(Duration::from_millis(12));
            if !ENABLED.load(Ordering::Relaxed) {
                if SHOWN.load(Ordering::SeqCst) {
                    hide(&app);
                }
                was_down = false;
                continue;
            }
            let down = key_down(VK_LBUTTON);
            let pt = cursor();

            if down && !was_down {
                press = pt;
                let class = class_at(pt);
                armed = !SHOWN.load(Ordering::SeqCst) && is_source_allowed(&class);
                STEPPED_ASIDE.store(false, Ordering::SeqCst);
                if current_mode().is_some() {
                    log(&format!("press with modifier over class '{class}' armed={armed}"));
                }
                dragging = false;
                released_at = None;
                announced = None;
                shown_at = None;
            }
            if down && armed && !STEPPED_ASIDE.load(Ordering::SeqCst) {
                if !dragging && ((pt.x - press.x).pow(2) + (pt.y - press.y).pow(2)) > 36 {
                    dragging = true;
                }
                // A drag of files reaches the wheel (Tauri's drag-enter) as soon as the mouse moves over it. When
                // the mouse has clearly moved and nothing came, the drag carries no files (text in Word, a selection
                // being made): Tauri ignores such drags, but the wheel would still swallow the drop (Ctrl+drag to
                // copy text would do nothing), so it gets out of the way until the button is released.
                if let Some((t, at)) = shown_at {
                    let moved = (pt.x - at.x).pow(2) + (pt.y - at.y).pow(2) > 144;
                    if !LOCKED.load(Ordering::SeqCst) && moved && t.elapsed() > Duration::from_millis(150) {
                        step_aside(&app);
                        was_down = down;
                        continue;
                    }
                }
                if dragging {
                    match current_mode() {
                        Some(mode) => {
                            if !LOCKED.load(Ordering::SeqCst) {
                                place_wheel(&app, pt);
                            }
                            let first = !SHOWN.swap(true, Ordering::SeqCst);
                            if first {
                                log(&format!("wheel shown at {},{} mode={mode}", pt.x, pt.y));
                                shown_at = Some((Instant::now(), pt));
                            }
                            if announced != Some(mode) {
                                announced = Some(mode);
                                let _ = app.emit_to("wheel", "wheel-mode", MODES[mode as usize]);
                            }
                        }
                        // Modifiers released: the wheel stays open until the drop (or leaving), so the
                        // user can finish with the mouse alone.
                        None => announced = None,
                    }
                }
            }
            if !down && was_down {
                armed = false;
                dragging = false;
                released_at = Some(Instant::now());
            }
            // The frontend hides the wheel right after a drop; this is only a safety net.
            if let Some(t) = released_at {
                if t.elapsed() > Duration::from_millis(400) {
                    released_at = None;
                    if SHOWN.load(Ordering::SeqCst) {
                        hide(&app);
                    }
                }
            }
            was_down = down;
        }
    }
}








