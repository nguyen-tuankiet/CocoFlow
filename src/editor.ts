// Option windows with a live preview: trim, split, crop, resize.

import { convertFileSrc } from "@tauri-apps/api/core";
import { MediaInfo, mediaInfo, pdfInfo, previewFile, runOption } from "./api";
import { icon } from "./icons";
import { getLang, t } from "./i18n";

export interface EditorRequest {
  paths: string[];
  kind: string;
  tool: string;
}

interface Ctl {
  /** Enable or disable the Start button. */
  valid(ok: boolean): void;
  /** Called when Start is pressed; returns the tool parameters. */
  onSubmit(fn: () => Record<string, string>): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function fmt(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "90", "1:30", "1:02:03.5" → seconds (NaN when invalid). */
function parseTime(text: string): number {
  const parts = text.trim().replace(",", ".").split(":");
  if (!text.trim() || parts.length > 3) return NaN;
  let total = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n) || n < 0) return NaN;
    total = total * 60 + n;
  }
  return total;
}

/** Pointer drag with capture; `move` gets the client coordinates. */
function drag(el: HTMLElement, move: (x: number, y: number, e: PointerEvent) => void, start?: (e: PointerEvent) => void) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    start?.(e);
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY, ev);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}

let overlay: HTMLElement | null = null;

export function closeEditor() {
  overlay?.remove();
  overlay = null;
  document.removeEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") closeEditor();
}

const TITLES: Record<string, string> = {
  trim: "ed.trim.title",
  crop: "ed.crop.title",
  split: "ed.split.title",
  resize: "ed.resize.title",
  transcribe: "ed.transcribe.title",
};

