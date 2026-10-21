import "./style.css";
import { optionIcon, sourceIcon } from "./icons";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AllOptions,
  EngineInfo,
  Job,
  MODES,
  MODE_KEY,
  Mode,
  cancelAllJobs,
  cancelJob,
  describePaths,
  engineStatus,
  getAllOptions,
  getAutostart,
  getSettings,
  pasteClipboard,
  pauseJob,
  resumeJob,
  reveal,
  runOption,
  setAnyApp,
  setAutostart,
  setDetection,
} from "./api";
import { EditorRequest, openEditor } from "./editor";
import { Update, bannerText, checkForUpdate, download, setUpdatesEnabled, skipUpdate, startUpdates, updatesEnabled } from "./update";
import {
  LangSetting,
  chooseLanguage,
  getSetting,
  initLanguage,
  modeLabel,
  onLanguage,
  optionLabel,
  optionSub,
  t,
  translateError,
} from "./i18n";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const dropEl = $("drop");
const workEl = $("work");
const filesEl = $("files");
const tabsEl = $("tabs");
const optionsEl = $("options");
const jobsEl = $("jobs");
const enginesEl = $("engines");
const detectEl = $<HTMLInputElement>("detect");
const anyAppEl = $<HTMLInputElement>("anyapp");
const langEl = $<HTMLSelectElement>("lang");

let paths: string[] = [];
let options: AllOptions | null = null;
let mode: Mode = "convert";
const jobs = new Map<number, Job>();
let kindCache: Record<string, string> = {};
let engineList: EngineInfo[] = [];

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---- static texts ----
function renderStatic() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  $("detect-label").title = t("wheel.enable.tip");
  $("anyapp-label").title = t("wheel.anyapp.tip");
  $("autostart-label").title = t("autostart.tip");
  $("update-label").title = t("update.check.tip");
  $("update-skip").title = t("update.skip");
  const k = (key: string) => `<kbd>${key}</kbd>`;
  $("drop-sub").innerHTML = `${escapeHtml(t("drop.or"))} <button id="browse" class="link">${escapeHtml(t("drop.browse"))}</button> · <button id="paste" class="link">${escapeHtml(t("drop.paste"))}</button> ${t("drop.hint", {
    k1: k("Shift"),
    k2: k("Ctrl"),
    k3: k("Alt"),
    k4: `${k("Shift")}+${k("Ctrl")}`,
  })}`;
  $("browse").addEventListener("click", browse);
  $("paste").addEventListener("click", () => void paste());
  langEl.value = getSetting();
}

async function browse() {
  const picked = await open({ multiple: true, directory: false });
  if (picked) await addFiles(Array.isArray(picked) ? picked : [picked]);
}

const noteEl = $("drop-note");
let noteTimer: number | undefined;

function showNote(text: string) {
  noteEl.textContent = text;
  noteEl.hidden = !text;
  clearTimeout(noteTimer);
  if (text) noteTimer = window.setTimeout(() => (noteEl.hidden = true), 6000);
}

/** Clipboard → files. The backend emits `files-added`, so a success needs nothing more here. */
async function paste() {
  showNote("");
  try {
    await pasteClipboard();
  } catch (err) {
    showNote(String(err));
  }
}

// Ctrl+V anywhere in the window (not while typing in a field)
document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "v" && !/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
    e.preventDefault();
    void paste();
  }
});

// ---- files and options ----
async function setFiles(next: string[]) {
  paths = [...new Set(next)];
  if (paths.length === 0) {
    options = null;
    renderWork();
    return;
  }
  options = await getAllOptions(paths);
  if (options[mode].length === 0) mode = MODES.find((m) => options![m].length > 0) ?? "convert";
  renderWork();
}

function renderWork() {
  workEl.hidden = paths.length === 0;
  if (!options) return;
  filesEl.innerHTML = paths
    .map((p) => `<span class="chip" title="${escapeHtml(p)}">${sourceIcon(p, kindCache[p] ?? "file", 15)} ${escapeHtml(baseName(p))}</span>`)
    .join("");
  tabsEl.innerHTML = MODES.map(
    (m) => `<button class="tab ${m === mode ? "on" : ""}" data-mode="${m}">${escapeHtml(modeLabel(m))}<small>${MODE_KEY[m]}</small></button>`,
  ).join("");
  const items = options[mode];
  optionsEl.innerHTML = items.length
    ? items
        .map((o) => {
          const sub = optionSub(o.sub);
          return `<button class="option" data-id="${o.id}">${optionIcon(o.id, 26)}<span>${escapeHtml(optionLabel(o.id, o.label))}</span>${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</button>`;
        })
        .join("")
    : `<div class="muted">${escapeHtml(mode === "ai" && options.ai_hint ? t(options.ai_hint) : t("no.options", { mode: modeLabel(mode).toLowerCase() }))}</div>`;
}

tabsEl.addEventListener("click", (e) => {
  const tab = (e.target as HTMLElement).closest<HTMLElement>("[data-mode]");
  if (tab) {
    mode = tab.dataset.mode as Mode;
    renderWork();
  }
});

optionsEl.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
  if (btn) await runOption(paths, btn.dataset.id!);
});

$("clear").addEventListener("click", () => void setFiles([]));

async function addFiles(list: string[]) {
  kindCache = { ...kindCache, ...(await describePaths(list)) };
  await setFiles(list);
}

await getCurrentWebview().onDragDropEvent(async (event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") dropEl.classList.add("over");
  else dropEl.classList.remove("over");
  if (p.type === "drop" && p.paths.length) await addFiles(p.paths);
});

