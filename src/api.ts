import { invoke } from "@tauri-apps/api/core";

export type Mode = "convert" | "tools" | "actions" | "share" | "ai";
export const MODES: Mode[] = ["convert", "tools", "actions", "share", "ai"];

export interface Opt {
  id: string;
  label: string;
  icon: string;
  /** Caption under the label (size goals: the target size). */
  sub?: string | null;
}

export interface AllOptions {
  kind: string;
  count: number;
  convert_hint: string | null;
  convert: Opt[];
  tools: Opt[];
  actions: Opt[];
  share: Opt[];
  ai: Opt[];
  ai_hint: string | null;
  total_size: number;
}

export interface Job {
  id: number;
  title: string;
  status: "queued" | "running" | "paused" | "done" | "error" | "cancelled";
  progress: number;
  output?: string;
  error?: string;
}

export interface EngineInfo {
  name: string;
  purpose: string;
  found: boolean;
  path?: string;
  install: string;
}

export const getAllOptions = (paths: string[]) => invoke<AllOptions>("get_all_options", { paths });
export const runOption = (paths: string[], optionId: string, params?: Record<string, string>) =>
  invoke<void>("run_option", { paths, optionId, params: params ?? null });
export const cancelJob = (id: number) => invoke<void>("cancel_job", { id });
export const pauseJob = (id: number) => invoke<void>("pause_job", { id });
export const resumeJob = (id: number) => invoke<void>("resume_job", { id });
export const cancelAllJobs = () => invoke<void>("cancel_all_jobs");

export interface MediaInfo {
  duration: number | null;
  width: number;
  height: number;
  has_audio: boolean;
}
export interface PdfInfo {
  pages: number;
  thumbs: string[];
}
export const mediaInfo = (path: string) => invoke<MediaInfo>("media_info", { path });
export const previewFile = (path: string) => invoke<string>("preview_file", { path });
export const pdfInfo = (path: string) => invoke<PdfInfo>("pdf_info", { path });
export const engineStatus = () => invoke<EngineInfo[]>("engine_status");
export const describePaths = (paths: string[]) => invoke<Record<string, string>>("describe_paths", { paths });
/** Reads the clipboard (copied files or an image); the files then arrive as a `files-added` event. */
export const pasteClipboard = () => invoke<number>("paste_clipboard");
export const reveal =(path: string) => invoke<void>("reveal", { path });
/** Opens a Cocoflow release page in the default browser (the backend refuses any other address). */
export const openReleasePage = (url: string) => invoke<void>("open_release_page", { url });
/** Shows a Windows notification that a newer version exists. */
export const notifyUpdate = (version: string) => invoke<void>("notify_update", { version });
/** Saves a straightened page next to its photo (as <name>_scan.jpg or .png), as a job in Activity. */
export const saveScan = (source: string, image: Uint8Array, ext: "jpg" | "png") =>
  invoke<void>("save_scan", image, { headers: { "x-source": encodeURIComponent(source), "x-ext": ext } });
/** Shows a Windows notification with the given texts. */
export const notifyText = (title: string, body: string) => invoke<void>("notify_text", { title, body });
export const hideWheel = () => invoke<void>("hide_wheel");
export const setDetection = (enabled: boolean) => invoke<void>("set_detection", { enabled });
export const setAnyApp = (enabled: boolean) => invoke<void>("set_any_app", { enabled });
export const getSettings = () => invoke<{ wheel_enabled: boolean; any_app: boolean }>("get_settings");

export const MODE_KEY: Record<Mode, string> = { convert: "Shift", tools: "Ctrl", actions: "Alt", share: "Shift+Ctrl", ai: "Ctrl+Alt" };



export const getAutostart = () => invoke<boolean>("get_autostart");
export const setAutostart = (enabled: boolean) => invoke<boolean>("set_autostart", { enabled });