export async function openEditor(req: EditorRequest) {
  closeEditor();
  overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div class="dialog" role="dialog">
    <header><h3>${esc(t(TITLES[req.tool] ?? "ed.resize.title"))} <small>${esc(baseName(req.paths[0]))}${req.paths.length > 1 ? ` +${req.paths.length - 1}` : ""}</small></h3><button class="x" aria-label="Close">✕</button></header>
    <div class="ed-body"><div class="ed-loading">${esc(t("ed.loading"))}</div></div>
    <footer><span class="ed-msg"></span><button class="ghost cancel">${esc(t("ed.cancel"))}</button><button class="primary go" disabled>${esc(t("ed.start"))}</button></footer>
  </div>`;
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey);
  const root = overlay;
  root.addEventListener("pointerdown", (e) => {
    if (e.target === root) closeEditor();
  });
  root.querySelector(".x")!.addEventListener("click", closeEditor);
  root.querySelector(".cancel")!.addEventListener("click", closeEditor);

  const body = root.querySelector<HTMLElement>(".ed-body")!;
  const go = root.querySelector<HTMLButtonElement>(".go")!;
  const msg = root.querySelector<HTMLElement>(".ed-msg")!;
  let submit: (() => Record<string, string>) | null = null;
  const ctl: Ctl = {
    valid: (ok) => (go.disabled = !ok),
    onSubmit: (fn) => (submit = fn),
  };
  go.addEventListener("click", async () => {
    if (!submit) return;
    go.disabled = true;
    try {
      await runOption(req.paths, `${req.tool === "transcribe" ? "ai" : "tool"}:${req.tool}`, submit());
      closeEditor();
    } catch (e) {
      msg.textContent = String(e);
      go.disabled = false;
    }
  });

  try {
    body.innerHTML = "";
    const first = req.paths[0];
    if (req.tool === "resize") await resizeEditor(req, body, ctl);
    else if (req.tool === "transcribe") transcribeEditor(body, ctl);
    else if (req.tool === "crop") await cropEditor(first, req.kind, body, ctl);
    else if (req.tool === "trim") await timeEditor(first, req.kind, body, ctl, "trim");
    else if (req.tool === "split" && req.kind === "pdf") await pdfSplitEditor(first, body, ctl);
    else if (req.tool === "split") await timeEditor(first, req.kind, body, ctl, "split");
  } catch (e) {
    body.innerHTML = `<div class="ed-error">${esc(t("ed.error", { msg: String(e) }))}</div>`;
  }
}

// ------------------------------------------------------------------ media player + timeline

async function loadMedia(path: string, kind: string) {
  const [info, preview] = await Promise.all([mediaInfo(path), previewFile(path)]);
  const direct = preview === path;
  const src = convertFileSrc(preview);
  const el = document.createElement(kind === "audio" ? "audio" : "video") as HTMLMediaElement;
  el.src = src;
  el.preload = "auto";
  if (el instanceof HTMLVideoElement) el.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    el.addEventListener("loadedmetadata", () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new Error("The preview could not be played")), { once: true });
  });
  const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (info.duration ?? 0);
  return { el, info, duration, direct };
}

function timeline(duration: number, el: HTMLMediaElement) {
  const root = document.createElement("div");
  root.className = "tl";
  root.innerHTML = `<div class="track"><div class="range"></div><div class="marks"></div><div class="head"></div></div>`;
  const track = root.querySelector<HTMLElement>(".track")!;
  const head = root.querySelector<HTMLElement>(".head")!;
  const toTime = (x: number) => {
    const r = track.getBoundingClientRect();
    return clamp(((x - r.left) / r.width) * duration, 0, duration);
  };
  const pct = (time: number) => `${(clamp(time, 0, duration) / duration) * 100}%`;
  const update = () => (head.style.left = pct(el.currentTime));
  el.addEventListener("timeupdate", update);
  el.addEventListener("seeked", update);
  let raf = 0;
  el.addEventListener("play", () => {
    const tick = () => {
      update();
      raf = requestAnimationFrame(tick);
    };
    tick();
  });
  el.addEventListener("pause", () => cancelAnimationFrame(raf));
  drag(track, (x) => (el.currentTime = toTime(x)), (e) => (el.currentTime = toTime(e.clientX)));
  return { root, track, toTime, pct, update };
}

function playButton(el: HTMLMediaElement, label: HTMLElement, duration: number) {
  const btn = document.createElement("button");
  btn.className = "ghost play";
  const refresh = () => (btn.innerHTML = el.paused ? "▶" : "⏸");
  btn.addEventListener("click", () => (el.paused ? void el.play() : el.pause()));
  el.addEventListener("play", refresh);
  el.addEventListener("pause", refresh);
  el.addEventListener("timeupdate", () => (label.textContent = `${fmt(el.currentTime)} / ${fmt(duration)}`));
  refresh();
  label.textContent = `0:00.0 / ${fmt(duration)}`;
  return btn;
}

async function timeEditor(path: string, kind: string, body: HTMLElement, ctl: Ctl, mode: "trim" | "split") {
  const { el, duration } = await loadMedia(path, kind);
  const stage = document.createElement("div");
  stage.className = kind === "audio" ? "stage audio" : "stage";
  if (kind === "audio") stage.innerHTML = `<div class="audio-art">${icon("audio", 56)}</div>`;
  stage.appendChild(el);
  const tl = timeline(duration, el);
  const label = document.createElement("span");
  label.className = "time";
  const bar = document.createElement("div");
  bar.className = "ed-row";
  bar.append(playButton(el, label, duration), label);
  body.append(stage, tl.root, bar);

  const fast = `<label class="check"><input type="checkbox" class="fast"> <span>${esc(t("ed.fast"))}</span></label>`;

  if (mode === "trim") {
    let start = 0;
    let end = duration;
    const range = tl.root.querySelector<HTMLElement>(".range")!;
    const hs = document.createElement("div");
    const he = document.createElement("div");
    hs.className = "handle start";
    he.className = "handle end";
    tl.track.append(hs, he);
    const controls = document.createElement("div");
    controls.innerHTML = `
      <div class="ed-row">
        <label>${esc(t("ed.trim.from"))} <input class="in-start" size="9"></label>
        <label>${esc(t("ed.trim.to"))} <input class="in-end" size="9"></label>
        <button class="ghost set-start">${esc(t("ed.trim.setStart"))}</button>
        <button class="ghost set-end">${esc(t("ed.trim.setEnd"))}</button>
        <button class="ghost play-sel">${esc(t("ed.trim.play"))}</button>
      </div>
      <div class="ed-note sel"></div>${fast}`;
    body.appendChild(controls);
    const inStart = controls.querySelector<HTMLInputElement>(".in-start")!;
    const inEnd = controls.querySelector<HTMLInputElement>(".in-end")!;
    const sel = controls.querySelector<HTMLElement>(".sel")!;
    const redraw = () => {
      hs.style.left = tl.pct(start);
      he.style.left = tl.pct(end);
      range.style.left = tl.pct(start);
      range.style.width = `${((end - start) / duration) * 100}%`;
      inStart.value = fmt(start);
      inEnd.value = fmt(end);
      sel.textContent = t("ed.trim.selection", { len: fmt(end - start), total: fmt(duration) });
      ctl.valid(end - start >= 0.1);
    };
    drag(hs, (x) => {
      start = clamp(tl.toTime(x), 0, end - 0.1);
      el.currentTime = start;
      redraw();
    });
    drag(he, (x) => {
      end = clamp(tl.toTime(x), start + 0.1, duration);
      el.currentTime = end;
      redraw();
    });
    const commit = () => {
      const s = parseTime(inStart.value);
      const e = parseTime(inEnd.value);
      if (Number.isFinite(s)) start = clamp(s, 0, duration - 0.1);
      if (Number.isFinite(e)) end = clamp(e, start + 0.1, duration);
      redraw();
    };
    inStart.addEventListener("change", commit);
    inEnd.addEventListener("change", commit);
    controls.querySelector(".set-start")!.addEventListener("click", () => {
      start = clamp(el.currentTime, 0, end - 0.1);
      redraw();
    });
    controls.querySelector(".set-end")!.addEventListener("click", () => {
      end = clamp(el.currentTime, start + 0.1, duration);
      redraw();
    });
    controls.querySelector(".play-sel")!.addEventListener("click", () => {
      el.currentTime = start;
      void el.play();
      const stop = () => {
        if (el.currentTime >= end) {
          el.pause();
          el.removeEventListener("timeupdate", stop);
        }
      };
      el.addEventListener("timeupdate", stop);
    });
    redraw();
    ctl.onSubmit(() => ({
      start: start.toFixed(3),
      end: end < duration - 0.05 ? end.toFixed(3) : "",
      fast: controls.querySelector<HTMLInputElement>(".fast")!.checked ? "1" : "0",
    }));
    return;
  }

  // split
  let markers: number[] = [];
  let splitMode: "every" | "points" = "every";
  const controls = document.createElement("div");
  controls.innerHTML = `
    <div class="ed-row">
      <label class="radio"><input type="radio" name="sm" value="every" checked> ${esc(t("ed.split.every"))}
        <input class="in-every" type="number" min="1" step="1" value="${Math.max(1, Math.round(duration / 2))}" size="5"> ${esc(t("ed.split.seconds"))}</label>
      <label class="radio"><input type="radio" name="sm" value="points"> ${esc(t("ed.split.atMarkers"))}</label>
      <button class="ghost add-marker">${esc(t("ed.split.addMarker"))}</button>
    </div>
    <div class="chips markers"></div>
    <div class="ed-note parts"></div>${fast}`;
  body.appendChild(controls);
  const everyInput = controls.querySelector<HTMLInputElement>(".in-every")!;
  const chips = controls.querySelector<HTMLElement>(".markers")!;
  const parts = controls.querySelector<HTMLElement>(".parts")!;
  const marks = tl.root.querySelector<HTMLElement>(".marks")!;
  const redraw = () => {
    marks.innerHTML = "";
    const cuts = splitMode === "every" ? everyCuts() : markers;
    cuts.forEach((m) => {
      const line = document.createElement("div");
      line.className = "mark";
      line.style.left = tl.pct(m);
      marks.appendChild(line);
    });
    chips.innerHTML = markers.length
      ? markers.map((m, i) => `<span class="chip">${fmt(m)} <button data-i="${i}" aria-label="remove">✕</button></span>`).join("")
      : `<span class="muted">${esc(t("ed.split.noMarkers"))}</span>`;
    chips.style.opacity = splitMode === "points" ? "1" : "0.5";
    const n = cuts.length + 1;
    parts.textContent = t("ed.split.parts", { n });
    ctl.valid(splitMode === "every" ? Number(everyInput.value) >= 1 && cuts.length > 0 : markers.length > 0);
  };
  const everyCuts = () => {
    const every = Number(everyInput.value);
    const cuts: number[] = [];
    if (every >= 1) for (let c = every; c < duration - 0.05 && cuts.length < 500; c += every) cuts.push(c);
    return cuts;
  };
  controls.querySelectorAll<HTMLInputElement>("input[name=sm]").forEach((r) =>
    r.addEventListener("change", () => {
      splitMode = r.value as "every" | "points";
      redraw();
    }),
  );
  everyInput.addEventListener("input", redraw);
  controls.querySelector(".add-marker")!.addEventListener("click", () => {
    const m = Number(el.currentTime.toFixed(3));
    if (m > 0.05 && m < duration - 0.05 && !markers.includes(m)) markers = [...markers, m].sort((a, b) => a - b);
    splitMode = "points";
    controls.querySelector<HTMLInputElement>("input[value=points]")!.checked = true;
    redraw();
  });
  chips.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    if (b) {
      markers = markers.filter((_, i) => i !== Number(b.dataset.i));
      redraw();
    }
  });
  redraw();
  ctl.onSubmit(() => ({
    mode: splitMode,
    every: everyInput.value,
    points: markers.map((m) => m.toFixed(3)).join(","),
    fast: controls.querySelector<HTMLInputElement>(".fast")!.checked ? "1" : "0",
  }));
}

// ------------------------------------------------------------------ crop

type Rect = { x: number; y: number; w: number; h: number };

async function cropEditor(path: string, kind: string, body: HTMLElement, ctl: Ctl) {
  const preview = await previewFile(path);
  const direct = preview === path;
  const info: MediaInfo = await mediaInfo(path);
  const src = convertFileSrc(preview);
  const isVideo = kind === "video";

  const stage = document.createElement("div");
  stage.className = "cropstage";
  const media: HTMLImageElement | HTMLVideoElement = isVideo ? document.createElement("video") : document.createElement("img");
  media.src = src;
  media.draggable = false;
  if (media instanceof HTMLVideoElement) {
    media.muted = true;
    media.preload = "auto";
  }
  stage.appendChild(media);
  const box = document.createElement("div");
  box.className = "cropbox";
  box.innerHTML = ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => `<i class="ch ${h}" data-h="${h}"></i>`).join("");
  stage.appendChild(box);
  body.appendChild(stage);

  await new Promise<void>((resolve, reject) => {
    media.addEventListener(isVideo ? "loadedmetadata" : "load", () => resolve(), { once: true });
    media.addEventListener("error", () => reject(new Error("The preview could not be shown")), { once: true });
  });

  // Size of the picture in the coordinates ffmpeg uses (after rotation).
  let nw: number;
  let nh: number;
  if (media instanceof HTMLVideoElement) {
    const vw = media.videoWidth;
    const vh = media.videoHeight;
    if (direct || info.width === 0) {
      nw = vw;
      nh = vh;
    } else {
      const same = Math.abs(info.width / info.height - vw / vh) < Math.abs(info.height / info.width - vw / vh);
      nw = same ? info.width : info.height;
      nh = same ? info.height : info.width;
    }
  } else if (direct) {
    nw = media.naturalWidth;
    nh = media.naturalHeight;
  } else {
    nw = info.width || media.naturalWidth;
    nh = info.height || media.naturalHeight;
  }
  const scale = Math.min(640 / nw, 360 / nh, 1);
  media.style.width = `${nw * scale}px`;
  media.style.height = `${nh * scale}px`;
  stage.style.width = `${nw * scale}px`;
  stage.style.height = `${nh * scale}px`;

  let scrub: HTMLInputElement | null = null;
  if (media instanceof HTMLVideoElement) {
    const row = document.createElement("div");
    row.className = "ed-row";
    row.innerHTML = `<label class="grow">${esc(t("ed.crop.frame"))} <input type="range" class="scrub" min="0" max="${media.duration || info.duration || 1}" step="0.1" value="0"></label>`;
    body.appendChild(row);
    scrub = row.querySelector<HTMLInputElement>(".scrub")!;
    scrub.addEventListener("input", () => (media.currentTime = Number(scrub!.value)));
  }

  const controls = document.createElement("div");
  controls.innerHTML = `
    <div class="ed-row">
      <label>${esc(t("ed.crop.aspect"))}
        <select class="aspect">
          <option value="free">${esc(t("ed.crop.free"))}</option>
          <option value="orig">${esc(t("ed.crop.original"))}</option>
          <option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option>
          <option value="4:3">4:3</option><option value="3:4">3:4</option><option value="3:2">3:2</option><option value="4:5">4:5</option>
        </select></label>
      <label>X <input class="f-x" type="number" min="0" size="5"></label>
      <label>Y <input class="f-y" type="number" min="0" size="5"></label>
      <label>W <input class="f-w" type="number" min="2" size="5"></label>
      <label>H <input class="f-h" type="number" min="2" size="5"></label>
    </div>
    <div class="ed-note">${esc(t("ed.crop.hint"))} <b class="dims"></b></div>`;
  body.appendChild(controls);
  const sel = controls.querySelector<HTMLSelectElement>(".aspect")!;
  const field = (n: string) => controls.querySelector<HTMLInputElement>(`.f-${n}`)!;

  let rect: Rect = { x: 0, y: 0, w: nw, h: nh };
  const ratio = (): number | null => {
    if (sel.value === "free") return null;
    if (sel.value === "orig") return nw / nh;
    const [a, b] = sel.value.split(":").map(Number);
    return a / b;
  };
  const MIN = 16;
  /** Keeps the box inside the picture (and in ratio when locked). */
  const fit = (r: Rect, anchor: "tl" | "center" = "tl"): Rect => {
    const k = ratio();
    let { x, y, w, h } = r;
    w = clamp(w, MIN, nw);
    h = clamp(h, MIN, nh);
    if (k) {
      if (w / h > k) w = h * k;
      else h = w / k;
      if (w > nw) {
        w = nw;
        h = w / k;
      }
      if (h > nh) {
        h = nh;
        w = h * k;
      }
    }
    if (anchor === "center") {
      x = r.x + (r.w - w) / 2;
      y = r.y + (r.h - h) / 2;
    }
    return { x: clamp(x, 0, nw - w), y: clamp(y, 0, nh - h), w, h };
  };
  const draw = () => {
    box.style.left = `${rect.x * scale}px`;
    box.style.top = `${rect.y * scale}px`;
    box.style.width = `${rect.w * scale}px`;
    box.style.height = `${rect.h * scale}px`;
    field("x").value = String(Math.round(rect.x));
    field("y").value = String(Math.round(rect.y));
    field("w").value = String(Math.round(rect.w));
    field("h").value = String(Math.round(rect.h));
    controls.querySelector(".dims")!.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}  (${nw} × ${nh})`;
    ctl.valid(rect.w >= 2 && rect.h >= 2);
  };
  sel.addEventListener("change", () => {
    rect = fit({ ...rect, w: nw, h: nh, x: 0, y: 0 }, "center");
    draw();
  });
  for (const n of ["x", "y", "w", "h"] as const) {
    field(n).addEventListener("change", () => {
      const v = Number(field(n).value);
      if (!Number.isFinite(v)) return draw();
      const next = { ...rect, [n]: v } as Rect;
      const k = ratio();
      if (k && n === "w") next.h = next.w / k;
      if (k && n === "h") next.w = next.h * k;
      rect = fit(next);
      draw();
    });
  }

  // move the box
  let origin = rect;
  let startX = 0;
  let startY = 0;
  drag(
    box,
    (x, y) => {
      rect = fit({ ...origin, x: origin.x + (x - startX) / scale, y: origin.y + (y - startY) / scale });
      draw();
    },
    (e) => {
      origin = rect;
      startX = e.clientX;
      startY = e.clientY;
    },
  );
  // resize with the handles
  box.querySelectorAll<HTMLElement>(".ch").forEach((h) => {
    const dir = h.dataset.h!;
    drag(
      h,
      (x, y) => {
        const dx = (x - startX) / scale;
        const dy = (y - startY) / scale;
        let { x: rx, y: ry, w, h: rh } = origin;
        if (dir.includes("e")) w = origin.w + dx;
        if (dir.includes("s")) rh = origin.h + dy;
        if (dir.includes("w")) {
          w = origin.w - dx;
          rx = origin.x + dx;
        }
        if (dir.includes("n")) {
          rh = origin.h - dy;
          ry = origin.y + dy;
        }
        const k = ratio();
        if (k) {
          if (dir === "e" || dir === "w") rh = w / k;
          else if (dir === "n" || dir === "s") w = rh * k;
          else rh = w / k;
          if (dir.includes("w")) rx = origin.x + origin.w - w;
          if (dir.includes("n")) ry = origin.y + origin.h - rh;
          if (dir === "e" || dir === "w") ry = origin.y + (origin.h - rh) / 2;
          if (dir === "n" || dir === "s") rx = origin.x + (origin.w - w) / 2;
        }
        rect = fit({ x: rx, y: ry, w, h: rh });
        draw();
      },
      (e) => {
        origin = rect;
        startX = e.clientX;
        startY = e.clientY;
      },
    );
  });
  draw();
  ctl.onSubmit(() => ({
    x: String(Math.round(rect.x)),
    y: String(Math.round(rect.y)),
    w: String(Math.round(rect.w)),
    h: String(Math.round(rect.h)),
  }));
}

