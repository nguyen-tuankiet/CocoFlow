// Straightening from the printed text itself, for photos where the paper edges are not (all) visible and the text is
// not necessarily justified (worksheets, multiple-choice questions).
//
// A flat page photographed at an angle has two vanishing points: the text lines all point to one of them, the
// upright strokes of the letters (l, h, d, b, k…) to the other. Measuring both in many small windows of the photo
// gives the perspective without guessing any margin. The page is then the block of ink, measured in the straightened
// frame, plus ordinary margins (or the paper edges when they are known), kept inside the photo.

import { inkMask, lineAngle } from "./textblock";
import type { Pt, Quad } from "./types";

export type M3 = number[]; // 3x3, row major
type V3 = [number, number, number];

export const mul3 = (a: M3, b: M3): M3 => {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};

export function inv3(m: M3): M3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det);
}

export const apply3 = (m: M3, p: Pt): Pt => {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
};

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface Direction {
  /** Where the measurement was taken (pixels of the photo). */
  c: Pt;
  /** Direction of the line through `c` (radians). */
  angle: number;
  weight: number;
}

/**
 * The point all the measured lines run towards, in homogeneous coordinates: (x, y, 1) for a real point, or a direction
 * (dx, dy, 0) when the lines are parallel. Least squares on the distances from the point to every line.
 */
export function vanishingPoint(lines: Direction[]): V3 {
  let a00 = 0, a01 = 0, a11 = 0, b0 = 0, b1 = 0, sc = 0, ss = 0;
  for (const l of lines) {
    const dx = Math.cos(l.angle);
    const dy = Math.sin(l.angle);
    const m00 = 1 - dx * dx, m01 = -dx * dy, m11 = 1 - dy * dy;
    a00 += l.weight * m00;
    a01 += l.weight * m01;
    a11 += l.weight * m11;
    b0 += l.weight * (m00 * l.c.x + m01 * l.c.y);
    b1 += l.weight * (m01 * l.c.x + m11 * l.c.y);
    // mean direction, as an axis (angle doubled so that opposite directions agree)
    sc += l.weight * Math.cos(2 * l.angle);
    ss += l.weight * Math.sin(2 * l.angle);
  }
  const det = a00 * a11 - a01 * a01;
  const tr = a00 + a11;
  if (det > 1e-6 * tr * tr) return [(a11 * b0 - a01 * b1) / det, (a00 * b1 - a01 * b0) / det, 1];
  const mean = Math.atan2(ss, sc) / 2;
  return [Math.cos(mean), Math.sin(mean), 0];
}

/** Direction of the upright strokes of the letters in each window (from the gradient of near-vertical edges). */
export function strokeDirections(gray: ArrayLike<number>, W: number, H: number, region?: Uint8Array): Direction[] {
  const ink = inkMask(gray, W, H, region);
  const gx = new Float32Array(W * H);
  const gy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      gx[p] = gray[p - W + 1] + 2 * gray[p + 1] + gray[p + W + 1] - gray[p - W - 1] - 2 * gray[p - 1] - gray[p + W - 1];
      gy[p] = gray[p + W - 1] + 2 * gray[p + W] + gray[p + W + 1] - gray[p - W - 1] - 2 * gray[p - W] - gray[p - W + 1];
    }
  }
  const out: Direction[] = [];
  const gxN = 4;
  const gyN = 6;
  for (let j = 0; j < gyN; j++) {
    for (let i = 0; i < gxN; i++) {
      const x0 = Math.floor((i * W) / gxN), x1 = Math.floor(((i + 1) * W) / gxN);
      const y0 = Math.floor((j * H) / gyN), y1 = Math.floor(((j + 1) * H) / gyN);
      const samples: { t: number; w: number }[] = [];
      let sx = 0, sy = 0, sw = 0;
      for (let y = Math.max(1, y0); y < Math.min(H - 1, y1); y++) {
        for (let x = Math.max(1, x0); x < Math.min(W - 1, x1); x++) {
          const p = y * W + x;
          // only edges of letters: next to ink, strong, and close to vertical
          if (!(ink[p] || ink[p - 1] || ink[p + 1])) continue;
          const ax = Math.abs(gx[p]);
          if (ax < 60 || ax < 2.5 * Math.abs(gy[p])) continue;
          samples.push({ t: -gy[p] / gx[p], w: ax });
          sx += x * ax;
          sy += y * ax;
          sw += ax;
        }
      }
      if (samples.length < 120) continue;
      // weighted median of the lean (robust to serifs and the odd italic word)
      samples.sort((a, b) => a.t - b.t);
      let acc = 0;
      let t = 0;
      for (const s of samples) {
        acc += s.w;
        if (acc >= sw / 2) {
          t = s.t;
          break;
        }
      }
      out.push({ c: { x: sx / sw, y: sy / sw }, angle: Math.atan2(1, t), weight: Math.sqrt(samples.length) });
    }
  }
  return out;
}