// ---- activity ----
const FINISHED = new Set(["done", "error", "cancelled"]);

function renderJobs() {
  const list = [...jobs.values()].sort((a, b) => b.id - a.id);
  $("clear-finished").hidden = !list.some((j) => FINISHED.has(j.status));
  $("cancel-all").hidden = !list.some((j) => !FINISHED.has(j.status));
  if (list.length === 0) {
    jobsEl.innerHTML = `<div class="muted">${escapeHtml(t("activity.empty"))}</div>`;
    return;
  }
  jobsEl.innerHTML = list
    .map((j) => {
      const pct = j.progress >= 0 ? `${Math.round(j.progress * 100)}%` : "";
      const state =
        j.status === "done"
          ? t("job.done")
          : j.status === "error"
            ? t("job.failed")
            : j.status === "queued"
              ? t("job.queued")
              : j.status === "paused"
                ? `${t("job.paused")} ${pct}`.trim()
                : j.status === "cancelled"
                  ? t("job.cancelled")
                  : pct || t("job.working");
      const active = !FINISHED.has(j.status);
      const bar = active
        ? `<div class="bar ${j.progress < 0 && j.status === "running" || j.status === "queued" ? "indeterminate" : ""} ${j.status === "paused" ? "paused" : ""}"><i style="width:${Math.max(0, j.progress) * 100}%"></i></div>`
        : "";
      const controls = active
        ? `<span class="job-actions">${
            j.status === "running"
              ? `<button class="icon-btn" data-act="pause" data-id="${j.id}" title="${escapeHtml(t("job.pause"))}">⏸</button>`
              : j.status === "paused"
                ? `<button class="icon-btn" data-act="resume" data-id="${j.id}" title="${escapeHtml(t("job.resume"))}">▶</button>`
                : ""
          }<button class="icon-btn" data-act="cancel" data-id="${j.id}" title="${escapeHtml(t("job.cancel"))}">✕</button></span>`
        : "";
      const right =
        j.status === "done" && j.output
          ? `<button class="ghost" data-reveal="${escapeHtml(j.output)}">${escapeHtml(t("job.show"))}</button>`
          : `<span class="state">${escapeHtml(state)}</span>${controls}`;
      const err = j.error ? `<div class="err">${escapeHtml(translateError(j.error))}</div>` : "";
      return `<div class="job ${j.status}"><div class="title" title="${escapeHtml(j.title)}">${escapeHtml(j.title)}</div><div class="job-right">${right}</div>${bar}${err}</div>`;
    })
    .join("");
}

jobsEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const reveal_ = target.closest<HTMLElement>("[data-reveal]");
  if (reveal_) return void reveal(reveal_.dataset.reveal!);
  const btn = target.closest<HTMLElement>("[data-act]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.act === "pause") void pauseJob(id);
  else if (btn.dataset.act === "resume") void resumeJob(id);
  else void cancelJob(id);
});

$("cancel-all").addEventListener("click", () => void cancelAllJobs());
$("clear-finished").addEventListener("click", () => {
  for (const [id, job] of jobs) if (FINISHED.has(job.status)) jobs.delete(id);
  renderJobs();
});

await listen<Job>("job-update", (event) => {
  jobs.set(event.payload.id, event.payload);
  renderJobs();
});

// pasted from the clipboard (Ctrl+V, tray item or Ctrl+Alt+V)
await listen<string[]>("files-added", (event) => void addFiles(event.payload));

// ---- editors (trim, crop, split, resize) are opened by the wheel or the option grid ----
await listen<EditorRequest>("open-editor", (event) => void openEditor(event.payload));

// ---- settings, language, engines ----
await initLanguage();
const settings = await getSettings();
detectEl.checked = settings.wheel_enabled;
anyAppEl.checked = settings.any_app;
detectEl.addEventListener("change", () => void setDetection(detectEl.checked));
anyAppEl.addEventListener("change", () => void setAnyApp(anyAppEl.checked));
langEl.addEventListener("change", () => void chooseLanguage(langEl.value as LangSetting));
const autostartEl = $<HTMLInputElement>("autostart");
autostartEl.checked = await getAutostart();
autostartEl.addEventListener("change", async () => (autostartEl.checked = await setAutostart(autostartEl.checked)));

// ---- new version banner ----
const updateEl = $("update");
let pendingUpdate: Update | null = null;

function renderUpdate(u: Update | null) {
  pendingUpdate = u;
  updateEl.hidden = !u;
  if (u) $("update-text").textContent = bannerText(u);
}

$("update-get").addEventListener("click", () => pendingUpdate && download(pendingUpdate));
$("update-skip").addEventListener("click", () => pendingUpdate && skipUpdate(pendingUpdate));
const updateCheckEl = $<HTMLInputElement>("update-check");
updateCheckEl.checked = updatesEnabled();
updateCheckEl.addEventListener("change", () => {
  setUpdatesEnabled(updateCheckEl.checked);
  void checkForUpdate(true);
});

function renderEngines() {
  enginesEl.innerHTML = engineList
    .map(
      (e) =>
        `<div class="engine"><span>${e.found ? "✅" : "⚪"}</span><strong>${e.name}</strong><span>${escapeHtml(e.purpose)}${
          e.found ? "" : ` — ${escapeHtml(t("install"))}: <code>${escapeHtml(e.install)}</code>`
        }</span></div>`,
    )
    .join("");
}

onLanguage(() => {
  renderStatic();
  renderUpdate(pendingUpdate);
  renderWork();
  renderJobs();
  renderEngines();
});
engineList = await engineStatus();
renderStatic();
renderJobs();
renderEngines();
startUpdates(renderUpdate);
