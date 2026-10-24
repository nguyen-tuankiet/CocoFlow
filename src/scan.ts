// "Scan document" editor: four corner handles on a photographed page and a live straightened preview. Start renders
// the page at full size with the same engine and saves it next to the photo.

import type { Ctl } from "./editor";
import { t } from "./i18n";
import { outputSize, scaleQuad, scaleText } from "../website/src/scan/engine/geometry";
import { MAX_OUTPUT_SIDE, READABLE_SIDE } from "../website/src/scan/engine/limits";
import { analyze, analyzeWith, render } from "../website/src/scan/engine/pipeline";
import type { Look, Paper, Quad, TextArea } from "../website/src/scan/engine/types";
import { fromSmall, loadPhoto, renderAndSave, textFromSmall, type Photo } from "./scanrender";

type Pt = { x: number; y: number };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const area = (p: Pt[]) => Math.abs(p.reduce((s, a, i) => s + (a.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * a.y), 0)) / 2;

export async function scanEditor(path: string, body: HTMLElement, ctl: Ctl) {
  let photo: Photo;
  try {
    photo = await loadPhoto(path);
  } catch {
    throw new Error("The preview could not be shown");
  }
  const img = photo.img;
  // size of the picture in the coordinates of the corners (after the camera's rotation)
  const nw = photo.width;
  const nh = photo.height;
  const scale = Math.min(330 / nw, 430 / nh, 1);
  const sw = nw * scale;
  const sh = nh * scale;

  const root = document.createElement("div");
  root.className = "scan";
  root.innerHTML = `
    <div class="scan-pane">
      <div class="scan-stage" style="width:${sw}px;height:${sh}px">
        <img src="${esc(img.src)}" width="${sw}" height="${sh}" draggable="false" alt="">
        <svg class="scan-svg" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}">
          <path class="scan-dim" fill-rule="evenodd"></path>
          <polygon class="scan-poly"></polygon>
          ${[0, 1, 2, 3].map((i) => `<circle class="scan-h" data-i="${i}" r="8"></circle>`).join("")}
        </svg>
      </div>
    </div>
    <div class="scan-pane">
      <div class="scan-result"><canvas class="scan-out"></canvas></div>
      <div class="ed-note scan-size"></div>
    </div>`;
  body.appendChild(root);
  const controls = document.createElement("div");
  controls.innerHTML = `
    <div class="ed-row">
      <label>${esc(t("ed.scan.look"))}
        <select class="look">
          <option value="white">${esc(t("ed.scan.white"))}</option>
          <option value="color">${esc(t("ed.scan.color"))}</option>
          <option value="clear">${esc(t("ed.scan.clear"))}</option>
          <option value="bw">${esc(t("ed.scan.bw"))}</option>
        </select></label>
      <label>${esc(t("ed.scan.paper"))}
        <select class="paper">
          <option value="auto">${esc(t("ed.scan.paperAuto"))}</option>
          <option value="photo">${esc(t("ed.scan.paperPhoto"))}</option>
          <option value="a4p">${esc(t("ed.scan.a4p"))}</option>
          <option value="a4l">${esc(t("ed.scan.a4l"))}</option>
        </select></label>
      <button class="ghost find">${esc(t("ed.scan.auto"))}</button>
      <button class="ghost text" title="${esc(t("ed.scan.textTip"))}">${esc(t("ed.scan.text"))}</button>
      <button class="ghost reset">${esc(t("ed.scan.reset"))}</button>
    </div>
    <div class="ed-note scan-hint">${esc(t("ed.scan.hint"))}</div>`;
  body.appendChild(controls);

  const svg = root.querySelector<SVGSVGElement>(".scan-svg")!;
  const dim = svg.querySelector<SVGPathElement>(".scan-dim")!;
  const poly = svg.querySelector<SVGPolygonElement>(".scan-poly")!;
  const handles = [...svg.querySelectorAll<SVGCircleElement>(".scan-h")];
  const canvas = root.querySelector<HTMLCanvasElement>(".scan-out")!;
  const sizeNote = root.querySelector<HTMLElement>(".scan-size")!;
  const hint = controls.querySelector<HTMLElement>(".scan-hint")!;
  const lookSel = controls.querySelector<HTMLSelectElement>(".look")!;
  const paperSel = controls.querySelector<HTMLSelectElement>(".paper")!;

  // the small copy for the preview and the page finder
  const srcData = photo.small;
  const lookOf = (): Look => (lookSel.value === "clear" ? "clean" : (lookSel.value as Look));
  /** Where the text is (photo coordinates) when the page was found from it: the margins around it are cleaned. */
  let text: TextArea | undefined;

  const inset = (m = 0.06): Pt[] => [
    { x: nw * m, y: nh * m },
    { x: nw * (1 - m), y: nh * m },
    { x: nw * (1 - m), y: nh * (1 - m) },
    { x: nw * m, y: nh * (1 - m) },
  ];
  let pts = inset();

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), renderPreview()));
  };

  function renderPreview() {
    const { w, h } = outputSize(pts as Quad, paperSel.value as Paper, MAX_OUTPUT_SIDE, READABLE_SIDE);
    sizeNote.textContent = t("ed.scan.size", { w, h });
    // the same renderer as Start, on the small copy
    const k = srcData.width / nw;
    try {
      const r = render(srcData, { quad: scaleQuad(pts as Quad, k), text: scaleText(text, k), look: lookOf(), paper: paperSel.value as Paper, turns: 0, format: "jpeg", maxSide: 430 });
      canvas.width = r.width;
      canvas.height = r.height;
      canvas.getContext("2d")!.putImageData(new ImageData(r.data as unknown as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), 0, 0);
    } catch {
      /* an outline that cannot be straightened keeps the last picture */
    }
  }

  function draw() {
    const s = pts.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const list = s.map((p) => `${p.x},${p.y}`).join(" ");
    poly.setAttribute("points", list);
    dim.setAttribute("d", `M0 0H${sw}V${sh}H0Z M${s.map((p) => `${p.x} ${p.y}`).join(" L")} Z`);
    handles.forEach((h, i) => {
      h.setAttribute("cx", String(s[i].x));
      h.setAttribute("cy", String(s[i].y));
    });
    ctl.valid(area(pts) >= nw * nh * 0.01);
    schedule();
  }

  // drag a corner, or the whole shape
  const toPicture = (e: PointerEvent): Pt => {
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * nw, y: ((e.clientY - r.top) / r.height) * nh };
  };
  const margin = 0.15;
  const limit = (p: Pt): Pt => ({ x: clamp(p.x, -nw * margin, nw * (1 + margin)), y: clamp(p.y, -nh * margin, nh * (1 + margin)) });
  const grab = (el: Element, onMove: (p: Pt, from: Pt, start: Pt[]) => void) => {
    el.addEventListener("pointerdown", (ev) => {
      const e = ev as PointerEvent;
      e.preventDefault();
      e.stopPropagation();
      (el as Element).setPointerCapture(e.pointerId);
      const from = toPicture(e);
      const start = pts.map((p) => ({ ...p }));
      const move = (m: Event) => {
        onMove(toPicture(m as PointerEvent), from, start);
        draw();
      };
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  };
  handles.forEach((h) => {
    const i = Number(h.dataset.i);
    grab(h, (p) => (pts[i] = limit(p)));
  });
  grab(poly, (p, from, start) => {
    // keep the shape's size: stop at the edges instead of squashing it
    const dx = clamp(p.x - from.x, -nw * margin - Math.min(...start.map((q) => q.x)), nw * (1 + margin) - Math.max(...start.map((q) => q.x)));
    const dy = clamp(p.y - from.y, -nh * margin - Math.min(...start.map((q) => q.y)), nh * (1 + margin) - Math.max(...start.map((q) => q.y)));
    pts = start.map((q) => ({ x: q.x + dx, y: q.y + dy }));
  });

  let searching = 0;
  /** "auto": text lines and paper edges together. "text": the lines of text only. */
  const find = async (mode: "auto" | "text" = "auto") => {
    const token = ++searching;
    hint.textContent = t("ed.scan.searching");
    await new Promise((r) => setTimeout(r, 30)); // let the window paint first
    const place = (q: Quad) => fromSmall(photo, q).map(limit);
    let found: Pt[] | null = null;
    let foundText: TextArea | undefined;
    let message = t("ed.scan.noauto");
    if (mode === "auto") {
      const d = analyze(srcData);
      if (d.method !== "none") {
        found = place(d.quad);
        foundText = textFromSmall(photo, d.text);
        message = d.method === "edges" ? t("ed.scan.foundPage") : t("ed.scan.foundText");
      }
    } else {
      const q = analyzeWith(srcData, "text");
      if (q) {
        found = place(q);
        message = t("ed.scan.foundText");
      }
    }
    if (token !== searching) return;
    pts = found ?? inset();
    text = foundText;
    hint.textContent = message;
    draw();
  };
  controls.querySelector(".find")!.addEventListener("click", () => void find("auto"));
  controls.querySelector(".text")!.addEventListener("click", () => void find("text"));
  controls.querySelector(".reset")!.addEventListener("click", () => {
    pts = inset();
    text = undefined;
    hint.textContent = t("ed.scan.hint");
    draw();
  });
  lookSel.addEventListener("change", schedule);
  paperSel.addEventListener("change", schedule);

  draw();
  void find("auto");

  ctl.onRun(() => renderAndSave(path, photo, { quad: pts as Quad, text, look: lookOf(), paper: paperSel.value as Paper }));
}
