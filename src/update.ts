import { getVersion } from "@tauri-apps/api/app";
import { notifyUpdate, openReleasePage } from "./api";
import { t } from "./i18n";

// Asks GitHub which release is the newest and tells the user when it is newer than the installed one.
// Only this one request leaves the PC (to api.github.com, no file or personal data); the switch in the header turns it off.
const REPO = "nguyen-tuankiet/CocoFlow";
const EVERY = 6 * 3600 * 1000;
const KEY = { on: "cocoflow.update.check", skip: "cocoflow.update.skip", notified: "cocoflow.update.notified", last: "cocoflow.update.last" };

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked */
  }
};

export const updatesEnabled = () => read(KEY.on) !== "0";
export const setUpdatesEnabled = (on: boolean) => write(KEY.on, on ? "1" : "0");

const parts = (v: string) => v.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
/** True when version `a` is newer than `b` (compares 0.4.12 > 0.4.9 numerically). */
export function isNewer(a: string, b: string): boolean {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export interface Update {
  version: string;
  url: string;
}

let current: Update | null = null;
let installed = "";
let onChange: (u: Update | null) => void = () => {};

async function latest(): Promise<Update | null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) return null;
  const j = (await r.json()) as { tag_name?: string; html_url?: string };
  if (!j.tag_name || !j.html_url) return null;
  return { version: j.tag_name.replace(/^v/i, ""), url: j.html_url };
}

/** Checks now (`force`) or only when the last check is older than six hours. Never throws: offline is normal. */
export async function checkForUpdate(force = false) {
  if (!updatesEnabled()) return setCurrent(null);
  if (!force && Date.now() - Number(read(KEY.last) ?? 0) < EVERY) return;
  try {
    installed ||= await getVersion();
    const found = await latest();
    write(KEY.last, String(Date.now()));
    if (!found || !isNewer(found.version, installed)) return setCurrent(null);
    setCurrent(found);
    // the system notification appears once per version, even when the window is closed in the tray
    if (read(KEY.notified) !== found.version && read(KEY.skip) !== found.version) {
      write(KEY.notified, found.version);
      void notifyUpdate(found.version).catch(() => {});
    }
  } catch {
    /* no network, rate limit… try again later */
  }
}

function setCurrent(u: Update | null) {
  current = u && read(KEY.skip) !== u.version ? u : null;
  onChange(current);
}

export const skipUpdate = (u: Update) => {
  write(KEY.skip, u.version);
  setCurrent(u);
};

export const download = (u: Update) => void openReleasePage(u.url);

/** Wires the banner: checks at start, then whenever the window gets focus or an hour passes, if the last check is stale. */
export function startUpdates(render: (u: Update | null) => void) {
  onChange = render;
  void checkForUpdate(true);
  window.addEventListener("focus", () => void checkForUpdate());
  window.setInterval(() => void checkForUpdate(), 3600 * 1000);
}

export const bannerText = (u: Update) => t("update.available", { v: u.version });
