// Straightens text lines that are still curved after the perspective is fixed (a page that bends, a sheet that was
// not lying flat). Each line of text is followed across the page in narrow vertical strips (points that bend unlike
// the neighbouring lines are dropped), and every column of pixels is moved up or down so that the lines become
// straight. Only vertical moves, so letters keep their shapes; where no lines are found the page is left as it is.

import type { Raster } from "./types";

/** How the lines of a page run: for each line, its height in the middle of the page and in every strip. */
export interface LineField {
  /** Height of each line at the middle of the page, from top to bottom. */
  at: number[];
  /** Height of each line at the centre of each of the vertical strips. */
  ys: Float64Array[];
}

const gray = (src: Raster): Float32Array => {
  const g = new Float32Array(src.width * src.height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * src.data[p] + 0.587 * src.data[p + 1] + 0.114 * src.data[p + 2];
  return g;
};

/** Mean of a box of radius r around every pixel (summed-area table). */
function boxMean(g: Float32Array, W: number, H: number, r: number): Float32Array {
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += g[y * W + x];
      S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      const sum = S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0];
      out[y * W + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Least squares polynomial of the given degree through (u, y); null when it cannot be solved. */
function polyFit(us: number[], ys: number[], degree: number): number[] | null {
  const n = degree + 1;
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < us.length; i++) {
    const pw = [1];
    for (let d = 1; d <= 2 * degree; d++) pw.push(pw[d - 1] * us[i]);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) A[r][c] += pw[r + c];
      A[r][n] += pw[r] * ys[i];
    }
  }
  for (let c = 0; c < n; c++) {
    let best = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[best][c])) best = r;
    if (Math.abs(A[best][c]) < 1e-12) return null;
    [A[c], A[best]] = [A[best], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const out = A.map((row, i) => row[n] / row[i]);
  while (out.length < 4) out.push(0);
  return out;
}

const curveAt = (c: number[], u: number) => c[0] + u * (c[1] + u * (c[2] + u * c[3]));

