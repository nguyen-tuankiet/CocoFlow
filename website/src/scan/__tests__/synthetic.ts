// Test helpers: a synthetic printed page and a "photograph" of it taken from an angle, so the tests know the truth.
import { homography } from "../engine/geometry";
import type { Quad, Raster } from "../engine/types";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blank(width: number, height: number, v: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) (data[i * 4] = v), (data[i * 4 + 1] = v), (data[i * 4 + 2] = v), (data[i * 4 + 3] = 255);
  return { data, width, height };
}

export interface Page {
  raster: Raster;
  /** The block of text as fractions of the page. */
  block: { x0: number; y0: number; x1: number; y1: number };
}

/** White page with justified lines of "words" (dark rectangles), paragraph indents and short last lines. */
export function makePage(width = 700, height = 990, seed = 7, justified = true): Page {
  const raster = blank(width, height, 250);
  const rand = rng(seed);
  const block = { x0: 0.09, y0: 0.07, x1: 0.91, y1: 0.93 };
  const bx0 = Math.round(width * block.x0);
  const bx1 = Math.round(width * block.x1);
  const pitch = 22;
  let line = 0;
  for (let y = Math.round(height * block.y0); y + 12 < height * block.y1; y += pitch, line++) {
    const lastOfParagraph = line % 9 === 8;
    const indent = line % 9 === 0 ? 30 : 0;
    // words with random lengths, then stretched so that the line ends exactly on the right margin
    const words: number[] = [];
    let used = indent;
    const room = bx1 - bx0;
    while (used < room - 40) {
      const w = 18 + Math.floor(rand() * 50);
      if (used + w > room) break;
      words.push(w);
      used += w + 8;
    }
    const target = lastOfParagraph || !justified ? used : room;
    const gap = words.length > 1 ? (target - indent - words.reduce((s, w) => s + w, 0)) / (words.length - 1) : 8;
    let x = bx0 + indent;
    for (const w of words) {
      for (let yy = y; yy < y + 10; yy++) {
        for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
          // letters: break the word into small dark/light cells
          const dark = ((xx - Math.round(x)) % 5 !== 4 && (yy - y) % 9 !== 8) || rand() < 0.1;
          const o = (yy * width + xx) * 4;
          const v = dark ? 40 : 235;
          raster.data[o] = raster.data[o + 1] = raster.data[o + 2] = v;
        }
      }
      x += w + gap;
    }
  }
  return { raster, block };
}

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** The photograph: `page` stretched onto `quad` inside a width x height picture, with uneven light and a dark table. */
export function photograph(page: Raster, quad: Quad, width: number, height: number, background = 58): Raster {
  const h = homography(quad);
  const inv = invert3([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]);
  const out = blank(width, height, background);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = inv[6] * (x + 0.5) + inv[7] * (y + 0.5) + inv[8];
      const u = (inv[0] * (x + 0.5) + inv[1] * (y + 0.5) + inv[2]) / w;
      const v = (inv[3] * (x + 0.5) + inv[4] * (y + 0.5) + inv[5]) / w;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const px = u * page.width - 0.5;
      const py = v * page.height - 0.5;
      const x0 = Math.max(0, Math.min(page.width - 2, Math.floor(px)));
      const y0 = Math.max(0, Math.min(page.height - 2, Math.floor(py)));
      const tx = Math.max(0, Math.min(1, px - x0));
      const ty = Math.max(0, Math.min(1, py - y0));
      const at = (xx: number, yy: number) => page.data[(yy * page.width + xx) * 4];
      const val = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      const light = 0.78 + 0.22 * (x / width); // darker on the left, like a lamp on one side
      const o = (y * width + x) * 4;
      out.data[o] = out.data[o + 1] = out.data[o + 2] = val * light;
    }
  }
  return out;
}

/** Skew of the text lines in degrees: the angle at which the rows of dark pixels line up best (projection profile). */
export function lineSkewDegrees(r: Raster): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) if (r.data[(y * r.width + x) * 4] < 120) (xs.push(x), ys.push(y));
  let best = -1;
  let bestA = 0;
  for (let a = -6; a <= 6; a += 0.25) {
    const t = Math.tan((a * Math.PI) / 180);
    const bins = new Map<number, number>();
    for (let i = 0; i < xs.length; i += 3) {
      const k = Math.round(ys[i] - xs[i] * t);
      bins.set(k, (bins.get(k) ?? 0) + 1);
    }
    let s = 0;
    for (const v of bins.values()) s += v * v;
    if (s > best) (best = s), (bestA = a);
  }
  return bestA;
}

/** Slope (dx per dy) of the left edge of the text: the median first dark pixel of chunks of rows, then a straight-line fit. */
export function leftMarginSlope(r: Raster, chunk = 60): number {
  const pts: [number, number][] = [];
  for (let y0 = 0; y0 + chunk <= r.height; y0 += chunk) {
    const firsts: number[] = [];
    for (let y = y0; y < y0 + chunk; y++) {
      for (let x = 0; x < r.width; x++) {
        if (r.data[(y * r.width + x) * 4] < 120) {
          firsts.push(x);
          break;
        }
      }
    }
    if (firsts.length < chunk / 6) continue;
    firsts.sort((a, b) => a - b);
    pts.push([y0 + chunk / 2, firsts[Math.floor(firsts.length * 0.1)]]);
  }
  const n = pts.length;
  const sy = pts.reduce((s, p) => s + p[0], 0);
  const sx = pts.reduce((s, p) => s + p[1], 0);
  const syy = pts.reduce((s, p) => s + p[0] * p[0], 0);
  const sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  return (n * sxy - sx * sy) / (n * syy - sy * sy);
}

export const meanAbsDiff = (a: Raster, b: Raster): number => {
  let s = 0;
  for (let i = 0; i < a.width * a.height; i++) s += Math.abs(a.data[i * 4] - b.data[i * 4]);
  return s / (a.width * a.height);
};
