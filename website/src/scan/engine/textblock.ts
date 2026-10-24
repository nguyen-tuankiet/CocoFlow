// Straightens a photographed page from its printed lines alone, for photos where the edges of the paper are not
// visible (a worksheet that fills the frame). The text lines of a flat page all point to one vanishing point, so
// the direction of the lines in different parts of the photo gives the perspective; the left and right ends of the
// lines give the margins. The result is the four corners of the block of text.

import { clamp } from "./geometry";
import type { Pt } from "./types";

type P = Pt;

/** Optional trace of why a photo was rejected (used by tests). */
export const trace: { log: (msg: string) => void } = { log: () => {} };
const bail = (why: string): null => (trace.log(why), null);

/** Dark ink on lighter paper, as a 0/1 mask (ink is darker than its own neighbourhood). */
export function inkMask(gray: ArrayLike<number>, W: number, H: number, region?: Uint8Array): Uint8Array {
  const r = Math.max(5, Math.round(Math.max(W, H) / 45));
  const blur = (src: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(src.length);
    const n = horizontal ? W : H;
    const lines = horizontal ? H : W;
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => src[horizontal ? l * W + clamp(i, 0, n - 1) : clamp(i, 0, n - 1) * W + l];
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += at(i);
      for (let i = 0; i < n; i++) {
        out[horizontal ? l * W + i : i * W + l] = sum / (2 * r + 1);
        sum += at(i + r + 1) - at(i - r);
      }
    }
    return out;
  };
  const g = Float32Array.from(gray as ArrayLike<number>);
  const bg = blur(blur(g, true), false);
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (bg[i] > 70 && bg[i] - g[i] > 18 && (!region || region[i])) mask[i] = 1;
  return mask;
}

interface Patch {
  c: P;
  angle: number; // radians, direction of the text lines (x to the right, y down)
  weight: number;
}

/** Direction of the text lines in a window: the angle at which the rows of ink line up best. */
export function lineAngle(mask: Uint8Array, W: number, x0: number, y0: number, x1: number, y1: number): { angle: number; weight: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const stepSkip = 1;
  for (let y = y0; y < y1; y += stepSkip) for (let x = x0; x < x1; x++) if (mask[y * W + x]) (xs.push(x), ys.push(y));
  const n = xs.length;
  if (n < 120) return null;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sub = Math.max(1, Math.floor(n / 4000));
  let best = -1;
  let bestA = 0;
  let total = 0;
  let count = 0;
  const A_MAX = (16 * Math.PI) / 180;
  const STEP = (0.4 * Math.PI) / 180;
  for (let a = -A_MAX; a <= A_MAX + 1e-9; a += STEP) {
    const t = Math.tan(a);
    const bins = new Map<number, number>();
    for (let i = 0; i < n; i += sub) {
      const key = Math.round(ys[i] - cy - (xs[i] - cx) * t);
      bins.set(key, (bins.get(key) ?? 0) + 1);
    }
    let s = 0;
    for (const v of bins.values()) s += v * v;
    total += s;
    count++;
    if (s > best) (best = s), (bestA = a);
  }
  const sharp = best / (total / count);
  if (sharp < 1.25) return null;
  return { angle: bestA, weight: Math.min(4, sharp - 1) * Math.sqrt(n) };
}

function fitVanishing(patches: Patch[]): { vp: P | null; slope: number } {
  // least-squares point closest to all the lines (centre c, direction d)
  let a00 = 0, a01 = 0, a11 = 0, b0 = 0, b1 = 0, wsum = 0, sx = 0, sy = 0;
  for (const p of patches) {
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    const m00 = 1 - dx * dx;
    const m01 = -dx * dy;
    const m11 = 1 - dy * dy;
    a00 += p.weight * m00;
    a01 += p.weight * m01;
    a11 += p.weight * m11;
    b0 += p.weight * (m00 * p.c.x + m01 * p.c.y);
    b1 += p.weight * (m01 * p.c.x + m11 * p.c.y);
    wsum += p.weight;
    sx += p.weight * Math.tan(p.angle);
    sy += p.weight;
  }
  const slope = sx / sy;
  const det = a00 * a11 - a01 * a01;
  const tr = a00 + a11;
  if (!(det > 1e-7 * tr * tr)) return { vp: null, slope };
  const vp = { x: (a11 * b0 - a01 * b1) / det, y: (a00 * b1 - a01 * b0) / det };
  return { vp, slope };
}