/** Direction of the text lines in a grid of windows. */
export function lineDirections(mask: Uint8Array, W: number, H: number): Direction[] {
  const out: Direction[] = [];
  const gx = 5;
  const gy = 7;
  const pw = Math.round((W / gx) * 1.5);
  const ph = Math.round((H / gy) * 1.5);
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const cx = ((i + 0.5) * W) / gx;
      const cy = ((j + 0.5) * H) / gy;
      const x0 = Math.max(0, Math.round(cx - pw / 2));
      const x1 = Math.min(W, Math.round(cx + pw / 2));
      const y0 = Math.max(0, Math.round(cy - ph / 2));
      const y1 = Math.min(H, Math.round(cy + ph / 2));
      const a = lineAngle(mask, W, x0, y0, x1, y1);
      if (a) out.push({ c: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, angle: a.angle, weight: a.weight });
    }
  }
  return out;
}

/**
 * Homography from the photo to a straightened frame in which the text lines are horizontal and the strokes vertical.
 * `vh` and `vv` are the two vanishing points (homogeneous, photo pixels). Near the centre of the photo one unit of
 * the straightened frame is about `unit` pixels of the photo. Null when the two directions are (nearly) the same.
 */
export function rectifier(vh: V3, vv: V3, W: number, H: number, unit: number): M3 | null {
  const S = Math.max(W, H);
  const cx = W / 2, cy = H / 2;
  const N: M3 = [1 / S, 0, -cx / S, 0, 1 / S, -cy / S, 0, 0, 1];
  const toN = (v: V3): V3 => (v[2] === 0 ? [v[0], v[1], 0] : [(v[0] - cx) / S, (v[1] - cy) / S, 1]);
  const h = toN(vh);
  const v = toN(vv);
  // send the vanishing line to infinity
  const l = cross(h, v);
  let P: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (Math.abs(l[2]) > 1e-12 && Math.hypot(l[0], l[1]) / Math.abs(l[2]) > 1e-9) P = [1, 0, 0, 0, 1, 0, l[0] / l[2], l[1] / l[2], 1];
  // after that the vanishing points are the directions of the two axes
  let dh: [number, number] = [h[0], h[1]];
  let dv: [number, number] = [v[0], v[1]];
  const nh = Math.hypot(...dh), nv = Math.hypot(...dv);
  if (!nh || !nv) return null;
  dh = [dh[0] / nh, dh[1] / nh];
  dv = [dv[0] / nv, dv[1] / nv];
  if (dh[0] < 0) dh = [-dh[0], -dh[1]];
  if (dv[1] < 0) dv = [-dv[0], -dv[1]];
  const det = dh[0] * dv[1] - dv[0] * dh[1];
  if (Math.abs(det) < 0.5) return null; // the axes would be less than 30° apart: not a page
  const A: M3 = [dv[1] / det, -dv[0] / det, 0, -dh[1] / det, dh[0] / det, 0, 0, 0, 1];
  let M = mul3(A, mul3(P, N));
  // scale so that near the centre one unit is about `unit` photo pixels in both directions
  const c0 = apply3(M, { x: cx, y: cy });
  const jx = Math.hypot(apply3(M, { x: cx + unit, y: cy }).x - c0.x, apply3(M, { x: cx + unit, y: cy }).y - c0.y);
  const jy = Math.hypot(apply3(M, { x: cx, y: cy + unit }).x - c0.x, apply3(M, { x: cx, y: cy + unit }).y - c0.y);
  if (!jx || !jy) return null;
  M = mul3([1 / jx, 0, 0, 0, 1 / jy, 0, 0, 0, 1], M);
  return M;
}

export interface TextPage {
  /** Photo → straightened frame. */
  H: M3;
  /** The block of text in the straightened frame (a few stray marks left out). */
  block: { x0: number; y0: number; x1: number; y1: number };
  /** Everything that looks like a text line, outermost ends included (protects the text when margins are cleaned). */
  ink: { x0: number; y0: number; x1: number; y1: number };
  /** Outlines (photo pixels) of text of other sheets that shows in the photo, to be cleared from the page. */
  others: Pt[][];
}

