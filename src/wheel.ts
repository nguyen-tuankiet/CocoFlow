import "./wheel.css";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AllOptions, MODES, MODE_KEY, Mode, Opt, getAllOptions, hideWheel, runOption } from "./api";
import { optionIcon, sourceIcon } from "./icons";
import { initLanguage, modeLabel, onLanguage, optionLabel, optionSub, t } from "./i18n";

const SIZE = 480;
const C = SIZE / 2;
const R_IN = 72; // hub edge
const R_OUT = 184; // outer edge of the ring
const GAP = 7; // distance from the true slice edges; the stroke below grows each shape back by 5px
const STROKE = 8;

const root = document.getElementById("wheel")!;

let paths: string[] = [];
let options: AllOptions | null = null;
let mode: Mode = "convert";
let hot = -1;

const current = (): Opt[] => (options ? options[mode] : []);
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const esc = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Point at radius r and angle a (radians, 0 = top, clockwise). */
function pt(r: number, a: number): [number, number] {
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

/** Ring slice whose edges stay GAP px away from the neighbours (parallel edges, not a fixed angle). */
function slicePath(a0: number, a1: number): string {
  const ro = R_OUT - GAP;
  const ri = R_IN + GAP;
  if (a1 - a0 >= Math.PI * 2 - 0.01) {
    // a single option: a plain donut (one arc cannot draw a full circle)
    const [ox, oy] = pt(ro, 0);
    const [oxb, oyb] = pt(ro, Math.PI);
    const [ix, iy] = pt(ri, 0);
    const [ixb, iyb] = pt(ri, Math.PI);
    return `M${ox} ${oy}A${ro} ${ro} 0 1 1 ${oxb} ${oyb}A${ro} ${ro} 0 1 1 ${ox} ${oy}ZM${ix} ${iy}A${ri} ${ri} 0 1 0 ${ixb} ${iyb}A${ri} ${ri} 0 1 0 ${ix} ${iy}Z`;
  }
  const oA0 = a0 + Math.asin(GAP / ro);
  const oA1 = a1 - Math.asin(GAP / ro);
  const iA0 = a0 + Math.asin(GAP / ri);
  const iA1 = a1 - Math.asin(GAP / ri);
  const large = oA1 - oA0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(ro, oA0);
  const [x1, y1] = pt(ro, oA1);
  const [x2, y2] = pt(ri, iA1);
  const [x3, y3] = pt(ri, iA0);
  return `M${x0} ${y0}A${ro} ${ro} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${large} 0 ${x3} ${y3}Z`;
}

const DEFS = `
<defs>
  <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".97"/><stop offset="1" stop-color="#e9effb" stop-opacity=".97"/>
  </linearGradient>
  <linearGradient id="hotg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e4edff"/><stop offset="1" stop-color="#bcd0ff"/>
  </linearGradient>
  <radialGradient id="hubg" cx="50%" cy="38%" r="75%">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2fb"/>
  </radialGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>`;

function hubHtml(): string {
  const first = paths[0] ? baseName(paths[0]) : "";
  const count = options?.count ?? 0;
  const kind = options?.kind ?? "file";
  const sub = count > 1 ? t("wheel.files", { n: count }) : formatSize(options?.total_size ?? 0);
  return `<div class="hub-content">
    <div class="hub-badge">${sourceIcon(first, kind, 34)}</div>
    <div class="fname" title="${esc(first)}">${esc(first)}</div>
    <div class="fcount">${sub}</div>
  </div>`;
}
function modesHtml(): string {
  return `<div class="modes">${MODES.map(
    (m) => `<span class="pill${m === mode ? " on" : ""}" data-mode="${m}">${m === mode ? `<b>${MODE_KEY[m]}</b>` : ""}${esc(modeLabel(m))}</span>`,
  ).join("")}</div>`;
}

/** Text under an icon: conversions get a friendly format name ("PNG image"), tools keep their label. */
function caption(item: Opt): string {
  return optionLabel(item.id, item.label);
}

/** Full rebuild: on drag enter and when the mode changes. Hovering only toggles classes (see paint). */
function render(enter = false) {
  if (!options) {
    root.innerHTML = "";
    return;
  }
  const items = current();
  const stageClass = `stage${enter ? " enter" : ""}`;
  if (items.length === 0) {
    const reason =
      mode === "convert"
        ? options.convert_hint && t(options.convert_hint)
        : mode === "ai"
          ? t(options.ai_hint ?? "wheel.nothing")
          : mode === "share"
            ? t("wheel.noPresets")
          : t("wheel.noMode", { mode: modeLabel(mode).toLowerCase() });
    const others = MODES.filter((m) => m !== mode && options![m].length > 0)
      .map((m) => `${MODE_KEY[m]} → ${modeLabel(m)}`)
      .join("  ·  ");
    root.innerHTML = `<div class="${stageClass}">
      <div class="card">${hubHtml()}
        <div class="reason">${esc(reason ?? t("wheel.nothing"))}</div>
        ${others ? `<div class="hint">${esc(t("wheel.try", { list: others }))}</div>` : ""}
      </div>${modesHtml()}</div>`;
    return;
  }

  const step = (Math.PI * 2) / items.length;
  const mid = (R_IN + R_OUT) / 2 + 2;
  let slices = "";
  let labels = "";
  items.forEach((item, i) => {
    const d = slicePath(i * step, (i + 1) * step);
    slices += `<path class="edge" d="${d}" stroke-width="${STROKE + 2}"/><path class="slice" data-i="${i}" d="${d}" stroke-width="${STROKE}"/>`;
    // with a single option the label sits at the top, where the pointer arrives
    const [lx, ly] = pt(mid, items.length === 1 ? 0 : (i + 0.5) * step);
    labels += `<div class="label" data-i="${i}" style="left:${lx}px;top:${ly}px">${optionIcon(item.id, 30)}<span>${esc(caption(item))}</span>${item.sub ? `<em>${esc(optionSub(item.sub))}</em>` : ""}</div>`;
  });
  root.innerHTML = `<div class="${stageClass}">
    <svg class="ring" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${DEFS}
      <g class="slices">${slices}</g>
      <circle class="hub-ring" cx="${C}" cy="${C}" r="${R_IN - 6}" filter="url(#glow)"/>
      <circle class="hub" cx="${C}" cy="${C}" r="${R_IN - 6}"/>
      <path class="pointer" d="" />
    </svg>
    ${labels}${hubHtml()}${modesHtml()}</div>`;
  paint();
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Highlight the hovered slice without rebuilding the DOM (keeps hover animations smooth). */
function paint() {
  root.querySelectorAll<HTMLElement>("[data-i]").forEach((el) => {
    el.classList.toggle("hot", Number(el.dataset.i) === hot);
  });
  // Size goals: the hub shows "148 MB → ≤ 25 MB" while a preset is hovered.
  const count = root.querySelector<HTMLElement>(".fcount");
  if (count && options) {
    const hovered = current()[hot];
    const sub = hovered?.id.startsWith("share:") ? hovered.sub : null;
    count.textContent = sub
      ? `${formatSize(options.total_size)} → ${sub}`
      : options.count > 1
        ? `${options.count} files`
        : formatSize(options.total_size);
    count.classList.toggle("goal", !!sub);
  }
  const pointer = root.querySelector<SVGPathElement>(".pointer");
  if (!pointer) return;
  const items = current();
  if (hot < 0 || hot >= items.length) {
    pointer.setAttribute("d", "");
    return;
  }
  // Small marker on the hub rim pointing at the hovered slice.
  const a = (hot + 0.5) * ((Math.PI * 2) / items.length);
  const [tx, ty] = pt(R_IN + 14, a);
  const [bx1, by1] = pt(R_IN + 1, a - 0.085);
  const [bx2, by2] = pt(R_IN + 1, a + 0.085);
  pointer.setAttribute("d", `M${tx} ${ty}L${bx1} ${by1}L${bx2} ${by2}Z`);
}

/** Slice index under a point given in CSS pixels, or -1 outside the ring. */
function hit(x: number, y: number): number {
  const items = current();
  if (items.length === 0) return -1;
  const dx = x - C;
  const dy = y - C;
  const r = Math.hypot(dx, dy);
  if (r < R_IN || r > R_OUT + 40) return -1;
  let angle = Math.atan2(dx, -dy);
  if (angle < 0) angle += Math.PI * 2;
  return Math.min(items.length - 1, Math.floor(angle / ((Math.PI * 2) / items.length)));
}

function pillAt(x: number, y: number): Mode | null {
  const pill = document.elementFromPoint(x, y)?.closest<HTMLElement>(".pill");
  return pill ? (pill.dataset.mode as Mode) : null;
}

function switchMode(next: Mode) {
  mode = next;
  hot = -1;
  render();
}

function reset() {
  paths = [];
  options = null;
  hot = -1;
  render();
}

function setHot(next: number) {
  if (next !== hot) {
    hot = next;
    paint();
  }
}

function toCss(position: { x: number; y: number }): [number, number] {
  const scale = window.devicePixelRatio || 1;
  return [position.x / scale, position.y / scale];
}

const log = (message: string) => void invoke("js_log", { message }).catch(() => {});
window.addEventListener("error", (e) => log(`error: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => log(`rejection: ${String(e.reason)}`));
log("wheel page started");
// If these fire, Chromium (not Tauri) is receiving the drag, which means no file paths.
for (const type of ["dragenter", "drop"]) window.addEventListener(type, () => log(`DOM ${type}`));

await initLanguage();
onLanguage(() => render());

await listen<string>("wheel-mode", (event) => {
  mode = event.payload as Mode;
  hot = -1;
  render();
});
await listen("wheel-reset", reset);

await getCurrentWebview().onDragDropEvent(async (event) => {
  const payload = event.payload;
  if (payload.type !== "over") log(`drag ${payload.type}`);
  switch (payload.type) {
    case "enter":
      paths = payload.paths;
      options = await getAllOptions(paths);
      hot = hit(...toCss(payload.position));
      render(true); // always draw on enter, even when the cursor is not on a slice yet
      break;
    case "over": {
      const [x, y] = toCss(payload.position);
      const pill = pillAt(x, y);
      if (pill) {
        // Hovering a mode pill switches mode, so the wheel works without holding any key.
        if (pill !== mode) switchMode(pill);
      } else {
        setHot(hit(x, y));
      }
      break;
    }
    case "leave":
      setHot(-1);
      break;
    case "drop": {
      const index = hit(...toCss(payload.position));
      const chosen = index >= 0 ? current()[index] : undefined;
      const dropped = payload.paths.length ? payload.paths : paths;
      reset();
      await hideWheel();
      if (chosen) await runOption(dropped, chosen.id);
      break;
    }
  }
});

render();







