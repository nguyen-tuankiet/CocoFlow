//! Job queue: runs conversion commands on worker threads, reports progress to the UI and
//! lets the user pause, resume or cancel each job.

use crate::plan::{self, Cmd};
use crate::proc;
use serde::Serialize;
use std::cell::Cell;
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const WORKERS: usize = 2;
/// Error text of a job the user cancelled (not reported as a failure).
pub const CANCELLED: &str = "Cancelled";

#[derive(Serialize, Clone)]
pub struct JobDto {
    pub id: u64,
    pub title: String,
    /// queued, running, paused, done, error or cancelled
    pub status: &'static str,
    /// 0..1, or -1 when the tool cannot report progress.
    pub progress: f64,
    pub output: Option<String>,
    pub error: Option<String>,
}

type Work = Box<dyn FnOnce(&Reporter) -> Result<PathBuf, String> + Send>;

struct Job {
    id: u64,
    title: String,
    work: Work,
}

#[derive(Clone)]
pub struct Reporter {
    app: AppHandle,
    id: u64,
    title: String,
}

impl Reporter {
    fn send(&self, status: &'static str, progress: f64, output: Option<String>, error: Option<String>) {
        if let Some(c) = ctl().lock().unwrap_or_else(|e| e.into_inner()).get_mut(&self.id) {
            if progress >= 0.0 {
                c.progress = progress;
            }
        }
        emit(&self.app, JobDto { id: self.id, title: self.title.clone(), status, progress, output, error });
    }
    pub fn progress(&self, value: f64) {
        self.send("running", value, None, None);
    }
}

fn emit(app: &AppHandle, dto: JobDto) {
    let _ = app.emit("job-update", dto);
}

// ---------------------------------------------------------------- pause / cancel bookkeeping

/// What the control commands need to know about a job that is queued or running.
struct Ctl {
    title: String,
    progress: f64,
    pids: Vec<u32>,
    cancelled: bool,
    paused: bool,
}

fn ctl() -> &'static Mutex<HashMap<u64, Ctl>> {
    static C: OnceLock<Mutex<HashMap<u64, Ctl>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

thread_local! {
    /// The job the current worker thread is running (0 outside a job).
    static CURRENT: Cell<u64> = const { Cell::new(0) };
}

fn is_cancelled(id: u64) -> bool {
    ctl().lock().unwrap_or_else(|e| e.into_inner()).get(&id).is_some_and(|c| c.cancelled)
}

fn register_pid(id: u64, pid: u32) {
    if let Some(c) = ctl().lock().unwrap_or_else(|e| e.into_inner()).get_mut(&id) {
        c.pids.push(pid);
        if c.paused {
            // a pause also holds back the next step of a chain
            proc::suspend_tree(pid);
        }
    }
}

fn unregister_pid(id: u64, pid: u32) {
    if let Some(c) = ctl().lock().unwrap_or_else(|e| e.into_inner()).get_mut(&id) {
        c.pids.retain(|p| *p != pid);
    }
}

/// Runs an external program for the current job so that it can be paused and cancelled.
/// Used by steps that are done in-process (7-Zip, size searches).
pub fn run_tracked(cmd: &mut Command) -> Result<Output, String> {
    let id = CURRENT.with(Cell::get);
    if id != 0 && is_cancelled(id) {
        return Err(CANCELLED.into());
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).creation_flags(CREATE_NO_WINDOW);
    let child = cmd.spawn().map_err(|e| format!("Cannot start the tool: {e}"))?;
    let pid = child.id();
    if id != 0 {
        register_pid(id, pid);
    }
    let out = child.wait_with_output();
    if id != 0 {
        unregister_pid(id, pid);
        if is_cancelled(id) {
            return Err(CANCELLED.into());
        }
    }
    out.map_err(|e| e.to_string())
}