/**
 * Finds the straightened frame and the block of text in it. `g` is a small grey copy (about 420 px wide) used for the
 * lines, `fine` a larger one (about 720 px) used for the letter strokes; `k`/`kFine` convert their pixels to photo
 * pixels. Null when there is not enough text.
 */
export function findTextPage(
  g: { gray: ArrayLike<number>; width: number; height: number },
  fine: { gray: ArrayLike<number>; width: number; height: number },
  photoW: number,
  photoH: number,
  region?: Uint8Array,
  regionFine?: Uint8Array,
): TextPage | null {
  const { width: W, height: Hh } = g;
  const k = photoW / W;
  const kf = photoW / fine.width;
  const mask = inkMask(g.gray, W, Hh, region);
  const lines = lineDirections(mask, W, Hh).map((d) => ({ ...d, c: { x: d.c.x * k, y: d.c.y * k } }));
  if (lines.length < 5) return null;
  const vh = vanishingPoint(lines);
  const strokes = strokeDirections(fine.gray, fine.width, fine.height, regionFine).map((d) => ({ ...d, c: { x: d.c.x * kf, y: d.c.y * kf } }));
  // without enough strokes, assume the upright direction is square to the lines in the middle of the photo
  let vv: V3;
  if (strokes.length >= 5) vv = vanishingPoint(strokes);
  else {
    const a = vh[2] === 0 ? Math.atan2(vh[1], vh[0]) : Math.atan2(vh[1] - photoH / 2, vh[0] - photoW / 2);
    vv = [-Math.sin(a), Math.cos(a), 0];
  }
  let Hm = rectifier(vh, vv, photoW, photoH, k);
  if (!Hm) return null;

  let m = measure(Hm, mask, W, Hh, k);
  if (!m) return null;
  // Fine-tune the upright direction with the left margin when most lines start on one straight line (a slight
  // residual lean of the letters is then removed); never more than about 3 degrees.
  const fit = straightLine(m.lefts, Hh);
  if (fit && fit.share >= 0.5 && Math.abs(fit.b) > 0.002 && Math.abs(fit.b) < 0.06) {
    Hm = mul3([1, -fit.b, 0, 0, 1, 0, 0, 0, 1], Hm);
    m = measure(Hm, mask, W, Hh, k) ?? m;
  }
  return { H: Hm, block: m.block, ink: m.ink, others: m.others };
}

/** The line x = a + b*y on which most points lie (pairs of points, then a least-squares fit on the agreeing ones). */
function straightLine(pts: Pt[], H: number): { a: number; b: number; share: number } | null {
  let best: { a: number; b: number; n: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dy = pts[j].y - pts[i].y;
      if (Math.abs(dy) < H * 0.15) continue;
      const b = (pts[j].x - pts[i].x) / dy;
      if (Math.abs(b) > 0.1) continue;
      const a = pts[i].x - b * pts[i].y;
      let n = 0;
      for (const p of pts) if (Math.abs(p.x - (a + b * p.y)) < 1.5) n++;
      if (!best || n > best.n) best = { a, b, n };
    }
  }
  if (!best) return null;
  const inl = pts.filter((p) => Math.abs(p.x - (best!.a + best!.b * p.y)) < 2);
  const n = inl.length;
  let sy = 0, sx = 0, syy = 0, sxy = 0;
  for (const p of inl) (sy += p.y), (sx += p.x), (syy += p.y * p.y), (sxy += p.x * p.y);
  const den = n * syy - sy * sy;
  const b = Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : best.b;
  return { a: (sx - b * sy) / n, b, share: n / pts.length };
}

/**
 * Ink of the straightened frame that belongs to text at another angle, such as a corner of the next sheet in the
 * photo: once the page is straight its own words are level, so a word or line that clearly slopes is not part of it.
 * Letters are joined into words (a small horizontal smear), and each word's direction comes from its second moments.
 * Null when the frame is too large to look at.
 */