/** Finds and follows the lines of text of a straightened page; null when there are too few to rely on. */
export function traceLines(src: Raster): LineField | null {
  const { width: W, height: H } = src;
  if (W < 200 || H < 200) return null;
  const g = gray(src);
  // ink: clearly darker than its surroundings (uneven light does not matter)
  const bg = boxMean(g, W, H, Math.max(8, Math.round(Math.min(W, H) / 60)));
  const STRIPS = 24;
  const sw = W / STRIPS;
  const prof: Float32Array[] = [];
  for (let s = 0; s < STRIPS; s++) {
    const p = new Float32Array(H);
    const x0 = Math.round(s * sw), x1 = Math.round((s + 1) * sw);
    for (let y = 0; y < H; y++) {
      let n = 0;
      for (let x = x0; x < x1; x++) if (g[y * W + x] < bg[y * W + x] - 25) n++;
      p[y] = n;
    }
    prof.push(p);
  }
  // spacing of the lines: the strongest repeat of the middle strips' profile
  const mid = new Float32Array(H);
  for (let s = STRIPS / 2 - 2; s < STRIPS / 2 + 2; s++) for (let y = 0; y < H; y++) mid[y] += prof[s][y];
  const mean = mid.reduce((a, b) => a + b, 0) / H;
  let pitch = 0;
  let bestScore = 0;
  for (let lag = Math.round(H / 120); lag <= Math.round(H / 12); lag++) {
    let sc = 0;
    for (let y = 0; y + lag < H; y++) sc += (mid[y] - mean) * (mid[y + lag] - mean);
    sc /= H - lag;
    if (sc > bestScore) (bestScore = sc), (pitch = lag);
  }
  if (!pitch) return null;
  // smooth each profile over about a third of a line
  const r = Math.max(1, Math.round(pitch / 6));
  const smooth = (p: Float32Array) => {
    const o = new Float32Array(H);
    let acc = 0;
    for (let y = 0; y < H + r; y++) {
      if (y < H) acc += p[y];
      if (y - 2 * r - 1 >= 0) acc -= p[y - 2 * r - 1];
      if (y - r >= 0 && y - r < H) o[y - r] = acc;
    }
    return o;
  };
  const sp = prof.map(smooth);
  const sm = smooth(mid);
  // lines in the middle of the page: peaks at least 0.6 lines apart and reasonably strong
  const sorted = Array.from(sm).sort((a, b) => a - b);
  const strong = sorted[Math.floor(H * 0.95)] * 0.3;
  const half = Math.round(pitch * 0.3);
  const seeds: number[] = [];
  for (let y = half; y < H - half; y++) {
    if (sm[y] < strong) continue;
    let top = true;
    for (let d = -half; d <= half && top; d++) if (sm[y + d] > sm[y] || (d < 0 && sm[y + d] === sm[y])) top = false;
    if (top) seeds.push(y);
  }
  if (seeds.length < 6) return null;

  // follow every line out to both sides, strip by strip, and fit a smooth curve to where it was found
  const window = Math.max(2, Math.round(pitch * 0.2));
  const field: { at: number; ys: (number | null)[]; err: number }[] = [];
  for (const seed of seeds) {
    const ys: (number | null)[] = new Array(STRIPS).fill(null);
    const startL = STRIPS / 2 - 1, startR = STRIPS / 2;
    const level = (sp[startL][seed] + sp[startR][seed]) / 2;
    const gapR = Math.round(pitch * 0.5);
    const follow = (from: number, to: number, step: number) => {
      // where the line is expected next: the last place it was seen, plus its recent slope
      let y = seed;
      let slope = 0;
      let lastS = -1;
      for (let s = from; s !== to; s += step) {
        const expect = y + slope * (lastS < 0 ? 0 : Math.abs(s - lastS));
        let best = -1, bestV = 0;
        for (let d = -window; d <= window; d++) {
          const yy = Math.round(expect) + d;
          if (yy < 0 || yy >= H) continue;
          if (sp[s][yy] > bestV) (bestV = sp[s][yy]), (best = yy);
        }
        if (best < 0 || bestV < Math.max(level * 0.3, 2)) continue;
        // only a clear line counts: the paper above and below it is much lighter
        let above = Infinity, below = Infinity;
        for (let d = Math.round(pitch * 0.3); d <= gapR; d++) {
          if (best - d >= 0) above = Math.min(above, sp[s][best - d]);
          if (best + d < H) below = Math.min(below, sp[s][best + d]);
        }
        if (above > bestV * 0.6 || below > bestV * 0.6) continue;
        const a = sp[s][best - 1] ?? 0, b = sp[s][best + 1] ?? 0;
        const den = a - 2 * bestV + b;
        const at = best + (den < 0 ? (0.5 * (a - b)) / den : 0);
        if (lastS >= 0) slope = Math.max(-pitch * 0.08, Math.min(pitch * 0.08, (at - y) / Math.abs(s - lastS)));
        ys[s] = at;
        y = at;
        lastS = s;
      }
    };
    follow(startL, -1, -1);
    follow(startR, STRIPS, 1);
    let us: number[] = [], vs: number[] = [];
    ys.forEach((y, s) => {
      if (y !== null) us.push((s + 0.5) / STRIPS - 0.5), vs.push(y);
    });
    if (us.length < 8) continue;
    // points that leave a smooth curve by much are jumps to the neighbouring line; the others are kept as measured,
    // so a sharp bend near the edge of the page is followed too
    const c = polyFit(us, vs, 3);
    if (!c) continue;
    let err = 0, kept = 0;
    ys.forEach((y, s) => {
      if (y === null) return;
      const d = Math.abs(curveAt(c, (s + 0.5) / STRIPS - 0.5) - y);
      if (d > pitch * 0.25) ys[s] = null;
      else (err += d * d), kept++;
    });
    if (kept < 8) continue;
    err = Math.sqrt(err / kept);
    if (err > pitch * 0.12) continue;
    field.push({ at: curveAt(c, 0), ys, err });
  }
  if (field.length < 6) return null;
  field.sort((a, b) => a.at - b.at);
  // a page bends smoothly, so nearby lines bend alike: a point that bends unlike its neighbouring lines (a jump to
  // another line, a mark beside the text) is dropped, and so is a line left with too few points
  const off = (f: (typeof field)[number], s: number) => (f.ys[s] === null ? null : f.ys[s]! - f.at);
  const drop: [number, number][] = [];
  field.forEach((f, i) => {
    for (let s = 0; s < STRIPS; s++) {
      const mine = off(f, s);
      if (mine === null) continue;
      const near: number[] = [];
      for (let j = Math.max(0, i - 3); j <= Math.min(field.length - 1, i + 3); j++) {
        const o = j === i ? null : off(field[j], s);
        if (o !== null) near.push(o);
      }
      if (near.length < 2) continue;
      near.sort((a, b) => a - b);
      const med = near[near.length >> 1];
      if (Math.abs(mine - med) > pitch * 0.25 || Math.abs(mine) > pitch) drop.push([i, s]);
    }
  });
  for (const [i, s] of drop) field[i].ys[s] = null;
  for (let i = field.length - 1; i >= 0; i--) if (field[i].ys.filter((y) => y !== null).length < 8) field.splice(i, 1);
  if (field.length < 6) return null;
  // gaps inside a line: straight between the points on both sides
  for (const f of field) {
    let last = -1;
    for (let s = 0; s < STRIPS; s++) {
      if (f.ys[s] === null) continue;
      if (last >= 0 && s - last > 1) for (let t = last + 1; t < s; t++) f.ys[t] = f.ys[last]! + ((f.ys[s]! - f.ys[last]!) * (t - last)) / (s - last);
      last = s;
    }
  }
  // beyond its ends a line follows the shape of the nearest lines above and below that reach there
  const filled = field.map((f) => Float64Array.from(f.ys, (y) => (y === null ? NaN : y)));
  field.forEach((f, i) => {
    const seen = f.ys.map((y) => y !== null);
    const first = seen.indexOf(true), lastSeen = seen.lastIndexOf(true);
    for (let s = 0; s < STRIPS; s++) {
      if (seen[s]) continue;
      const edge = s < first ? first : lastSeen;
      const deltas: number[] = [];
      for (const dir of [-1, 1]) {
        for (let j = i + dir; j >= 0 && j < field.length; j += dir) {
          const o = field[j].ys;
          if (o[s] !== null && o[edge] !== null) {
            deltas.push(o[s]! - o[edge]!);
            break;
          }
        }
      }
      filled[i][s] = f.ys[edge]! + (deltas.length ? deltas.reduce((x, y) => x + y, 0) / deltas.length : 0);
    }
  });
  // a light smoothing along each line against the jitter of single strips
  const lines = filled.map((y) => y.map((v, s) => (s === 0 || s === STRIPS - 1 ? v : (y[s - 1] + 2 * v + y[s + 1]) / 4)));
  // two lines may not cross or come much closer than half a line anywhere
  const order = field.map((f, i) => ({ at: f.at, ys: lines[i], err: f.err }));
  const clean: typeof order = [];
  for (const f of order) {
    const prev = clean[clean.length - 1];
    if (prev && f.ys.some((y, s) => y - prev.ys[s] < pitch * 0.5)) {
      if (f.err < prev.err) clean[clean.length - 1] = f;
      continue;
    }
    clean.push(f);
  }
  if (clean.length < 6) return null;
  return { at: clean.map((f) => f.at), ys: clean.map((f) => f.ys) };
}