pub fn cancel(app: &AppHandle, id: u64) {
    let (pids, title) = {
        let mut g = ctl().lock().unwrap_or_else(|e| e.into_inner());
        let Some(c) = g.get_mut(&id) else { return };
        c.cancelled = true;
        c.paused = false;
        (c.pids.clone(), c.title.clone())
    };
    for pid in pids {
        proc::kill_tree(pid);
    }
    emit(app, JobDto { id, title, status: "cancelled", progress: 0.0, output: None, error: None });
}

pub fn cancel_all(app: &AppHandle) {
    let ids: Vec<u64> = ctl().lock().unwrap_or_else(|e| e.into_inner()).keys().copied().collect();
    for id in ids {
        cancel(app, id);
    }
}

fn set_paused(app: &AppHandle, id: u64, paused: bool) {
    let (pids, title, progress) = {
        let mut g = ctl().lock().unwrap_or_else(|e| e.into_inner());
        let Some(c) = g.get_mut(&id) else { return };
        if c.cancelled || c.paused == paused {
            return;
        }
        c.paused = paused;
        (c.pids.clone(), c.title.clone(), c.progress)
    };
    for pid in pids {
        if paused {
            proc::suspend_tree(pid);
        } else {
            proc::resume_tree(pid);
        }
    }
    emit(
        app,
        JobDto { id, title, status: if paused { "paused" } else { "running" }, progress, output: None, error: None },
    );
}

pub fn pause(app: &AppHandle, id: u64) {
    set_paused(app, id, true);
}

pub fn resume(app: &AppHandle, id: u64) {
    set_paused(app, id, false);
}

// ---------------------------------------------------------------- queue

struct Queue {
    jobs: Mutex<VecDeque<Job>>,
    ready: Condvar,
}

fn queue() -> &'static Arc<Queue> {
    static Q: OnceLock<Arc<Queue>> = OnceLock::new();
    Q.get_or_init(|| Arc::new(Queue { jobs: Mutex::new(VecDeque::new()), ready: Condvar::new() }))
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
/// Jobs queued or running; a notification is sent only when this drops to zero.
static PENDING: AtomicUsize = AtomicUsize::new(0);
/// (succeeded, message) of the jobs finished since the last notification.
static RESULTS: Mutex<Vec<(bool, String)>> = Mutex::new(Vec::new());

/// One notification per batch instead of one per file (converting 50 photos must not pop 50 toasts).
/// A cancelled job passes `None`: it only counts as finished.
fn finish(app: &AppHandle, result: Option<(bool, String)>) {
    if let Some(r) = result {
        RESULTS.lock().unwrap_or_else(|e| e.into_inner()).push(r);
    }
    if PENDING.fetch_sub(1, Ordering::SeqCst) != 1 {
        return;
    }
    let app = app.clone();
    // Give a batch that is still being submitted a moment to add more jobs.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1200));
        if PENDING.load(Ordering::SeqCst) != 0 {
            return;
        }
        let results = std::mem::take(&mut *RESULTS.lock().unwrap_or_else(|e| e.into_inner()));
        let failed: Vec<&(bool, String)> = results.iter().filter(|(ok, _)| !ok).collect();
        let t = crate::i18n::get();
        match results.as_slice() {
            [] => {}
            [(true, message)] => notify(&app, t.done, message),
            [(false, message)] => notify(&app, t.failed, message),
            _ if failed.is_empty() => notify(&app, t.done, &t.n_finished(results.len())),
            _ => notify(
                &app,
                t.finished_with_errors,
                &format!("{} — {}", t.n_done_failed(results.len() - failed.len(), failed.len()), first_line(&failed[0].1)),
            ),
        }
    });
}

