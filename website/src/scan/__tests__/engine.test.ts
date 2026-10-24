import { describe, expect, it } from "vitest";
import { detectDocument, detectByEdges, detectByText } from "../engine/detect";
import { applyHomography, applyInverse, clampQuad, defaultQuad, homography, isConvex, isValidQuad, orderCorners, outputSize, polygonArea } from "../engine/geometry";
import { analyze, render } from "../engine/pipeline";
import { ScanError } from "../engine/types";
import type { Quad } from "../engine/types";
import { cleanMargins, cleanPage, rotateRaster, sharpen, warpPerspective, whitenPaper } from "../engine/warp";
import { blank, leftMarginSlope, lineSkewDegrees, makePage, meanAbsDiff, photograph } from "./synthetic";

const q = (...p: number[]): Quad => [
  { x: p[0], y: p[1] },
  { x: p[2], y: p[3] },
  { x: p[4], y: p[5] },
  { x: p[6], y: p[7] },
];
const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe("geometry", () => {
  it("homography maps the unit square corners onto the quad and back", () => {
    const quad = q(120, 90, 700, 60, 730, 900, 90, 940);
    const h = homography(quad);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
      const p = applyHomography(h, u, v);
      expect(p.x).toBeCloseTo(quad[i].x, 6);
      expect(p.y).toBeCloseTo(quad[i].y, 6);
    });
    const mid = applyHomography(h, 0.5, 0.5);
    expect(mid.x).toBeGreaterThan(300);
    expect(mid.x).toBeLessThan(600);
  });

  it("rejects degenerate outlines", () => {
    expect(() => homography(q(0, 0, 10, 10, 20, 20, 30, 30))).toThrow();
    expect(isConvex(q(0, 0, 100, 100, 100, 0, 0, 100))).toBe(false); // bow-tie
    expect(isValidQuad(q(0, 0, 100, 100, 100, 0, 0, 100), 200, 200)).toBe(false);
    expect(isValidQuad(q(10, 10, 14, 10, 14, 14, 10, 14), 1000, 1000)).toBe(false); // tiny
    expect(isValidQuad(q(NaN, 0, 100, 0, 100, 100, 0, 100), 200, 200)).toBe(false);
    expect(isValidQuad(q(10, 10, 190, 10, 190, 190, 10, 190), 200, 200)).toBe(true);
  });

  it("orders corners whatever the input order", () => {
    const pts = [{ x: 90, y: 940 }, { x: 700, y: 60 }, { x: 730, y: 900 }, { x: 120, y: 90 }];
    const o = orderCorners(pts);
    expect(o[0]).toEqual({ x: 120, y: 90 });
    expect(o[1]).toEqual({ x: 700, y: 60 });
    expect(o[2]).toEqual({ x: 730, y: 900 });
    expect(o[3]).toEqual({ x: 90, y: 940 });
  });

  it("sizes the result from opposite sides, with A4 and a size cap", () => {
    expect(outputSize(q(0, 0, 400, 0, 400, 600, 0, 600), "photo")).toEqual({ w: 400, h: 600 });
    const a4 = outputSize(q(0, 0, 400, 0, 400, 600, 0, 600), "a4p");
    expect(a4.h / a4.w).toBeCloseTo(Math.SQRT2, 2);
    expect(Math.abs(a4.w * a4.h - 240000) / 240000).toBeLessThan(0.01);
    const land = outputSize(q(0, 0, 400, 0, 400, 600, 0, 600), "a4l");
    expect(land.w / land.h).toBeCloseTo(Math.SQRT2, 2);
    const capped = outputSize(q(0, 0, 8000, 0, 8000, 4000, 0, 4000), "photo", 4000);
    expect(capped).toEqual({ w: 4000, h: 2000 });
    expect(polygonArea(q(0, 0, 10, 0, 10, 10, 0, 10))).toBe(100);
    // small pages are enlarged for reading, at most twice; big ones are left alone
    expect(outputSize(q(0, 0, 850, 0, 850, 1200, 0, 1200), "photo", 6000, 1700)).toEqual({ w: 1204, h: 1700 });
    expect(outputSize(q(0, 0, 400, 0, 400, 600, 0, 600), "photo", 6000, 1700)).toEqual({ w: 800, h: 1200 });
    // "auto" makes a page that is close to A4 exactly A4 (same number of pixels) and leaves other shapes alone
    const near = outputSize(q(0, 0, 400, 0, 400, 600, 0, 600), "auto");
    expect(near.h / near.w).toBeCloseTo(Math.SQRT2, 2);
    expect(Math.abs(near.w * near.h - 240000) / 240000).toBeLessThan(0.01);
    const wide = outputSize(q(0, 0, 600, 0, 600, 400, 0, 400), "auto");
    expect(wide.w / wide.h).toBeCloseTo(Math.SQRT2, 2); // landscape A4
    expect(outputSize(q(0, 0, 400, 0, 400, 400, 0, 400), "auto")).toEqual({ w: 400, h: 400 }); // a square is not A4
    expect(outputSize(q(0, 0, 400, 0, 400, 800, 0, 800), "auto")).toEqual({ w: 400, h: 800 }); // neither is 1:2
    expect(outputSize(q(0, 0, 2000, 0, 2000, 3000, 0, 3000), "photo", 6000, 1700)).toEqual({ w: 2000, h: 3000 });
    expect(outputSize(q(0, 0, 400, 0, 400, 600, 0, 600), "photo", 500, 1700)).toEqual({ w: 333, h: 500 });
    const c = clampQuad(q(-500, -500, 2000, 0, 2000, 2000, 0, 2000), 1000, 1000, 0.1);
    expect(c[0].x).toBe(-100);
    expect(c[1].x).toBe(1100);
  });
});

