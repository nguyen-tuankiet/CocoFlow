import { boxBlur } from "./filters";
import { clamp, defaultQuad, isValidQuad, polygonArea, scaleQuad } from "./geometry";
import { apply3, backToPhoto, findTextPage, marginsWithinPaper, pageAround } from "./rectify";
import type { Margins, TextPage } from "./rectify";
import type { Detection, Pt, Quad, Raster } from "./types";

export interface Gray {
  gray: Uint8Array;
  width: number;
  height: number;
}

export function toGray(r: Raster): Gray {
  const n = r.width * r.height;
  const gray = new Uint8Array(n);
  const d = r.data;
  for (let i = 0; i < n; i++) gray[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
  return { gray, width: r.width, height: r.height };
}

/** Box-average downscale so that the width is at most `targetW` (no change when already small). */
export function downscaleGray(g: Gray, targetW: number): Gray {
  if (g.width <= targetW) return g;
  const k = g.width / targetW;
  const W = targetW;
  const H = Math.max(8, Math.round(g.height / k));
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * k);
    const y1 = Math.min(g.height, Math.max(y0 + 1, Math.floor((y + 1) * k)));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * k);
      const x1 = Math.min(g.width, Math.max(x0 + 1, Math.floor((x + 1) * k)));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += g.gray[yy * g.width + xx];
      out[y * W + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return { gray: out, width: W, height: H };
}

/** Largest bright area (the paper) as a 0/1 mask with its size, or null when there is none of a page-like size. */
function brightArea(g: Gray): { mask: Uint8Array; size: number } | null {
  const { gray, width: W, height: H } = g;
  const r = Math.max(2, Math.round(Math.max(W, H) / 80));
  const lum = boxBlur(Float32Array.from(gray), W, H, r);

  // Otsu threshold between "paper" and "background"
  const hist = new Array<number>(256).fill(0);
  for (const v of lum) hist[clamp(Math.round(v), 0, 255)]++;
  const total = W * H;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      thr = i;
    }
  }

  // largest bright connected area
  const label = new Int32Array(W * H);
  let bestLabel = 0;
  let bestSize = 0;
  let next = 0;
  const stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (label[s] || lum[s] <= thr) continue;
    next++;
    let size = 0;
    stack.push(s);
    label[s] = next;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % W;
      const y = (p - x) / W;
      if (x > 0 && !label[p - 1] && lum[p - 1] > thr) (label[p - 1] = next), stack.push(p - 1);
      if (x < W - 1 && !label[p + 1] && lum[p + 1] > thr) (label[p + 1] = next), stack.push(p + 1);
      if (y > 0 && !label[p - W] && lum[p - W] > thr) (label[p - W] = next), stack.push(p - W);
      if (y < H - 1 && !label[p + W] && lum[p + W] > thr) (label[p + W] = next), stack.push(p + W);
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = next;
    }
  }
  if (!bestLabel || bestSize < total * 0.15 || bestSize > total * 0.93) return null;
  const mask = new Uint8Array(total);
  for (let p = 0; p < total; p++) if (label[p] === bestLabel) mask[p] = 1;
  return { mask, size: bestSize };
}

/**
 * Looks for a bright page on a darker background: the largest bright area after smoothing (so printed text melts
 * into the paper), reduced to its four extreme corners. Returns the corners in the pixels of `g`, or null when the
 * photo has no page-shaped area (for instance when the page fills the frame).
 */
export function detectPageEdges(g: Gray): Quad | null {
  const { width: W, height: H } = g;
  const area = brightArea(g);
  if (!area) return null;
  // extreme points: smallest/largest x+y and x-y
  let tl = { v: Infinity, x: 0, y: 0 };
  let br = { v: -Infinity, x: 0, y: 0 };
  let tr = { v: -Infinity, x: 0, y: 0 };
  let bl = { v: Infinity, x: 0, y: 0 };
  for (let p = 0; p < W * H; p++) {
    if (!area.mask[p]) continue;
    const x = p % W;
    const y = (p - x) / W;
    if (x + y < tl.v) tl = { v: x + y, x, y };
    if (x + y > br.v) br = { v: x + y, x, y };
    if (x - y > tr.v) tr = { v: x - y, x, y };
    if (x - y < bl.v) bl = { v: x - y, x, y };
  }
  const q = [tl, tr, br, bl].map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 })) as Quad;
  const qa = polygonArea(q);
  // a page is close to a quadrilateral; shadows or a hand merged into the area make it ragged
  if (qa < W * H * 0.2 || area.size / qa < 0.72) return null;
  return q;
}

/**
 * Where text can be, when the whole page is in the photo: inside its outline, drawn in from the edge by about a
 * character so that the border between the paper and the table is not mistaken for ink. Null when the page edges
 * are not (all) visible, in which case any part of the photo may hold text.
 */