pub fn start_workers(app: &AppHandle) {
    for _ in 0..WORKERS {
        let app = app.clone();
        std::thread::spawn(move || loop {
            let job = {
                let q = queue();
                let mut jobs = q.jobs.lock().unwrap();
                while jobs.is_empty() {
                    jobs = q.ready.wait(jobs).unwrap();
                }
                jobs.pop_front().unwrap()
            };
            let reporter = Reporter { app: app.clone(), id: job.id, title: job.title };
            if is_cancelled(job.id) {
                // cancelled while it was still waiting in the queue
                ctl().lock().unwrap_or_else(|e| e.into_inner()).remove(&job.id);
                finish(&app, None);
                continue;
            }
            reporter.send("running", -1.0, None, None);
            CURRENT.with(|c| c.set(job.id));
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| (job.work)(&reporter)))
                .unwrap_or_else(|_| Err("Internal error while processing this file".to_string()));
            CURRENT.with(|c| c.set(0));
            ctl().lock().unwrap_or_else(|e| e.into_inner()).remove(&job.id);
            match outcome {
                Ok(output) => {
                    finish(&app, Some((true, reporter.title.clone())));
                    reporter.send("done", 1.0, Some(output.display().to_string()), None);
                }
                Err(err) if err == CANCELLED => {
                    finish(&app, None);
                    reporter.send("cancelled", 0.0, None, None);
                }
                Err(err) => {
                    finish(&app, Some((false, format!("{}: {}", reporter.title, first_line(&err)))));
                    reporter.send("error", 0.0, None, Some(err));
                }
            }
        });
    }
}

fn first_line(text: &str) -> &str {
    text.lines().next().unwrap_or(text)
}

pub fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Queue a unit of work and return its id.
pub fn submit(app: &AppHandle, title: String, work: Work) -> u64 {
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    ctl().lock().unwrap_or_else(|e| e.into_inner()).insert(
        id,
        Ctl { title: title.clone(), progress: 0.0, pids: Vec::new(), cancelled: false, paused: false },
    );
    let reporter = Reporter { app: app.clone(), id, title: title.clone() };
    reporter.send("queued", 0.0, None, None);
    PENDING.fetch_add(1, Ordering::SeqCst);
    let q = queue();
    q.jobs.lock().unwrap().push_back(Job { id, title, work });
    q.ready.notify_one();
    id
}

pub fn submit_cmd(app: &AppHandle, title: String, cmd: Result<Cmd, String>) -> u64 {
    submit(
        app,
        title,
        Box::new(move |rep| {
            let cmd = cmd?;
            let output = cmd.output.clone();
            let result = run(cmd, rep);
            // The name is only held while the job is pending: a finished file now exists on disk,
            // and a failed or deleted one must not block the name for the rest of the session.
            plan::release(&output);
            result
        }),
    )
}

/// "progress =  12%" (whisper) or "12.34%" (Real-ESRGAN) → 12 / 12.34
fn percent_in(line: &str) -> Option<f64> {
    let t = line.trim();
    let tail = t.strip_suffix('%')?;
    let number = tail.rsplit(|c: char| !(c.is_ascii_digit() || c == '.')).next()?;
    number.parse::<f64>().ok().filter(|v| (0.0..=100.0).contains(v))
}