describe("finding the page", () => {
  const page = makePage();

  it("finds the page lying on a dark table and levels the text, not just the paper", () => {
    const truth = q(120, 90, 700, 60, 730, 900, 90, 940);
    const photo = photograph(page.raster, truth, 800, 1000);
    const d = detectDocument(photo);
    expect(d.method).toBe("both"); // aligned to the text, cut at the paper
    d.quad.forEach((p, i) => expect(near(p, truth[i], 34)).toBe(true));
    const out = render(photo, { quad: d.quad, look: "color", paper: "auto", turns: 0, format: "jpeg" });
    expect(Math.abs(lineSkewDegrees(out))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(leftMarginSlope(out))).toBeLessThan(0.015);
    // the paper edges alone are only an approximation of the page and leave the text slanted
    const raw = render(photo, { quad: detectByEdges(photo)!, look: "color", paper: "auto", turns: 0, format: "jpeg" });
    expect(Math.abs(lineSkewDegrees(out))).toBeLessThanOrEqual(Math.abs(lineSkewDegrees(raw)) + 0.01);
  });

  it("uses the paper edges alone when there is no text, and still straightens ragged text", () => {
    const truth = q(120, 90, 700, 60, 730, 900, 90, 940);
    const blankPage = blank(700, 990, 250);
    const d = detectDocument(photograph(blankPage, truth, 800, 1000));
    expect(d.method).toBe("edges");
    d.quad.forEach((p, i) => expect(near(p, truth[i], 24)).toBe(true));
    const ragged = makePage(700, 990, 11, false);
    const r = detectDocument(photograph(ragged.raster, truth, 800, 1000));
    expect(["both", "edges", "text"]).toContain(r.method);
    r.quad.forEach((p, i) => expect(near(p, truth[i], 40)).toBe(true));
    const rr = render(photograph(ragged.raster, truth, 800, 1000), { quad: r.quad, look: "color", paper: "auto", turns: 0, format: "jpeg" });
    expect(Math.abs(lineSkewDegrees(rr))).toBeLessThanOrEqual(0.75);
  });

  it("falls back to the lines of text when the edges of the paper are out of the picture", () => {
    const truth = q(-70, -40, 880, -90, 930, 1080, -110, 1040);
    const photo = photograph(page.raster, truth, 800, 1000);
    expect(detectByEdges(photo)).toBeNull();
    const d = detectDocument(photo);
    expect(d.method).toBe("text");
    // the straightened page has level lines and an upright margin
    const out = render(photo, { quad: d.quad, look: "color", paper: "auto", turns: 0, format: "jpeg" });
    expect(Math.abs(lineSkewDegrees(out))).toBeLessThanOrEqual(0.75);
    expect(Math.abs(leftMarginSlope(out))).toBeLessThan(0.02);
  });

  it("returns a default frame when there is nothing to find", () => {
    const d = analyze(blank(400, 500, 200));
    expect(d.method).toBe("none");
    expect(d.quad).toEqual(defaultQuad(400, 500));
    expect(detectByText(blank(400, 500, 200))).toBeNull();
  });
});

