import { boxBlur } from "./filters";
import { flattenLines, movePoint, traceLines } from "./lines";
import { applyInverse, clamp, dist, homography, outputSize, scaleQuad } from "./geometry";
import type { Pt, Quad, Raster, RenderOptions, Turns } from "./types";

/** Catmull-Rom weights for the four taps around a position with fraction t. */
function weights(t: number, w: Float32Array) {
  w[0] = ((-0.5 * t + 1) * t - 0.5) * t;
  w[1] = (1.5 * t - 2.5) * t * t + 1;
  w[2] = ((-1.5 * t + 2) * t + 0.5) * t;
  w[3] = (0.5 * t - 0.5) * t * t;
}

/** Averages blocks of `factor` x `factor` pixels (used before shrinking a page a lot, to avoid jagged text). */
export function downscaleRaster(src: Raster, factor: number): Raster {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return src;
  const W = Math.max(1, Math.floor(src.width / f));
  const H = Math.max(1, Math.floor(src.height / f));
  const out = new Uint8ClampedArray(W * H * 4);
  const area = f * f;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let yy = 0; yy < f; yy++) {
        let p = ((y * f + yy) * src.width + x * f) * 4;
        for (let xx = 0; xx < f; xx++, p += 4) (r += src.data[p]), (g += src.data[p + 1]), (b += src.data[p + 2]);
      }
      const o = (y * W + x) * 4;
      out[o] = r / area;
      out[o + 1] = g / area;
      out[o + 2] = b / area;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}

/**
 * Stretches the quadrilateral `quad` of `src` onto an outW x outH rectangle (perspective transform, bicubic
 * resampling). Parts of the quadrilateral that lie outside the photo become white paper.
 */
export function warpPerspective(src: Raster, quad: Quad, outW: number, outH: number, outside: "white" | "edge" = "white"): Raster {
  const h = homography(quad);
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width: W, height: H } = src;
  const wx = new Float32Array(4);
  const wy = new Float32Array(4);
  for (let j = 0; j < outH; j++) {
    const v = (j + 0.5) / outH;
    for (let i = 0; i < outW; i++) {
      const u = (i + 0.5) / outW;
      const den = h[6] * u + h[7] * v + 1;
      const x = (h[0] * u + h[1] * v + h[2]) / den - 0.5;
      const y = (h[3] * u + h[4] * v + h[5]) / den - 0.5;
      const o = (j * outW + i) * 4;
      if (outside === "white" && !(x > -1 && y > -1 && x < W && y < H)) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255;
        continue;
      }
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      weights(x - ix, wx);
      weights(y - iy, wy);
      let r = 0, g = 0, b = 0;
      for (let m = 0; m < 4; m++) {
        const yy = clamp(iy - 1 + m, 0, H - 1);
        for (let n = 0; n < 4; n++) {
          const xx = clamp(ix - 1 + n, 0, W - 1);
          const wgt = wx[n] * wy[m];
          const p = (yy * W + xx) * 4;
          r += data[p] * wgt;
          g += data[p + 1] * wgt;
          b += data[p + 2] * wgt;
        }
      }
      out[o] = r; // Uint8ClampedArray rounds and clamps
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

/** Largest value in a window of radius r around each pixel (separable). */
function maxFilter(a: Float32Array, W: number, H: number, r: number): Float32Array {
  const pass = (src: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(src.length);
    const n = horizontal ? W : H;
    const lines = horizontal ? H : W;
    for (let l = 0; l < lines; l++) {
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) {
          const v = src[horizontal ? l * W + k : k * W + l];
          if (v > m) m = v;
        }
        out[horizontal ? l * W + i : i * W + l] = m;
      }
    }
    return out;
  };
  return pass(pass(a, true), false);
}