function tiltedInk(pts: Pt[], maxSide: number): Uint8Array | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) (minX = Math.min(minX, p.x)), (minY = Math.min(minY, p.y)), (maxX = Math.max(maxX, p.x)), (maxY = Math.max(maxY, p.y));
  const GW = Math.ceil(maxX - minX) + 1;
  const GH = Math.ceil(maxY - minY) + 1;
  if (!(GW > 0 && GH > 0 && GW < maxSide && GH < maxSide)) return null;
  const cell = (p: Pt) => Math.floor(p.y - minY) * GW + Math.floor(p.x - minX);
  const grid = new Uint8Array(GW * GH);
  for (const p of pts) grid[cell(p)] = 1;
  // letters of one word touch after a smear of 2 cells to each side
  const R = 2;
  const smear = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) {
    let last = -Infinity;
    for (let x = 0; x < GW; x++) if (grid[y * GW + x]) last = x;
      else if (x - last <= R) smear[y * GW + x] = 1;
    let next = Infinity;
    for (let x = GW - 1; x >= 0; x--) if (grid[y * GW + x]) (next = x), (smear[y * GW + x] = 1);
      else if (next - x <= R) smear[y * GW + x] = 1;
  }
  // the pieces, and the direction of each
  const label = new Int32Array(GW * GH).fill(-1);
  const tilted: boolean[] = [];
  const pieces: { x: number; y: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < GW * GH; s++) {
    if (!smear[s] || label[s] >= 0) continue;
    const id = tilted.length;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, x0 = Infinity, x1 = -Infinity;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % GW;
      const y = (q - x) / GW;
      if (grid[q]) (n++, (sx += x), (sy += y), (sxx += x * x), (syy += y * y), (sxy += x * y), (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)));
      const near = [x > 0 ? q - 1 : -1, x < GW - 1 ? q + 1 : -1, y > 0 ? q - GW : -1, y < GH - 1 ? q + GW : -1];
      for (const r of near) if (r >= 0 && smear[r] && label[r] < 0) (label[r] = id), stack.push(r);
    }
    let sloped = false;
    if (n >= 12 && x1 - x0 >= 8) {
      const mx = sx / n, my = sy / n;
      const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
      const angle = (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI;
      // long in one direction (a word or a line, not a blot), and that direction clearly not level
      const spread = Math.sqrt((cxx - cyy) ** 2 + 4 * cxy * cxy);
      const long = (cxx + cyy + spread) / Math.max(1e-6, cxx + cyy - spread);
      sloped = long >= 6 && Math.abs(angle) > 6 && Math.abs(angle) < 60;
    }
    tilted.push(sloped);
    pieces.push({ x: sx / Math.max(1, n), y: sy / Math.max(1, n), x0, x1, y0: Infinity, y1: -Infinity });
  }
  // the extent of each piece
  for (let q = 0; q < GW * GH; q++) {
    if (label[q] < 0) continue;
    const b = pieces[label[q]];
    const y = Math.floor(q / GW);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
  }
  // small marks among the sloping words (a short word, a letter) belong to the same sheet; only those right in line
  // with them, so the last word of a line of the page next to them stays
  const sloping = pieces.filter((_, i) => tilted[i]);
  if (!sloping.length) return null;
  const near = 6;
  pieces.forEach((p, i) => {
    if (!tilted[i] && p.x1 - p.x0 < 20) tilted[i] = sloping.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 - near && p.y <= b.y1 + near);
  });
  const out = new Uint8Array(pts.length);
  pts.forEach((p, i) => (out[i] = tilted[label[cell(p)]] ? 1 : 0));
  return out;
}