describe("straightening", () => {
  const page = makePage();
  const truth = q(120, 90, 700, 60, 730, 900, 90, 940);
  const photo = photograph(page.raster, truth, 800, 1000);

  it("turns the photographed page back into the page (true corners)", () => {
    const out = warpPerspective(photo, truth, 700, 990);
    // brightness differs because of the lamp gradient; compare the structure after normalising the mean
    const norm = (r: typeof out) => {
      const mean = r.data.reduce((s, v, i) => (i % 4 === 0 ? s + v : s), 0) / (r.width * r.height);
      const c = { ...r, data: new Uint8ClampedArray(r.data) };
      for (let i = 0; i < r.width * r.height; i++) for (let k = 0; k < 3; k++) c.data[i * 4 + k] = Math.min(255, (r.data[i * 4 + k] / mean) * 200);
      return c;
    };
    expect(meanAbsDiff(norm(out), norm(page.raster))).toBeLessThan(28);
    expect(Math.abs(lineSkewDegrees(out))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(leftMarginSlope(out))).toBeLessThan(0.015);
  });

  it("is the identity for the whole frame", () => {
    const src = makePage(300, 400, 3).raster;
    const out = warpPerspective(src, q(0, 0, 300, 0, 300, 400, 0, 400), 300, 400);
    expect(meanAbsDiff(src, out)).toBeLessThan(0.6);
  });

  it("keeps text dark and turns the paper white in the clean look", () => {
    const out = render(photo, { quad: truth, look: "clean", paper: "auto", turns: 0, format: "png" });
    let paper = 0, ink = 0, np = 0, ni = 0;
    for (let i = 0; i < out.width * out.height; i++) {
      const v = out.data[i * 4];
      if (v > 160) (paper += v), np++;
      else (ink += v), ni++;
    }
    expect(np).toBeGreaterThan(out.width * out.height * 0.5);
    expect(paper / np).toBeGreaterThan(235);
    expect(ni).toBeGreaterThan(out.width * out.height * 0.03);
    expect(ink / ni).toBeLessThan(120);
    expect(cleanPage(blank(50, 60, 180)).data[0]).toBeGreaterThan(240);
  });

  it("turns shaded, tinted paper white and keeps the ink", () => {
    // a page lit from one side with a blue cast: the paper runs from dark blue-grey to light blue-grey
    const page = makePage(500, 700, 5);
    const lit = { ...page.raster, data: new Uint8ClampedArray(page.raster.data) };
    for (let y = 0; y < lit.height; y++) {
      for (let x = 0; x < lit.width; x++) {
        const light = 0.55 + 0.45 * (x / lit.width);
        const o = (y * lit.width + x) * 4;
        lit.data[o] = lit.data[o] * light * 0.8;
        lit.data[o + 1] = lit.data[o + 1] * light * 0.92;
        lit.data[o + 2] = lit.data[o + 2] * light;
      }
    }
    const out = whitenPaper(lit);
    // a patch of bare paper on each side (the page has margins) is white in all three channels
    for (const [x0, y0] of [[8, 300], [470, 300], [250, 8], [250, 685]]) {
      for (let c = 0; c < 3; c++) {
        let mn = 255;
        for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) mn = Math.min(mn, out.data[(y * out.width + x) * 4 + c]);
        expect(mn).toBeGreaterThan(240);
      }
    }
    // the text is still dark
    let ink = 0, n = 0;
    for (let i = 0; i < out.width * out.height; i++) if (out.data[i * 4] < 140) (ink += out.data[i * 4]), n++;
    expect(n).toBeGreaterThan(out.width * out.height * 0.03);
    expect(ink / n).toBeLessThan(110);
  });

  it("keeps the paper white right up to the edge of the photo", () => {
    const page = makePage();
    // the page runs off the left and top of the photo, so the straightened page reaches outside it
    const truth = q(-60, -40, 880, -90, 930, 1080, -110, 1040);
    const photo = photograph(page.raster, truth, 800, 1000);
    const d = detectDocument(photo);
    const out = render(photo, { quad: d.quad, look: "white", paper: "auto", turns: 0, format: "jpeg" });
    const strip = (x0: number, y0: number, w: number, h: number) => {
      let sum = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) sum += out.data[(y * out.width + x) * 4];
      return sum / (w * h);
    };
    expect(strip(2, Math.floor(out.height / 2), 14, 40)).toBeGreaterThan(235); // left edge
    expect(strip(Math.floor(out.width / 2), 2, 40, 14)).toBeGreaterThan(235); // top edge
    expect(strip(out.width - 16, Math.floor(out.height / 2), 14, 40)).toBeGreaterThan(235); // right edge
  });

  it("sharpens soft text without changing flat areas or colours", () => {
    // a soft vertical edge between dark and light (a smooth S-curve), as left by resampling
    const r = blank(20, 8, 0);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 20; x++) {
      const v = Math.round(255 / (1 + Math.exp(-(x - 10) / 1.4)));
      const o = (y * 20 + x) * 4;
      r.data[o] = v;
      r.data[o + 1] = v;
      r.data[o + 2] = Math.round(255 - v / 2); // a tint: every channel is handled on its own
    }
    const s = sharpen(r, 1);
    const at = (img: typeof r, x: number, c = 0) => img.data[(3 * 20 + x) * 4 + c];
    expect(Math.abs(at(s, 1) - at(r, 1))).toBeLessThanOrEqual(1); // far from the edge: unchanged
    expect(Math.abs(at(s, 18) - at(r, 18))).toBeLessThanOrEqual(1);
    expect(at(s, 11) - at(s, 9)).toBeGreaterThan(at(r, 11) - at(r, 9)); // the edge is steeper
    expect(at(s, 11, 2) - at(s, 9, 2)).toBeLessThan(at(r, 11, 2) - at(r, 9, 2)); // the tinted channel falls, now faster
    expect(s.data[3]).toBe(255);
  });

  it("rotates by quarter turns", () => {
    const r = blank(4, 2, 0);
    r.data[0] = 255; // top-left pixel is red
    const once = rotateRaster(r, 1);
    expect([once.width, once.height]).toEqual([2, 4]);
    expect(once.data[(0 * 2 + 1) * 4]).toBe(255); // clockwise: top-left goes to top-right
    const twice = rotateRaster(r, 2);
    expect(twice.data[(1 * 4 + 3) * 4]).toBe(255);
    const full = rotateRaster(rotateRaster(rotateRaster(rotateRaster(r, 1), 1), 1), 1);
    expect(Array.from(full.data)).toEqual(Array.from(r.data));
    expect(rotateRaster(r, 3).width).toBe(2);
  });

  it("refuses an outline that cannot be straightened", () => {
    expect(() => render(photo, { quad: q(0, 0, 10, 10, 20, 20, 30, 30), look: "color", paper: "auto", turns: 0, format: "jpeg" })).toThrow(ScanError);
    try {
      render(photo, { quad: q(0, 0, 10, 10, 20, 20, 30, 30), look: "color", paper: "auto", turns: 0, format: "jpeg" });
    } catch (e) {
      expect((e as ScanError).code).toBe("quad");
    }
  });

  it("caps the size of the result", () => {
    const out = render(photo, { quad: truth, look: "color", paper: "auto", turns: 0, format: "jpeg", maxSide: 300 });
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(300);
    const rotated = render(photo, { quad: truth, look: "color", paper: "auto", turns: 1, format: "jpeg", maxSide: 300 });
    expect(rotated.width).toBe(out.height);
    expect(rotated.height).toBe(out.width);
  });
});

