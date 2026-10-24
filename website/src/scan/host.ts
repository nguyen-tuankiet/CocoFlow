// The engine as seen by the page: decode a photo, find the page, render a preview or the final image. It uses
// only canvas APIs that exist both in a Web Worker (OffscreenCanvas) and on the main thread, so the same code
// runs in either place (see worker.ts and client.ts).

import { MAX_OUTPUT_SIDE, MAX_PIXELS, MAX_WORK_PIXELS, PREVIEW_SIDE } from "./engine/limits";
import { analyze, analyzeWith, render } from "./engine/pipeline";
import { scaleQuad, scaleText } from "./engine/geometry";
import { ScanError } from "./engine/types";
import type { Detection, Quad, Raster, RenderOptions, Rendered } from "./engine/types";

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): Canvas2D {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const context = (c: Canvas2D): Ctx2D => {
  const ctx = c.getContext("2d", { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) throw new ScanError("internal", "no 2d canvas");
  return ctx;
};

function bitmapRaster(bmp: ImageBitmap, scale: number): Raster {
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = makeCanvas(w, h);
  const ctx = context(c);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h };
}

async function encode(r: Raster, format: "jpeg" | "png"): Promise<Blob> {
  const c = makeCanvas(r.width, r.height);
  const ctx = context(c);
  ctx.putImageData(new ImageData(r.data as unknown as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), 0, 0);
  const type = format === "png" ? "image/png" : "image/jpeg";
  const blob: Blob | null =
    "convertToBlob" in c ? await c.convertToBlob({ type, quality: 0.95 }) : await new Promise<Blob | null>((res) => (c as HTMLCanvasElement).toBlob(res, type, 0.95));
  if (!blob) throw new ScanError("internal", "could not encode the image");
  return blob;
}

interface Entry {
  bmp: ImageBitmap;
  width: number;
  height: number;
  proxy?: Raster;
}

export class ScanHost {
  private items = new Map<string, Entry>();

  async load(id: string, file: Blob): Promise<{ width: number; height: number }> {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      throw new ScanError("decode");
    }
    if (bmp.width < 16 || bmp.height < 16) {
      bmp.close();
      throw new ScanError("decode");
    }
    if (bmp.width * bmp.height > MAX_PIXELS) {
      bmp.close();
      throw new ScanError("pixels");
    }
    this.release(id);
    this.items.set(id, { bmp, width: bmp.width, height: bmp.height });
    return { width: bmp.width, height: bmp.height };
  }

  private entry(id: string): Entry {
    const e = this.items.get(id);
    if (!e) throw new ScanError("internal", "unknown image");
    return e;
  }

  /** A copy with the longest side at most PREVIEW_SIDE pixels, kept for analysis and live previews. */
  private proxy(e: Entry): { raster: Raster; k: number } {
    if (!e.proxy) e.proxy = bitmapRaster(e.bmp, Math.min(1, PREVIEW_SIDE / Math.max(e.width, e.height)));
    return { raster: e.proxy, k: e.proxy.width / e.width };
  }

  /** Finds the page. `method` forces one of the two finders; null when that finder finds nothing. */
  async analyze(id: string, method: "auto" | "edges" | "text" = "auto"): Promise<Detection | null> {
    const e = this.entry(id);
    const { raster, k } = this.proxy(e);
    if (method === "auto") {
      const d = analyze(raster);
      return { ...d, quad: scaleQuad(d.quad, 1 / k), text: scaleText(d.text, 1 / k) };
    }
    const q = analyzeWith(raster, method);
    return q ? { quad: scaleQuad(q, 1 / k), method } : null;
  }

  /** A small straightened copy for live feedback while the corners move. */
  async preview(id: string, o: RenderOptions): Promise<Raster> {
    const e = this.entry(id);
    const { raster, k } = this.proxy(e);
    return render(raster, { ...o, quad: scaleQuad(o.quad, k), text: scaleText(o.text, k), maxSide: 480 });
  }

  /** The final image, encoded as JPEG or PNG. */
  async render(id: string, o: RenderOptions): Promise<Rendered> {
    const e = this.entry(id);
    const k = Math.min(1, Math.sqrt(MAX_WORK_PIXELS / (e.width * e.height)));
    const raster = k < 1 ? bitmapRaster(e.bmp, k) : bitmapRaster(e.bmp, 1);
    const out = render(raster, { ...o, quad: scaleQuad(o.quad, k), text: scaleText(o.text, k), maxSide: Math.min(o.maxSide ?? MAX_OUTPUT_SIDE, MAX_OUTPUT_SIDE) });
    const blob = await encode(out, o.format);
    return { blob, width: out.width, height: out.height };
  }

  release(id: string): void {
    const e = this.items.get(id);
    if (e) {
      e.bmp.close();
      this.items.delete(id);
    }
  }

  dispose(): void {
    for (const id of [...this.items.keys()]) this.release(id);
  }
}

export type { Quad };
