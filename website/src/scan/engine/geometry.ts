import type { Paper, Pt, Quad, TextArea } from "./types";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Area of a polygon (shoelace formula). */
export function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** True when the four corners form a convex shape (no bow-tie, no dent). */
export function isConvex(q: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const c = q[(i + 2) % q.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** A usable page outline: convex, not tiny, every side at least `minSide` pixels. */
export function isValidQuad(q: Quad, width: number, height: number, minSide = 16): boolean {
  if (q.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  if (!isConvex(q)) return false;
  if (polygonArea(q) < width * height * 0.01) return false;
  return q.every((p, i) => dist(p, q[(i + 1) % 4]) >= minSide);
}

/** Orders four unordered points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(points: Pt[]): Quad {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.x - a.y - (b.x - b.y));
  return [bySum[0], byDiff[byDiff.length - 1], bySum[bySum.length - 1], byDiff[0]];
}

/** A frame a little inside the picture, used when nothing is recognised. */
export function defaultQuad(width: number, height: number, inset = 0.06): Quad {
  return [
    { x: width * inset, y: height * inset },
    { x: width * (1 - inset), y: height * inset },
    { x: width * (1 - inset), y: height * (1 - inset) },
    { x: width * inset, y: height * (1 - inset) },
  ];
}

export const scaleQuad = (q: Quad, kx: number, ky = kx): Quad => q.map((p) => ({ x: p.x * kx, y: p.y * ky })) as Quad;
/** A text area of a picture `k` times as large. */
export const scaleText = (t: TextArea | undefined, k: number): TextArea | undefined =>
  t && { block: scaleQuad(t.block, k), others: t.others.map((o) => o.map((p) => ({ x: p.x * k, y: p.y * k }))) };

/** Keeps the corners inside the picture, allowing `margin` (fraction of the size) beyond its edges. */
export function clampQuad(q: Quad, width: number, height: number, margin = 0.15): Quad {
  return q.map((p) => ({ x: clamp(p.x, -width * margin, width * (1 + margin)), y: clamp(p.y, -height * margin, height * (1 + margin)) })) as Quad;
}

/**
 * Homography h[0..7] that maps the unit square (0,0)(1,0)(1,1)(0,1) onto `quad`:
 * x = (h0 u + h1 v + h2) / (h6 u + h7 v + 1), y = (h3 u + h4 v + h5) / (h6 u + h7 v + 1).
 * Solved by Gaussian elimination with partial pivoting; throws when the corners are degenerate.
 */
export function homography(quad: Quad): number[] {
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const m: number[][] = [];
  uv.forEach(([u, v], i) => {
    const { x, y } = quad[i];
    m.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    m.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  });
  for (let c = 0; c < 8; c++) {
    let best = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r][c]) > Math.abs(m[best][c])) best = r;
    if (Math.abs(m[best][c]) < 1e-12) throw new Error("degenerate quad");
    [m[c], m[best]] = [m[best], m[c]];
    const d = m[c][c];
    for (let k = c; k < 9; k++) m[c][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f) for (let k = c; k < 9; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row) => row[8]);
}

/** The (u, v) of a point of the photo inside the unit square that `h` maps onto the quad (the inverse of applyHomography). */
export function applyInverse(h: number[], p: Pt): Pt {
  const [a, b, c, d, e, f, g, hh] = h;
  // inverse of [[a,b,c],[d,e,f],[g,hh,1]] by cofactors
  const A = e - f * hh, B = -(d - f * g), C = d * hh - e * g;
  const det = a * A + b * B + c * C;
  const m = [A, -(b - c * hh), b * f - c * e, B, a - c * g, -(a * f - c * d), C, -(a * hh - b * g), a * e - b * d].map((x) => x / det);
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

export function applyHomography(h: number[], u: number, v: number): Pt {
  const den = h[6] * u + h[7] * v + 1;
  return { x: (h[0] * u + h[1] * v + h[2]) / den, y: (h[3] * u + h[4] * v + h[5]) / den };
}

/**
 * Size of the straightened page: the average of opposite sides, optionally forced to an A4 shape with the same number
 * of pixels, enlarged when smaller than `minLong`, and scaled down so the longest side is at most `maxSide`.
 */
export function outputSize(q: Quad, paper: Paper, maxSide = 6000, minLong = 0): { w: number; h: number } {
  let w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  let h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const px = w * h;
  // a page that is nearly A4 (within 8%) is made exactly A4: the measured sides are only estimates
  const ratio = Math.max(w, h) / Math.min(w, h);
  if (paper === "auto" && Math.abs(ratio / Math.SQRT2 - 1) < 0.08) paper = w <= h ? "a4p" : "a4l";
  if (paper === "a4p") {
    w = Math.sqrt(px / Math.SQRT2);
    h = w * Math.SQRT2;
  } else if (paper === "a4l") {
    h = Math.sqrt(px / Math.SQRT2);
    w = h * Math.SQRT2;
  }
  // a small page is enlarged (at most 2x) up to `minLong`, then the cap applies
  const up = minLong > 0 ? clamp(minLong / Math.max(w, h), 1, 2) : 1;
  w *= up;
  h *= up;
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(16, Math.round(w * k)), h: Math.max(16, Math.round(h * k)) };
}