// ------------------------------------------------------------------ resize

async function resizeEditor(req: EditorRequest, body: HTMLElement, ctl: Ctl) {
  let source: [number, number] | null = null;
  if (req.paths.length === 1) {
    try {
      const info = await mediaInfo(req.paths[0]);
      if (info.width > 0) source = [info.width, info.height];
    } catch {
      /* the preview is optional */
    }
  }
  const box = document.createElement("div");
  box.innerHTML = `
    <div class="ed-row seg">
      <label class="radio"><input type="radio" name="rm" value="size" checked> ${esc(t("ed.resize.bySize"))}</label>
      <label class="radio"><input type="radio" name="rm" value="percent"> ${esc(t("ed.resize.byPercent"))}</label>
    </div>
    <div class="ed-row by-size">
      <label>${esc(t("ed.resize.width"))} <input class="r-w" type="number" min="1" size="6" placeholder="1920"></label>
      <label>${esc(t("ed.resize.height"))} <input class="r-h" type="number" min="1" size="6"></label>
      <span class="presets">${[3840, 1920, 1280, 1080, 720, 480].map((n) => `<button class="chipbtn" data-w="${n}">${n}</button>`).join("")}</span>
    </div>
    <div class="ed-row by-percent" hidden>
      <label>${esc(t("ed.resize.percent"))} <input class="r-p" type="number" min="1" max="1000" value="50" size="6"> %</label>
      <span class="presets">${[75, 50, 33, 25].map((n) => `<button class="chipbtn" data-p="${n}">${n}%</button>`).join("")}</span>
    </div>
    <div class="ed-note">${esc(t("ed.resize.note"))}</div>
    <div class="ed-note result"></div>
    ${req.paths.length > 1 ? `<div class="ed-note">${esc(t("ed.resize.files", { n: req.paths.length }))}</div>` : ""}`;
  body.appendChild(box);
  const q = <T extends HTMLElement>(s: string) => box.querySelector<T>(s)!;
  const rw = q<HTMLInputElement>(".r-w");
  const rh = q<HTMLInputElement>(".r-h");
  const rp = q<HTMLInputElement>(".r-p");
  const result = q(".result");
  let mode: "size" | "percent" = "size";
  const refresh = () => {
    q(".by-size").hidden = mode !== "size";
    q(".by-percent").hidden = mode !== "percent";
    let ok: boolean;
    let outW = 0;
    let outH = 0;
    if (mode === "percent") {
      const p = Number(rp.value);
      ok = p > 0 && p <= 1000;
      if (source && ok) [outW, outH] = [Math.round((source[0] * p) / 100), Math.round((source[1] * p) / 100)];
    } else {
      const w = Number(rw.value) || 0;
      const h = Number(rh.value) || 0;
      ok = w > 0 || h > 0;
      if (source && ok) {
        const [sw, sh] = source;
        const k = Math.min(w > 0 ? Math.min(w, sw) / sw : Infinity, h > 0 ? Math.min(h, sh) / sh : Infinity, 1);
        [outW, outH] = [Math.round(sw * k), Math.round(sh * k)];
      }
    }
    result.textContent = source && ok ? `${source[0]} × ${source[1]} → ${t("ed.resize.result", { w: outW, h: outH })}` : "";
    ctl.valid(ok);
  };
  box.querySelectorAll<HTMLInputElement>("input[name=rm]").forEach((r) =>
    r.addEventListener("change", () => {
      mode = r.value as "size" | "percent";
      refresh();
    }),
  );
  [rw, rh, rp].forEach((i) => i.addEventListener("input", refresh));
  box.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-w],[data-p]");
    if (!b) return;
    if (b.dataset.w) {
      rw.value = b.dataset.w;
      rh.value = "";
    } else {
      rp.value = b.dataset.p!;
    }
    refresh();
  });
  refresh();
  ctl.onSubmit((): Record<string, string> => (mode === "percent" ? { percent: rp.value } : { w: rw.value, h: rh.value }));
}