/**
 * "White paper": every colour channel is divided by the brightness of the paper around it, so shadows, uneven light
 * and a colour cast disappear and the paper turns white, while printed text keeps its colour and darkness. The paper
 * level is estimated from the brightest pixels nearby (text is thin, so some paper is always in reach), then smoothed.
 */
export function whitenPaper(src: Raster, level: Raster = src): Raster {
  const { width: W, height: H, data } = src;
  const ld = level.data; // where the paper level is measured (the same page, extended at its edges instead of white)
  const f = Math.max(1, Math.round(Math.max(W, H) / 300));
  const sw = Math.max(2, Math.floor(W / f));
  const sh = Math.max(2, Math.floor(H / f));
  const out = new Uint8ClampedArray(W * H * 4);
  const reach = Math.max(3, Math.round(Math.max(sw, sh) / 28));
  for (let c = 0; c < 3; c++) {
    const small = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let s = 0;
        for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) s += ld[(Math.min(H - 1, y * f + yy) * W + Math.min(W - 1, x * f + xx)) * 4 + c];
        small[y * sw + x] = s / (f * f);
      }
    }
    const bg = boxBlur(maxFilter(small, sw, sh, reach), sw, sh, Math.max(2, Math.round(reach / 2)));
    for (let y = 0; y < H; y++) {
      const fy = clamp(y / f - 0.5, 0, sh - 1.001);
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = clamp(x / f - 0.5, 0, sw - 1.001);
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const b = (bg[y0 * sw + x0] * (1 - tx) + bg[y0 * sw + x0 + 1] * tx) * (1 - ty) + (bg[(y0 + 1) * sw + x0] * (1 - tx) + bg[(y0 + 1) * sw + x0 + 1] * tx) * ty;
        // 0.94 of the paper level counts as white: a little room for noise and for text that sits on shaded paper
        out[(y * W + x) * 4 + c] = (data[(y * W + x) * 4 + c] / Math.max(40, b)) * (255 / 0.94);
      }
    }
  }
  for (let i = 0; i < W * H; i++) out[i * 4 + 3] = 255;
  return { data: out, width: W, height: H };
}

/**
 * "Clean page": grey, with uneven light and shadows removed by dividing the page by a heavy blur of itself, so
 * that the paper turns white and the printed text keeps its shape. Colours are not kept.
 */
export function cleanPage(src: Raster): Raster {
  const { width: W, height: H } = src;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = (src.data[i * 4] * 299 + src.data[i * 4 + 1] * 587 + src.data[i * 4 + 2] * 114) / 1000;
  // the blur only needs a low resolution picture
  const f = Math.max(1, Math.round(Math.max(W, H) / 360));
  const sw = Math.max(2, Math.floor(W / f));
  const sh = Math.max(2, Math.floor(H / f));
  const small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let s = 0;
      for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) s += gray[Math.min(H - 1, y * f + yy) * W + Math.min(W - 1, x * f + xx)];
      small[y * sw + x] = s / (f * f);
    }
  }
  const bg = boxBlur(small, sw, sh, Math.max(6, Math.round(Math.max(sw, sh) / 14)));
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const fy = clamp(y / f - 0.5, 0, sh - 1.001);
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = clamp(x / f - 0.5, 0, sw - 1.001);
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const b =
        (bg[y0 * sw + x0] * (1 - tx) + bg[y0 * sw + x0 + 1] * tx) * (1 - ty) + (bg[(y0 + 1) * sw + x0] * (1 - tx) + bg[(y0 + 1) * sw + x0 + 1] * tx) * ty;
      const ratio = gray[y * W + x] / Math.max(24, b); // 1 on paper, lower on ink
      const v = clamp(((ratio - 0.15) / (0.92 - 0.15)) * 255, 0, 255);
      const o = (y * W + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}

/**
 * Unsharp mask: adds back `amount` times the difference between each channel and a slightly blurred copy, which
 * makes the edges of printed text crisper after the photo was resampled. Colours stay as they are.
 */