/** A line's height at x: straight between the strip centres, level beyond the outer ones. */
function sampleLine(ys: Float64Array, x: number, W: number): number {
  const n = ys.length;
  const t = (x / W) * n - 0.5;
  if (t <= 0) return ys[0];
  if (t >= n - 1) return ys[n - 1];
  const i = Math.floor(t);
  return ys[i] + (t - i) * (ys[i + 1] - ys[i]);
}

/** Where row y of column x of the straightened result comes from. */
function sourceRow(f: LineField, x: number, y: number, W: number): number {
  const n = f.at.length;
  if (y <= f.at[0]) return y + (sampleLine(f.ys[0], x, W) - f.at[0]);
  if (y >= f.at[n - 1]) return y + (sampleLine(f.ys[n - 1], x, W) - f.at[n - 1]);
  let i = 0;
  while (i < n - 2 && f.at[i + 1] < y) i++;
  const t = (y - f.at[i]) / (f.at[i + 1] - f.at[i]);
  const a = sampleLine(f.ys[i], x, W);
  return a + t * (sampleLine(f.ys[i + 1], x, W) - a);
}

/** Where a point of the page before straightening the lines ends up after it. */
export function movePoint(f: LineField, p: { x: number; y: number }, W: number): { x: number; y: number } {
  // the rows of a column keep their order, so the row that comes from p.y is found by halving
  let lo = -W, hi = 2 * W + 4 * Math.abs(p.y);
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (sourceRow(f, p.x, mid, W) < p.y) lo = mid;
    else hi = mid;
  }
  return { x: p.x, y: (lo + hi) / 2 };
}

/**
 * Moves every column of pixels up or down so that the traced lines become straight (each stays at its height in the
 * middle of the page). Between two lines the move changes evenly; above the first and below the last line it stays
 * as at that line.
 */
export function flattenLines(src: Raster, f: LineField): Raster {
  const { width: W, height: H } = src;
  const out = new Uint8ClampedArray(W * H * 4);
  const ws = [0, 0, 0, 0];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const sy = sourceRow(f, x + 0.5, y, W);
      const y0 = Math.floor(sy);
      const t = sy - y0;
      // Catmull-Rom along the column keeps the letters sharp
      ws[0] = ((-0.5 * t + 1) * t - 0.5) * t;
      ws[1] = (1.5 * t - 2.5) * t * t + 1;
      ws[2] = ((-1.5 * t + 2) * t + 0.5) * t;
      ws[3] = (0.5 * t - 0.5) * t * t;
      const o = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let v = 0;
        for (let k = 0; k < 4; k++) {
          const yy = Math.min(H - 1, Math.max(0, y0 - 1 + k));
          v += ws[k] * src.data[(yy * W + x) * 4 + ch];
        }
        out[o + ch] = v;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}