describe("inverse mapping", () => {
  it("applyInverse undoes applyHomography", () => {
    const h = homography(q(120, 90, 700, 60, 730, 900, 90, 940));
    for (const [u, v] of [[0.1, 0.2], [0.5, 0.5], [0.9, 0.95], [-0.1, 1.1]]) {
      const p = applyHomography(h, u, v);
      const back = applyInverse(h, p);
      expect(back.x).toBeCloseTo(u, 6);
      expect(back.y).toBeCloseTo(v, 6);
    }
  });
});

describe("worksheets photographed from below", () => {
  // multiple-choice questions: short ragged lines, indented answers, no justified right margin
  const page = makePage(700, 990, 21, false);
  // taken from below: the bottom of the page is much wider than the top, and the page runs off the frame
  const truth = q(60, -30, 760, -40, 830, 1060, -30, 1040);
  const photo = photograph(page.raster, truth, 800, 1000);

  it("comes out upright (no slant), level and without cutting the ends of the lines", () => {
    const d = detectDocument(photo);
    expect(d.method).toBe("text");
    expect(d.text).toBeDefined();
    const out = render(photo, { quad: d.quad, text: d.text, look: "white", paper: "auto", turns: 0, format: "jpeg" });
    expect(Math.abs(lineSkewDegrees(out))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(leftMarginSlope(out))).toBeLessThan(0.012); // no italic lean
    // the right ends of the lines are inside the page, with some paper after them
    let rightmost = 0;
    for (let y = 0; y < out.height; y++) for (let x = out.width - 1; x > rightmost; x--) if (out.data[(y * out.width + x) * 4] < 120) rightmost = x;
    expect(rightmost).toBeLessThan(out.width * 0.985);
  });
});

