import { getVersion } from "@tauri-apps/api/app";
import { notifyUpdate, openReleasePage } from "./api";
import { getLang, t } from "./i18n";

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

/** What one release changed, as published on GitHub. */
export interface ReleaseNotes {
  version: string;
  /** Publication date (ISO). */
  date: string;
  /** The release text (Markdown), with a "## Tiếng Việt" and a "## English" part when written by hand. */
  body: string;
}

export interface Update {
  version: string;
  url: string;
  /** Every release newer than the installed version, newest first. */
  notes: ReleaseNotes[];
}

let current: Update | null = null;
let installed = "";
let onChange: (u: Update | null) => void = () => {};

type Release = { tag_name?: string; html_url?: string; body?: string | null; published_at?: string; draft?: boolean; prerelease?: boolean };

/** The newest release, with the notes of all releases newer than `installed` (one request for the last 20). */
async function latest(installed: string): Promise<Update | null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) return null;
  // only the app's own releases (the tools archive is a pre-release with another kind of tag)
  const list = ((await r.json()) as Release[]).filter((x) => !x.draft && !x.prerelease && x.tag_name && x.html_url && /^v?\d+(\.\d+)+$/i.test(x.tag_name));
  const version = (x: Release) => x.tag_name!.replace(/^v/i, "");
  list.sort((a, b) => (isNewer(version(a), version(b)) ? -1 : isNewer(version(b), version(a)) ? 1 : 0));
  const newest = list[0];
  if (!newest) return null;
  const notes = list.filter((x) => isNewer(version(x), installed)).map((x) => ({ version: version(x), date: x.published_at ?? "", body: x.body ?? "" }));
  return { version: version(newest), url: newest.html_url!, notes };
}

/** Checks now (`force`) or only when the last check is older than six hours. Never throws: offline is normal. */
export async function checkForUpdate(force = false) {
  if (!updatesEnabled()) return setCurrent(null);
  if (!force && Date.now() - Number(read(KEY.last) ?? 0) < EVERY) return;
  try {
    installed ||= await getVersion();
    const found = await latest(installed);
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

/**
 * The changes of one release as a list of plain lines in the user's language: the part under "## Tiếng Việt" or
 * "## English" when the notes have both, otherwise all of it. GitHub's "Full Changelog" link is left out. Each item is
 * { heading: true } for a "###" title, otherwise a bullet; **bold** is kept as a marker for the renderer.
 */
export function noteLines(body: string): { text: string; heading: boolean }[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const want = getLang() === "vi" ? /^##\s*tiếng việt/i : /^##\s*english/i;
  const start = lines.findIndex((l) => want.test(l.trim()));
  let part = lines;
  if (start >= 0) {
    const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l.trim()) && !/^###/.test(l.trim()));
    part = lines.slice(start + 1, end < 0 ? undefined : end);
  }
  return part
    .map((l) => l.trim())
    .filter((l) => l && !/full changelog/i.test(l) && !/^<!--.*-->$/.test(l) && !/^##\s/.test(l))
    .map((l) => {
      const heading = /^#{3,}\s/.test(l);
      const text = l
        .replace(/^#{3,}\s*/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/https?:\/\/\S+/g, "")
        .trim();
      return { text, heading };
    })
    .filter((l) => l.text);
}