/** Finds the corners (top-left, top-right, bottom-right, bottom-left) of the block of text, or null. */
export function findTextBlock(gray: ArrayLike<number>, W: number, H: number, region?: Uint8Array): [P, P, P, P] | null {
  const mask = inkMask(gray, W, H, region);
  let ink = 0;
  for (let i = 0; i < mask.length; i++) ink += mask[i];
  if (ink < W * H * 0.015) return bail(`little ink: ${ink}`);

  // 1. direction of the lines in a grid of windows
  const patches: Patch[] = [];
  const gx = 5;
  const gy = 7;
  const pw = Math.round((W / gx) * 1.5);
  const ph = Math.round((H / gy) * 1.5);
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const cx = ((i + 0.5) * W) / gx;
      const cy = ((j + 0.5) * H) / gy;
      const x0 = clamp(Math.round(cx - pw / 2), 0, W - 1);
      const x1 = clamp(Math.round(cx + pw / 2), 1, W);
      const y0 = clamp(Math.round(cy - ph / 2), 0, H - 1);
      const y1 = clamp(Math.round(cy + ph / 2), 1, H);
      const a = lineAngle(mask, W, x0, y0, x1, y1);
      if (a) patches.push({ c: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, angle: a.angle, weight: a.weight });
    }
  }
  trace.log(`patches: ${patches.length}, angles(deg): ${patches.map((p) => ((p.angle * 180) / Math.PI).toFixed(1)).join(" ")}`);
  if (patches.length < 5) return bail("too few patches");
  const { vp, slope } = fitVanishing(patches);
  const xr = W / 2;
  // y of the line through pixel (x,y) at x = xr, and the other way round
  const yRef = (x: number, y: number) => (vp && Math.abs(vp.x - x) > 1e-6 ? y + ((xr - x) * (vp.y - y)) / (vp.x - x) : y + (xr - x) * slope);
  const yAt = (u: number, x: number) => (vp && Math.abs(vp.x - xr) > 1e-6 ? u + ((x - xr) * (vp.y - u)) / (vp.x - xr) : u + (x - xr) * slope);

  // 2. text lines = clusters of ink along the family of lines
  const lo = -H * 2;
  const span = Math.round(H * 5);
  const hist = new Float32Array(span);
  const us = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const u = yRef(x, y);
      us[y * W + x] = u;
      const b = Math.round(u - lo);
      if (b >= 0 && b < span) hist[b]++;
    }
  }
  const sm = new Float32Array(span);
  for (let i = 1; i < span - 1; i++) sm[i] = (hist[i - 1] + hist[i] + hist[i + 1]) / 3;
  const nz = Array.from(sm).filter((v) => v > 0).sort((a, b) => a - b);
  if (nz.length < 20) return bail("no histogram");
  const thr = nz[Math.floor(nz.length * 0.8)] * 0.3;
  const bands: [number, number][] = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i < span; i++) {
    if (sm[i] > thr) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0 && ++gap > 2) {
      if (i - gap - start >= 3) bands.push([start + lo, i - gap + lo]);
      start = -1;
    }
  }
  trace.log(`vp: ${vp ? vp.x.toFixed(0) + "," + vp.y.toFixed(0) : "none (slope " + slope.toFixed(3) + ")"}, bands: ${bands.length}`);
  if (bands.length < 6) return bail("too few text lines");

  // 3. ends of every line
  const bandOf = (u: number) => {
    let lo2 = 0;
    let hi2 = bands.length - 1;
    while (lo2 <= hi2) {
      const mid = (lo2 + hi2) >> 1;
      if (u < bands[mid][0]) hi2 = mid - 1;
      else if (u > bands[mid][1]) lo2 = mid + 1;
      else return mid;
    }
    return -1;
  };
  const xsByBand: number[][] = bands.map(() => []);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const b = bandOf(us[y * W + x]);
      if (b >= 0) xsByBand[b].push(x);
    }
  }
  const left: P[] = [];
  const right: P[] = [];
  bands.forEach(([u0, u1], k) => {
    const xs = xsByBand[k].sort((a, b) => a - b);
    if (xs.length < 25) return;
    // the run of ink around the middle of the line: a wide empty gap means that what lies beyond is something else
    // (another sheet, the edge of the photo)
    const gapMax = Math.max(8, W * 0.035);
    const mid = Math.floor(xs.length / 2);
    let li = mid;
    while (li > 0 && xs[li] - xs[li - 1] <= gapMax) li--;
    let ri = mid;
    while (ri < xs.length - 1 && xs[ri + 1] - xs[ri] <= gapMax) ri++;
    const xl = xs[li];
    const xrr = xs[ri];
    const u = (u0 + u1) / 2;
    left.push({ x: xl, y: yAt(u, xl) });
    right.push({ x: xrr, y: yAt(u, xrr) });
  });
  if (left.length < 6) return bail("too few line ends");

  // 4. margins: a line x = a + b*y that many line ends sit on. Several lines can qualify (indented or short lines
  // never reach the true margin), so among the well supported ones take the outermost.
  const margin = (pts: P[], side: "left" | "right"): { a: number; b: number; share: number } | null => {
    const found: { a: number; b: number; n: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dy = pts[j].y - pts[i].y;
        if (Math.abs(dy) < H * 0.15) continue;
        const b = (pts[j].x - pts[i].x) / dy;
        if (Math.abs(b) > 0.25) continue;
        const a = pts[i].x - b * pts[i].y;
        let n = 0;
        for (const p of pts) if (Math.abs(p.x - (a + b * p.y)) < 3) n++;
        found.push({ a, b, n });
      }
    }
    if (!found.length) return null;
    const top = Math.max(...found.map((f) => f.n));
    const strong = found.filter((f) => f.n >= Math.max(5, top * 0.6));
    const mid = H / 2;
    const at = (f: { a: number; b: number }) => f.a + f.b * mid;
    const pick = strong.reduce((p, f) => ((side === "left" ? at(f) < at(p) : at(f) > at(p)) ? f : p));
    const inl = pts.filter((p) => Math.abs(p.x - (pick.a + pick.b * p.y)) < 3.5);
    let sy = 0, sx = 0, syy = 0, sxy = 0;
    for (const p of inl) (sy += p.y), (sx += p.x), (syy += p.y * p.y), (sxy += p.x * p.y);
    const n = inl.length;
    const den = n * syy - sy * sy;
    const bb = Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : pick.b;
    const aa = (sx - bb * sy) / n;
    return { a: aa, b: bb, share: n / pts.length };
  };
  const ml = margin(left, "left");
  const mr = margin(right, "right");
  trace.log(`margins: left ${ml ? ml.share.toFixed(2) : "none"}, right ${mr ? mr.share.toFixed(2) : "none"} of ${left.length} lines`);
  if (!ml || ml.share < 0.15) return bail("no straight left margin");
  // Text that is not justified has no straight right margin. Then the right margin is taken parallel to the left one,
  // placed so that most lines end before it; callers that know the paper edges only use it for direction.
  let right_ = mr && mr.share >= 0.25 ? mr : null;
  if (!right_) {
    const offs = right.map((p) => p.x - ml.b * p.y).sort((a, b) => a - b);
    right_ = { a: offs[Math.floor(offs.length * 0.9)], b: ml.b, share: 0 };
    trace.log("right margin guessed from the left one");
  }

  // 5. corners: first / last line against the margins
  const uTop = bands[0][0];
  const uBottom = bands[bands.length - 1][1];
  const corner = (u: number, m: { a: number; b: number }): P => {
    let x = m.a + m.b * u;
    let y = yAt(u, x);
    for (let k = 0; k < 4; k++) {
      x = m.a + m.b * y;
      y = yAt(u, x);
    }
    return { x, y };
  };
  const q = [corner(uTop, ml), corner(uTop, right_), corner(uBottom, right_), corner(uBottom, ml)];
  const w = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
  const h = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y);
  if (w < W * 0.25 || h < H * 0.25) return bail("block too small");
  return q as [P, P, P, P];
}

