// Straightens a photo at full resolution with the shared engine (the same one as the website) and saves the result
// next to it through the backend's job queue. Used by "Scan document" and by the corner editor.

import { convertFileSrc } from "@tauri-apps/api/core";
import { mediaInfo, previewFile, saveScan } from "./api";
import { scaleQuad, scaleText } from "../website/src/scan/engine/geometry";
import { MAX_WORK_PIXELS } from "../website/src/scan/engine/limits";
import { render } from "../website/src/scan/engine/pipeline";
import type { Look, Paper, Quad, Raster, TextArea } from "../website/src/scan/engine/types";

/** Longest side of the copy used to look for the page and for previews. */
export const SEARCH_SIDE = 1400;

export interface Photo {
  img: HTMLImageElement;
  /** Size of the photo in the coordinates the corners use (after the camera's rotation). */
  width: number;
  height: number;
  /** A copy of at most SEARCH_SIDE pixels, for finding the page and for previews. */
  small: Raster;
}

/** Draws `img` into pixels with the longest side at most `side` and at most `pixels` pixels. */
function pixelsOf(img: HTMLImageElement, side: number, pixels = Infinity): Raster {
  const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight), Math.sqrt(pixels / (img.naturalWidth * img.naturalHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: d.data, width: d.width, height: d.height };
}

/** Opens a photo (the browser applies the camera's rotation, like ImageMagick's -auto-orient). */
export async function loadPhoto(path: string): Promise<Photo> {
  const [preview, info] = await Promise.all([previewFile(path), mediaInfo(path)]);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = convertFileSrc(preview);
  await img.decode();
  const direct = preview === path;
  const width = direct || !info.width ? img.naturalWidth : info.width;
  const height = direct || !info.height ? img.naturalHeight : info.height;
  return { img, width, height, small: pixelsOf(img, SEARCH_SIDE) };
}

/** Converts what was found on `photo.small` to photo coordinates. */
export const fromSmall = (photo: Photo, q: Quad): Quad => scaleQuad(q, photo.width / photo.small.width);
export const textFromSmall = (photo: Photo, t: TextArea | undefined) => scaleText(t, photo.width / photo.small.width);

/** Straightens `photo` (corners and text area in photo coordinates) and saves it as `<name>_scan` next to `path`. */
export async function renderAndSave(path: string, photo: Photo, o: { quad: Quad; text?: TextArea; look: Look; paper: Paper }): Promise<void> {
  const raster = pixelsOf(photo.img, Infinity, MAX_WORK_PIXELS);
  const k = raster.width / photo.width;
  const png = /\.png$/i.test(path);
  const page = render(raster, {
    quad: scaleQuad(o.quad, k),
    text: scaleText(o.text, k),
    look: o.look,
    paper: o.paper,
    turns: 0,
    format: png ? "png" : "jpeg",
  });
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  canvas.getContext("2d")!.putImageData(new ImageData(page.data as unknown as Uint8ClampedArray<ArrayBuffer>, page.width, page.height), 0, 0);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, png ? "image/png" : "image/jpeg", 0.95));
  if (!blob) throw new Error("Could not encode the page");
  await saveScan(path, new Uint8Array(await blob.arrayBuffer()), png ? "png" : "jpg");
}