// ------------------------------------------------------------------ PDF split

async function pdfSplitEditor(path: string, body: HTMLElement, ctl: Ctl) {
  const info = await pdfInfo(path);
  const picker = document.createElement("div");
  picker.innerHTML = `
    <div class="ed-row">
      <label class="radio"><input type="radio" name="pm" value="each" checked> ${esc(t("ed.pdf.each"))}</label>
      <label class="radio"><input type="radio" name="pm" value="extract"> ${esc(t("ed.pdf.extract"))}</label>
      <label class="radio"><input type="radio" name="pm" value="ranges"> ${esc(t("ed.pdf.ranges"))}</label>
    </div>
    <div class="ed-row"><input class="pages" placeholder="1-3,5,8-" size="24"> <span class="ed-note count"></span></div>
    <div class="ed-note">${esc(t("ed.pdf.pickHint"))}${info.thumbs.length < info.pages ? " " + esc(t("ed.pdf.first", { n: info.thumbs.length })) : ""}</div>
    <div class="thumbs">${info.thumbs
      .map((p, i) => `<figure data-p="${i + 1}"><img src="${convertFileSrc(p)}" draggable="false"><figcaption>${i + 1}</figcaption></figure>`)
      .join("")}</div>`;
  body.appendChild(picker);
  const input = picker.querySelector<HTMLInputElement>(".pages")!;
  const count = picker.querySelector<HTMLElement>(".count")!;
  const grid = picker.querySelector<HTMLElement>(".thumbs")!;
  let mode: "each" | "extract" | "ranges" = "each";
  const selected = new Set<number>();
  let last = 0;

  const toText = () => {
    const pages = [...selected].sort((a, b) => a - b);
    const out: string[] = [];
    for (let i = 0; i < pages.length; ) {
      let j = i;
      while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
      out.push(j > i ? `${pages[i]}-${pages[j]}` : `${pages[i]}`);
      i = j + 1;
    }
    return out.join(",");
  };
  const refresh = () => {
    grid.querySelectorAll<HTMLElement>("figure").forEach((f) => f.classList.toggle("on", selected.has(Number(f.dataset.p))));
    input.disabled = mode === "each";
    count.textContent = t("ed.pdf.pages", { n: info.pages });
    const text = input.value.trim();
    ctl.valid(mode === "each" || /^[0-9,\-\s]+$/.test(text) && text.length > 0);
  };
  picker.querySelectorAll<HTMLInputElement>("input[name=pm]").forEach((r) =>
    r.addEventListener("change", () => {
      mode = r.value as typeof mode;
      if (mode !== "each" && !input.value) input.value = toText();
      refresh();
    }),
  );
  input.addEventListener("input", refresh);
  grid.addEventListener("click", (e) => {
    const fig = (e.target as HTMLElement).closest<HTMLElement>("figure");
    if (!fig) return;
    const page = Number(fig.dataset.p);
    if ((e as MouseEvent).shiftKey && last) {
      for (let p = Math.min(last, page); p <= Math.max(last, page); p++) selected.add(p);
    } else if (selected.has(page)) selected.delete(page);
    else selected.add(page);
    last = page;
    if (mode === "each") {
      mode = "extract";
      picker.querySelector<HTMLInputElement>("input[value=extract]")!.checked = true;
    }
    input.value = toText();
    refresh();
  });
  refresh();
  ctl.onSubmit(() => ({ mode, pages: input.value.trim() }));
}