export function sharpen(src: Raster, amount = 0.9): Raster {
  const { width: W, height: H, data } = src;
  const out = new Uint8ClampedArray(data.length);
  const plane = new Float32Array(W * H);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < W * H; i++) plane[i] = data[i * 4 + c];
    const blurred = boxBlur(plane, W, H, 1);
    for (let i = 0; i < W * H; i++) out[i * 4 + c] = plane[i] + amount * (plane[i] - blurred[i]);
  }
  for (let i = 0; i < W * H; i++) out[i * 4 + 3] = 255;
  return { data: out, width: W, height: H };
}

/**
 * Clean margins. Starting from the edge of the page, everything that is not white paper and is connected to the edge is
 * turned white: the edge of the sheet, a neighbouring sheet, the table, a shadow. Inside the rectangle that holds the
 * text (plus pad pixels) only light grey is removed this way, never dark ink, so the text is untouched. Outside that
 * rectangle light marks are whitened as well, and beside it (left and right) everything. Dark marks that stand alone
 * above or below the text, such as a page number, stay.
 */
export function cleanMargins(src: Raster, text: { x0: number; y0: number; x1: number; y1: number }, pad: number): Raster {
  const { width: W, height: H } = src;
  const out = new Uint8ClampedArray(src.data);
  const x0 = Math.max(0, Math.floor(text.x0 - pad)), x1 = Math.min(W - 1, Math.ceil(text.x1 + pad));
  const y0 = Math.max(0, Math.floor(text.y0 - pad)), y1 = Math.min(H - 1, Math.ceil(text.y1 + pad));
  const margin = (x: number, y: number) => x < x0 || x > x1 || y < y0 || y > y1;
  const lum = (p: number) => (out[p * 4] + out[p * 4 + 1] + out[p * 4 + 2]) / 3;
  const white = (p: number) => (out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = 255);
  const PAPER = 238; // at least this bright counts as paper
  const INK = 150; // darker than this is ink
  // what touches the edge of the page and is not paper
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * W + x;
    if (seen[p]) return;
    const v = lum(p);
    if (v >= PAPER) return;
    if (v < INK && !margin(x, y)) return; // ink near the text is never touched
    seen[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % W;
    const y = (p - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  for (let p = 0; p < W * H; p++) if (seen[p]) white(p);
  // light marks in the margins; beside the text (left and right) everything, since what sits there is text of another
  // sheet or the edge of one, while a page number or a header sits above or below the text
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < x0 || x > x1 || (margin(x, y) && lum(y * W + x) > INK)) white(y * W + x);
  return { data: out, width: W, height: H };
}

/**
 * Removes the text of other sheets: every mark (letter) that lies mostly inside one of the outlines turns white, as
 * does the paper inside them. A letter of the page that only touches an outline stays whole.
 */
export function clearPatches(src: Raster, outlines: Pt[][]): Raster {
  const { width: W, height: H } = src;
  const out = new Uint8ClampedArray(src.data);
  // which pixels are inside an outline (even-odd fill, row by row)
  const inside = new Uint8Array(W * H);
  for (const poly of outlines) {
    const ys = poly.map((p) => p.y);
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    for (let y = top; y <= bottom; y++) {
      const cy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[i + 1] - 0.5)); x++) inside[y * W + x] = 1;
      }
    }
  }
  const lum = (p: number) => (out[p * 4] + out[p * 4 + 1] + out[p * 4 + 2]) / 3;
  const white = (p: number) => (out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = 255);
  const MARK = 200; // darker than this is part of a mark
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const piece: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!inside[s] || seen[s] || lum(s) >= MARK) continue;
    // the whole mark, also the part outside the outline
    piece.length = 0;
    seen[s] = 1;
    stack.push(s);
    let inner = 0;
    while (stack.length) {
      const q = stack.pop()!;
      piece.push(q);
      inner += inside[q];
      const x = q % W;
      const y = (q - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const r = ny * W + nx;
        if (!seen[r] && lum(r) < MARK) (seen[r] = 1), stack.push(r);
      }
    }
    if (inner >= piece.length * 0.6) for (const q of piece) white(q);
  }
  for (let p = 0; p < W * H; p++) if (inside[p] && lum(p) >= MARK) white(p);
  return { data: out, width: W, height: H };
}