pub(crate) fn parse_duration(line: &str) -> Option<f64> {
    // "  Duration: 00:01:23.45, start: ..."
    let rest = line.trim_start().strip_prefix("Duration:")?.trim_start();
    let stamp = rest.split(',').next()?.trim();
    let mut parts = stamp.split(':');
    let h: f64 = parts.next()?.parse().ok()?;
    let m: f64 = parts.next()?.parse().ok()?;
    let s: f64 = parts.next()?.parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

/// Runs a command with all of its `before` steps, then cleans up its temporary files.
fn run(mut cmd: Cmd, rep: &Reporter) -> Result<PathBuf, String> {
    let temps = std::mem::take(&mut cmd.temp);
    let result = run_chain(cmd, rep);
    for path in temps {
        if path.is_dir() {
            let _ = std::fs::remove_dir_all(&path);
        } else {
            let _ = std::fs::remove_file(&path);
        }
    }
    result
}

fn run_chain(mut cmd: Cmd, rep: &Reporter) -> Result<PathBuf, String> {
    for step in std::mem::take(&mut cmd.before) {
        run_chain(step, rep)?;
    }
    run_one(cmd, rep)
}

fn run_one(mut cmd: Cmd, rep: &Reporter) -> Result<PathBuf, String> {
    if is_cancelled(rep.id) {
        return Err(CANCELLED.into());
    }
    if let Some(dir) = &cmd.mkdir {
        std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create folder: {e}"))?;
    }
    if let Some(work) = cmd.native.take() {
        if let Err(e) = work() {
            discard(&cmd.output, cmd.mkdir.is_some());
            return Err(e);
        }
        return Ok(cmd.output);
    }
    // LibreOffice refuses to run two instances on one profile, so its jobs go one at a time.
    static LIBREOFFICE: Mutex<()> = Mutex::new(());
    let is_office = cmd.program.file_name().is_some_and(|n| n.eq_ignore_ascii_case("soffice.exe"));
    let _office_guard = is_office.then(|| LIBREOFFICE.lock().unwrap_or_else(|e| e.into_inner()));
    let mut child = Command::new(&cmd.program)
        .args(&cmd.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Cannot start {}: {e}", cmd.program.display()))?;
    let pid = child.id();
    register_pid(rep.id, pid);

    // Total duration (seconds, stored as microseconds) is announced on stderr by ffmpeg.
    let duration_us = Arc::new(AtomicU64::new(0));
    let tail = Arc::new(Mutex::new(VecDeque::<String>::new()));
    let stderr = child.stderr.take().unwrap();
    let stderr_thread = {
        let duration_us = duration_us.clone();
        let tail = tail.clone();
        let is_ffmpeg = cmd.ffmpeg;
        let reporter = rep.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if !is_ffmpeg {
                    if let Some(pct) = percent_in(&line) {
                        reporter.progress((pct / 100.0).clamp(0.0, 0.99));
                    }
                }
                if is_ffmpeg && duration_us.load(Ordering::Relaxed) == 0 {
                    if let Some(secs) = parse_duration(&line) {
                        duration_us.store((secs * 1e6) as u64, Ordering::Relaxed);
                    }
                }
                let mut t = tail.lock().unwrap();
                if t.len() >= 12 {
                    t.pop_front();
                }
                t.push_back(line);
            }
        })
    };

    let stdout = child.stdout.take().unwrap();
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if !cmd.ffmpeg {
            let mut t = tail.lock().unwrap();
            if t.len() >= 12 {
                t.pop_front();
            }
            t.push_back(line);
            continue;
        }
        if let Some(value) = line.strip_prefix("out_time_us=") {
            let total = duration_us.load(Ordering::Relaxed);
            if let (Ok(done), true) = (value.trim().parse::<u64>(), total > 0) {
                rep.progress((done as f64 / total as f64).clamp(0.0, 0.99));
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string());
    unregister_pid(rep.id, pid);
    let _ = stderr_thread.join();
    if is_cancelled(rep.id) {
        discard(&cmd.output, cmd.mkdir.is_some());
        return Err(CANCELLED.into());
    }
    let status = status?;
    if status.success() {
        Ok(cmd.output)
    } else {
        discard(&cmd.output, cmd.mkdir.is_some());
        let lines: Vec<String> = tail.lock().unwrap().iter().cloned().collect();
        let message = lines.join("\n");
        Err(if message.trim().is_empty() { format!("Exited with {status}") } else { message })
    }
}

/// Removes a half-written result: a file, or a folder this job created itself.
fn discard(output: &std::path::Path, created_folder: bool) {
    if output.is_file() {
        let _ = std::fs::remove_file(output);
    } else if output.is_dir() && created_folder {
        let _ = std::fs::remove_dir_all(output);
    }
}