// ------------------------------------------------------------------ subtitles (offline speech recognition)

const SPOKEN_LANGUAGES: [string, string][] = [
  ["vi", "Tiếng Việt"], ["en", "English"], ["zh", "中文"], ["ja", "日本語"], ["ko", "한국어"], ["fr", "Français"],
  ["de", "Deutsch"], ["es", "Español"], ["th", "ภาษาไทย"], ["id", "Bahasa Indonesia"], ["ru", "Русский"],
];

function transcribeEditor(body: HTMLElement, ctl: Ctl) {
  const box = document.createElement("div");
  box.className = "ed-form";
  box.innerHTML = `
    <div class="ed-row">
      <label>${esc(t("ed.tr.language"))}
        <select class="tr-lang">
          <option value="auto">${esc(t("ed.tr.auto"))}</option>
          ${SPOKEN_LANGUAGES.map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="ed-row">
      <span class="ed-note">${esc(t("ed.tr.formats"))}:</span>
      <label class="check"><input type="checkbox" class="f-srt" checked> ${esc(t("ed.tr.srt"))}</label>
      <label class="check"><input type="checkbox" class="f-vtt"> ${esc(t("ed.tr.vtt"))}</label>
      <label class="check"><input type="checkbox" class="f-txt"> ${esc(t("ed.tr.txt"))}</label>
    </div>
    <div class="ed-row"><label class="check"><input type="checkbox" class="tr-translate"> ${esc(t("ed.tr.translate"))}</label></div>
    <div class="ed-note">${esc(t("ed.tr.note"))}</div>`;
  body.appendChild(box);
  const lang = box.querySelector<HTMLSelectElement>(".tr-lang")!;
  lang.value = getLang() === "vi" ? "vi" : "auto";
  const checked = (c: string) => box.querySelector<HTMLInputElement>(c)!.checked;
  const formats = () => ["srt", "vtt", "txt"].filter((f) => checked(`.f-${f}`));
  const refresh = () => ctl.valid(formats().length > 0);
  box.addEventListener("change", refresh);
  refresh();
  ctl.onSubmit(() => ({
    language: lang.value,
    formats: formats().join(","),
    translate: checked(".tr-translate") ? "1" : "0",
  }));
}