/** Black and white: the clean page cut at a fixed level. */
export function blackAndWhite(src: Raster): Raster {
  const page = cleanPage(src);
  for (let i = 0; i < page.width * page.height; i++) {
    const v = page.data[i * 4] > 205 ? 255 : 0;
    page.data[i * 4] = page.data[i * 4 + 1] = page.data[i * 4 + 2] = v;
  }
  return page;
}

/** Rotates by quarter turns clockwise. */
export function rotateRaster(src: Raster, turns: Turns): Raster {
  if (turns === 0) return src;
  const { width: W, height: H, data } = src;
  const swap = turns % 2 === 1;
  const outW = swap ? H : W;
  const outH = swap ? W : H;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let nx: number, ny: number;
      if (turns === 1) (nx = H - 1 - y), (ny = x);
      else if (turns === 2) (nx = W - 1 - x), (ny = H - 1 - y);
      else (nx = y), (ny = W - 1 - x);
      const s = (y * W + x) * 4;
      const d = (ny * outW + nx) * 4;
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

/** The whole job on pixels: straighten the page, apply the look, rotate. */
export function renderRaster(src: Raster, o: Pick<RenderOptions, "quad" | "look" | "paper" | "turns" | "maxSide" | "text"> & { minLong?: number }): Raster {
  const { w, h } = outputSize(o.quad, o.paper, o.maxSide, o.minLong);
  // shrinking a lot: average the photo first so the text does not turn jagged
  const sideNow = (dist(o.quad[0], o.quad[1]) + dist(o.quad[3], o.quad[2])) / 2;
  const f = Math.floor(sideNow / w / 1.5);
  let source = src;
  let quad = o.quad;
  if (f >= 2) {
    source = downscaleRaster(src, f);
    quad = scaleQuad(o.quad, source.width / src.width, source.height / src.height);
  }
  let page = warpPerspective(source, quad, w, h);
  // lines that still bend (paper that was not lying flat) are made straight
  const lines = traceLines(page);
  if (lines) page = flattenLines(page, lines);
  if (o.look === "white") {
    // the paper level is read from a copy whose edges are extended, so the white outside the photo cannot lift it
    const level = warpPerspective(source, quad, w, h, "edge");
    page = whitenPaper(page, lines ? flattenLines(level, lines) : level);
  } else if (o.look === "clean") {
    page = cleanPage(page);
  } else if (o.look === "bw") {
    page = blackAndWhite(page);
  }
  if (o.look !== "bw") page = sharpen(page);
  if (o.text && o.look !== "color") {
    // where the text is on the finished page
    const hq = homography(o.quad);
    const onPage = (ps: Pt[]) =>
      ps.map((p) => applyInverse(hq, p)).map((p) => (lines ? movePoint(lines, { x: p.x * w, y: p.y * h }, w) : { x: p.x * w, y: p.y * h }));
    const pts = onPage(o.text.block);
    const text = { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
    if (text.x1 - text.x0 > w * 0.2 && text.y1 - text.y0 > h * 0.2) {
      if (o.text.others.length) page = clearPatches(page, o.text.others.map(onPage));
      page = cleanMargins(page, text, Math.max(w, h) * 0.012);
    }
  }
  if (o.look === "white") {
    // paper that is almost white becomes white: no faint grey patches or noise, letters keep their edges
    const d = page.data;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] >= 3 * 232) d[i] = d[i + 1] = d[i + 2] = 255;
  }
  return rotateRaster(page, o.turns);
}