describe("clean margins", () => {
  it("removes what touches the edge, keeps the text and a lone page number", () => {
    const r = blank(200, 200, 255);
    const set = (x0: number, y0: number, x1: number, y1: number, v: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) r.data[(y * 200 + x) * 4 + c] = v;
    };
    set(40, 40, 160, 150, 255);
    set(50, 60, 150, 64, 30); // a line of text
    set(50, 90, 150, 94, 30);
    set(190, 0, 200, 60, 200); // a light grey strip at the right edge (another sheet)
    set(0, 170, 30, 172, 40); // a dark line from the left edge (the edge of the paper)
    set(95, 180, 101, 188, 30); // a page number, alone in the bottom margin
    set(150, 40, 160, 50, 210); // light grey inside the text area, touching nothing
    const out = cleanMargins(r, { x0: 50, y0: 60, x1: 150, y1: 94 }, 4);
    const at = (x: number, y: number) => out.data[(y * 200 + x) * 4];
    expect(at(100, 62)).toBe(30); // text stays
    expect(at(195, 30)).toBe(255); // strip gone
    expect(at(10, 171)).toBe(255); // edge line gone
    expect(at(97, 184)).toBe(30); // page number stays
  });
});

describe("pages that bend", () => {
  // a sheet that does not lie flat: every column is moved up or down, by up to 14 px in the middle
  const page = makePage(700, 990, 5);
  const W = page.raster.width, H = page.raster.height;
  const bent = blank(W, H, 255);
  for (let x = 0; x < W; x++) {
    const dy = 14 * Math.sin((Math.PI * x) / W);
    for (let y = 0; y < H; y++) {
      const sy = Math.round(y - dy);
      if (sy < 0 || sy >= H) continue;
      for (let c = 0; c < 4; c++) bent.data[(y * W + x) * 4 + c] = page.raster.data[(sy * W + x) * 4 + c];
    }
  }
  /** How far the lines at the left and at the right of the page sit above or below those in the middle (pixels). */
  const drift = (r: typeof bent) => {
    const rows = (x0: number, x1: number) => {
      const p = new Float32Array(r.height);
      for (let y = 0; y < r.height; y++) for (let x = x0; x < x1; x++) if (r.data[(y * r.width + x) * 4] < 120) p[y]++;
      return p;
    };
    const mid = rows(Math.round(r.width * 0.45), Math.round(r.width * 0.55));
    const shift = (p: Float32Array) => {
      let best = 0, bestV = -Infinity;
      for (let d = -25; d <= 25; d++) {
        let v = 0;
        for (let y = 30; y < r.height - 30; y++) v += p[y] * mid[y + d];
        if (v > bestV) (bestV = v), (best = d);
      }
      return Math.abs(best);
    };
    return Math.max(shift(rows(Math.round(r.width * 0.12), Math.round(r.width * 0.2))), shift(rows(Math.round(r.width * 0.8), Math.round(r.width * 0.88))));
  };

  it("makes the lines straight again", () => {
    const quad = q(0, 0, W, 0, W, H, 0, H);
    expect(drift(render(bent, { quad, look: "color", paper: "photo", turns: 0, format: "jpeg" }))).toBeLessThanOrEqual(2);
    expect(drift(bent)).toBeGreaterThanOrEqual(8);
  });
});