/** The text lines of the photo in the straightened frame: where each starts and ends, and the block they form. */
function measure(Hm: M3, mask: Uint8Array, W: number, Hh: number, k: number): (Omit<TextPage, "H"> & { lefts: Pt[]; rights: Pt[] }) | null {
  const pts: Pt[] = [];
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) pts.push(apply3(Hm, { x: (x + 0.5) * k, y: (y + 0.5) * k }));
  if (pts.length < W * Hh * 0.01) return null;
  // text of another sheet is left out of the lines and the block
  const tilted = tiltedInk(pts, Hh * 6);
  let strays: Pt[] = [];
  if (tilted) {
    const kept = pts.filter((_, i) => !tilted[i]);
    if (kept.length >= pts.length * 0.6) {
      strays = pts.filter((_, i) => tilted[i]);
      pts.splice(0, pts.length, ...kept);
    }
  }
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) (minY = Math.min(minY, p.y)), (maxY = Math.max(maxY, p.y));
  const span = Math.ceil(maxY - minY) + 3;
  if (!(span > 0 && span < Hh * 6)) return null;
  const hist = new Float32Array(span);
  for (const p of pts) hist[Math.floor(p.y - minY) + 1]++;
  const sm = new Float32Array(span);
  for (let i = 1; i < span - 1; i++) sm[i] = (hist[i - 1] + hist[i] + hist[i + 1]) / 3;
  const nz = Array.from(sm).filter((v) => v > 0).sort((a, b) => a - b);
  if (nz.length < 20) return null;
  const thr = nz[Math.floor(nz.length * 0.8)] * 0.3;
  const bands: [number, number][] = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i < span; i++) {
    if (sm[i] > thr) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0 && ++gap > 2) {
      if (i - gap - start >= 3) bands.push([start + minY - 1, i - gap + minY - 1]);
      start = -1;
    }
  }
  if (start >= 0 && span - start >= 3) bands.push([start + minY - 1, span + minY - 1]);
  if (bands.length < 5) return null;

  // the main run of ink of every line (a wide gap means what lies beyond is something else)
  const xsBy: number[][] = bands.map(() => []);
  for (const p of pts) {
    for (let b = 0; b < bands.length; b++) {
      if (p.y >= bands[b][0] && p.y <= bands[b][1]) {
        xsBy[b].push(p.x);
        break;
      }
    }
  }
  const gapMax = Math.max(8, W * 0.035);
  const lefts: Pt[] = [];
  const rights: Pt[] = [];
  const used: [number, number][] = [];
  xsBy.forEach((xs, b) => {
    if (xs.length < 25) return;
    xs.sort((a, c) => a - c);
    const mid = Math.floor(xs.length / 2);
    let li = mid;
    while (li > 0 && xs[li] - xs[li - 1] <= gapMax) li--;
    let ri = mid;
    while (ri < xs.length - 1 && xs[ri + 1] - xs[ri] <= gapMax) ri++;
    const y = (bands[b][0] + bands[b][1]) / 2;
    lefts.push({ x: xs[li], y });
    rights.push({ x: xs[ri], y });
    used.push(bands[b]);
  });
  if (lefts.length < 5) return null;
  const ls = lefts.map((p) => p.x).sort((a, b) => a - b);
  const rs = rights.map((p) => p.x).sort((a, b) => a - b);
  // the margin is where the outermost lines reach (a few stray marks aside)
  const x0 = ls[Math.floor(ls.length * 0.04)];
  const x1 = rs[Math.ceil(rs.length * 0.96) - 1];
  const y0 = used[0][0];
  const y1 = used[used.length - 1][1];
  if (!(x1 - x0 > W * 0.25 && y1 - y0 > Hh * 0.25)) return null;
  // the ends of the longest lines, but not marks far beyond the block (the edge of the sheet, another sheet)
  const reach = W * 0.03;
  const inkX0 = Math.min(...ls.filter((x) => x >= x0 - reach));
  const inkX1 = Math.max(...rs.filter((x) => x <= x1 + reach));
  const back = inv3(Hm);
  const others = otherSheets(strays, { x0, y0, x1, y1 }).map((poly) => poly.map((p) => apply3(back, p)));
  return { block: { x0, y0, x1, y1 }, ink: { x0: inkX0, y0, x1: inkX1, y1 }, lefts, rights, others };
}

/**
 * Groups the sloping ink into the patches of text of other sheets, as outlines (convex, a little enlarged) in the
 * straightened frame. A group counts only when it is large and lies mostly beside or beyond the block of text: sloping
 * words inside the page (a curled corner, a stamp) are never cleared.
 */
function otherSheets(strays: Pt[], block: { x0: number; y0: number; x1: number; y1: number }): Pt[][] {
  if (strays.length < 60) return [];
  // join the ink in cells of 10 units, cells that touch form a group
  const C = 10;
  const cells = new Map<string, Pt[]>();
  for (const p of strays) {
    const key = `${Math.floor(p.x / C)},${Math.floor(p.y / C)}`;
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(p);
  }
  const seen = new Set<string>();
  const out: Pt[][] = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const group: Pt[] = [];
    const queue = [start];
    while (queue.length) {
      const key = queue.pop()!;
      group.push(...cells.get(key)!);
      const [cx, cy] = key.split(",").map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const n = `${cx + dx},${cy + dy}`;
        if (cells.has(n) && !seen.has(n)) seen.add(n), queue.push(n);
      }
    }
    if (group.length < 60) continue;
    const outside = group.filter((p) => p.x < block.x0 || p.x > block.x1 || p.y < block.y0 || p.y > block.y1).length;
    if (outside < group.length * 0.5) continue;
    const hull = convexHull(group);
    const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
    // enlarged by 2 units, so the edges of the letters are inside
    out.push(hull.map((p) => {
      const d = Math.hypot(p.x - cx, p.y - cy) || 1;
      return { x: p.x + ((p.x - cx) / d) * 2, y: p.y + ((p.y - cy) / d) * 2 };
    }));
  }
  return out;
}