/** The four corners of the page: the block of text pushed outwards by the usual paper margins. */
export function withMargins(q: P[], mx = 0.06, my = 0.035): [P, P, P, P] {
  // map the unit square onto the text block and read it at (-mx,-my) ... (1+mx,1+my)
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const rows: number[][] = [];
  uv.forEach(([u, v], i) => {
    rows.push([u, v, 1, 0, 0, 0, -u * q[i].x, -v * q[i].x, q[i].x]);
    rows.push([0, 0, 0, u, v, 1, -u * q[i].y, -v * q[i].y, q[i].y]);
  });
  for (let c = 0; c < 8; c++) {
    let best = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(rows[r][c]) > Math.abs(rows[best][c])) best = r;
    [rows[c], rows[best]] = [rows[best], rows[c]];
    const d = rows[c][c] || 1e-12;
    for (let k = c; k < 9; k++) rows[c][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = rows[r][c];
      if (f) for (let k = c; k < 9; k++) rows[r][k] -= f * rows[c][k];
    }
  }
  const h = rows.map((r) => r[8]);
  const at = (u: number, v: number): P => {
    const den = h[6] * u + h[7] * v + 1;
    return { x: (h[0] * u + h[1] * v + h[2]) / den, y: (h[3] * u + h[4] * v + h[5]) / den };
  };
  return [at(-mx, -my), at(1 + mx, -my), at(1 + mx, 1 + my), at(-mx, 1 + my)];
}