export function paperRegion(g: Gray): Uint8Array | null {
  const { width: W, height: H } = g;
  const q = detectPageEdges(g);
  if (!q || q.some((p) => p.x < W * 0.02 || p.x > W * 0.98 || p.y < H * 0.02 || p.y > H * 0.98)) return null;
  // pixels inside the (convex) outline
  const inside = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ok = true;
      let sign = 0;
      for (let i = 0; i < 4 && ok; i++) {
        const a = q[i];
        const b = q[(i + 1) % 4];
        const cross = (b.x - a.x) * (y + 0.5 - a.y) - (b.y - a.y) * (x + 0.5 - a.x);
        const s = Math.sign(cross);
        if (sign && s && s !== sign) ok = false;
        if (s) sign = s;
      }
      if (ok) inside[y * W + x] = 1;
    }
  }
  const r = Math.max(3, Math.round(W / 45));
  const erode = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length);
    const n = horizontal ? W : H;
    const lines = horizontal ? H : W;
    for (let l = 0; l < lines; l++) {
      const set = (i: number) => src[horizontal ? l * W + i : i * W + l];
      const forward = new Int32Array(n);
      const backward = new Int32Array(n);
      let run = 0;
      for (let i = 0; i < n; i++) forward[i] = set(i) ? ++run : (run = 0);
      run = 0;
      for (let i = n - 1; i >= 0; i--) backward[i] = set(i) ? ++run : (run = 0);
      for (let i = 0; i < n; i++) if (forward[i] > r && backward[i] > r) out[horizontal ? l * W + i : i * W + l] = 1;
    }
    return out;
  };
  return erode(erode(inside, true), false);
}

const touchesBorder = (q: Quad, w: number, h: number) => q.some((p) => p.x < w * 0.02 || p.x > w * 0.98 || p.y < h * 0.02 || p.y > h * 0.98);

/** Corners from the page edges, in the pixels of `src`; null when no page is found. */
export function detectByEdges(src: Raster): Quad | null {
  const g = downscaleGray(toGray(src), 560);
  const q = detectPageEdges(g);
  return q ? scaleQuad(q, src.width / g.width, src.height / g.height) : null;
}

/** The straightened frame and block of text of a photo (see rectify.ts), with the small grey copy it was measured on. */
function textPage(src: Raster): { tp: TextPage; g: Gray; k: number } | null {
  const gray = toGray(src);
  const g = downscaleGray(gray, 420);
  const fine = downscaleGray(gray, 720);
  const tp = findTextPage(g, fine, src.width, src.height, paperRegion(g) ?? undefined, paperRegion(fine) ?? undefined);
  return tp ? { tp, g, k: src.width / g.width } : null;
}

const MARGINS: Margins = { l: 0.05, r: 0.05, t: 0.035, b: 0.035 };

/** Corners from the text alone (the block of text plus margins that stop where the paper does); null without text. */
export function detectByText(src: Raster): Quad | null {
  const t = textPage(src);
  return t ? pageAround(t.tp, marginsWithinPaper(t.tp, t.g, t.k, MARGINS)) : null;
}

/**
 * The page in a photo. When there is enough text, the text decides the geometry: the lines give the horizontal, the
 * upright strokes of the letters the vertical, so the page comes out level and square even when the text is not
 * justified. The paper decides where to cut: inside its edges when all four are in the photo, otherwise wherever it
 * stops being paper. Without readable text the paper edges are used on their own; without either a default frame is
 * returned (`method: "none"`).
 */
export function detectDocument(src: Raster): Detection {
  const edges = detectByEdges(src);
  const ok = (q: Quad | null): q is Quad => !!q && isValidQuad(q, src.width, src.height);
  const paper = ok(edges) && !touchesBorder(edges, src.width, src.height) ? edges : null;

  const t = textPage(src);
  if (t) {
    const { tp } = t;
    const { block } = tp;
    const bw = block.x1 - block.x0;
    const bh = block.y1 - block.y0;
    let margins: Margins | null = null;
    if (paper) {
      // the paper in the straightened frame; cut inside it (never into the text)
      const uv = paper.map((p) => apply3(tp.H, p));
      const l = Math.max(uv[0].x, uv[3].x), r = Math.min(uv[1].x, uv[2].x), top = Math.max(uv[0].y, uv[1].y), b = Math.min(uv[2].y, uv[3].y);
      if (l < block.x0 + bw * 0.02 && r > block.x1 - bw * 0.02 && top < block.y0 + bh * 0.02 && b > block.y1 - bh * 0.02) {
        margins = { l: Math.max(0, (block.x0 - l) / bw), r: Math.max(0, (r - block.x1) / bw), t: Math.max(0, (block.y0 - top) / bh), b: Math.max(0, (b - block.y1) / bh) };
      }
    }
    const quad = pageAround(tp, margins ?? marginsWithinPaper(tp, t.g, t.k, MARGINS));
    if (isValidQuad(quad, src.width, src.height)) return { quad, method: margins ? "both" : "text", text: { block: backToPhoto(tp.H, tp.ink), others: tp.others } };
  }
  if (ok(edges)) return { quad: edges, method: "edges" };
  return { quad: defaultQuad(src.width, src.height), method: "none" };
}

export type { Pt };