/** Convex hull (monotone chain), counter-clockwise in screen terms. */
function convexHull(pts: Pt[]): Pt[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const turn = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of s) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export interface Margins {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** A rectangle of the straightened frame as four corners in photo pixels. */
export function backToPhoto(H: M3, r: { x0: number; y0: number; x1: number; y1: number }): Quad {
  const back = inv3(H);
  return [apply3(back, { x: r.x0, y: r.y0 }), apply3(back, { x: r.x1, y: r.y0 }), apply3(back, { x: r.x1, y: r.y1 }), apply3(back, { x: r.x0, y: r.y1 })];
}

/** The page around a block of text: the block plus margins (fractions of the block), as four corners in photo pixels. */
export function pageAround(tp: TextPage, margins: Margins): Quad {
  const { H, block } = tp;
  const bw = block.x1 - block.x0;
  const bh = block.y1 - block.y0;
  const x0 = block.x0 - margins.l * bw;
  const x1 = block.x1 + margins.r * bw;
  const y0 = block.y0 - margins.t * bh;
  const y1 = block.y1 + margins.b * bh;
  const back = inv3(H);
  return [apply3(back, { x: x0, y: y0 }), apply3(back, { x: x1, y: y0 }), apply3(back, { x: x1, y: y1 }), apply3(back, { x: x0, y: y1 })];
}

/**
 * Shrinks the margins where the paper ends before them: walking out from the block of text on each side, the margin
 * stops at the first place that is clearly darker than the paper (the table, a shadowed fold, the text of another
 * sheet). Beyond the edge of the photo there is nothing to check, so the margin is kept (it becomes white paper).
 */
export function marginsWithinPaper(tp: TextPage, g: { gray: ArrayLike<number>; width: number; height: number }, k: number, wanted: Margins): Margins {
  const { H, block } = tp;
  const back = inv3(H);
  const bw = block.x1 - block.x0;
  const bh = block.y1 - block.y0;
  const sample = (X: number, Y: number): number | null => {
    const p = apply3(back, { x: X, y: Y });
    const x = Math.floor(p.x / k);
    const y = Math.floor(p.y / k);
    if (x < 0 || y < 0 || x >= g.width || y >= g.height) return null;
    return g.gray[y * g.width + x];
  };
  // brightness of the paper: a high percentile inside the block (between the letters)
  const vals: number[] = [];
  for (let i = 1; i < 30; i++) for (let j = 1; j < 30; j++) {
    const v = sample(block.x0 + (bw * i) / 30, block.y0 + (bh * j) / 30);
    if (v !== null) vals.push(v);
  }
  if (vals.length < 50) return wanted;
  vals.sort((a, b) => a - b);
  const dark = vals[Math.floor(vals.length * 0.75)] * 0.72;
  const reach = (from: (s: number, d: number) => [number, number], max: number) => {
    const found: number[] = [];
    for (let i = 1; i <= 9; i++) {
      const s = i / 10;
      let run = 0;
      let got = max;
      for (let d = 1; d <= max; d++) {
        const [X, Y] = from(s, d);
        const v = sample(X, Y);
        if (v === null) break; // left the photo: nothing more to check
        if (v < dark) {
          if (++run >= 2) {
            got = Math.max(0, d - 3);
            break;
          }
        } else run = 0;
      }
      found.push(got);
    }
    found.sort((a, b) => a - b);
    return found[3]; // a low quantile: one bright gap in a dark border does not count
  };
  return {
    l: reach((s, d) => [block.x0 - d, block.y0 + s * bh], Math.ceil(wanted.l * bw)) / bw,
    r: reach((s, d) => [block.x1 + d, block.y0 + s * bh], Math.ceil(wanted.r * bw)) / bw,
    t: reach((s, d) => [block.x0 + s * bw, block.y0 - d], Math.ceil(wanted.t * bh)) / bh,
    b: reach((s, d) => [block.x0 + s * bw, block.y1 + d], Math.ceil(wanted.b * bh)) / bh,
  };
}
