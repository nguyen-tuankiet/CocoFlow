// Shared types of the document-straightening engine. Everything in engine/ is plain TypeScript on pixel arrays (no DOM),
// so it runs in a Web Worker, on the main thread and in the tests alike.

export type Pt = { x: number; y: number };
/** Corners of a page in this order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

/** RGBA pixels, row by row (the layout of ImageData). */
export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** "both": aligned to the lines of text and cropped at the edges of the paper. */
export type Method = "edges" | "text" | "both" | "none";
/** Where the printed text is (photo pixels), when the page was found from the text. */
export interface TextArea {
  /** All the text of the page. */
  block: Quad;
  /** Patches of text of other sheets that show in the photo (outlines). */
  others: Pt[][];
}

export interface Detection {
  quad: Quad;
  text?: TextArea;
  /** How the corners were found; "none" means nothing was recognised and a default frame was used. */
  method: Method;
}

/**
 * "color": as photographed; "white": white paper, ink keeps its colour; "clean": grey page with the light evened out;
 * "bw": black and white.
 */
export type Look = "color" | "white" | "clean" | "bw";
/** "auto": A4 when the page is close to it, otherwise as measured; "photo": always as measured. */
export type Paper = "auto" | "photo" | "a4p" | "a4l";
export type Turns = 0 | 1 | 2 | 3;
export type Format = "jpeg" | "png";

export interface RenderOptions {
  quad: Quad;
  look: Look;
  paper: Paper;
  /** Quarter turns clockwise applied to the straightened page. */
  turns: Turns;
  format: Format;
  /** Longest side of the result in pixels; larger pages are scaled down. */
  maxSide?: number;
  /** Where the text is: outside it the margins are cleaned, and other sheets' text removed (not in the color look). */
  text?: TextArea;
}

export interface Rendered {
  blob: Blob;
  width: number;
  height: number;
}

/** Reasons a file or photo is rejected; the UI turns them into messages. */
export type ScanErrorCode = "type" | "empty" | "size" | "pixels" | "decode" | "quad" | "internal";

export class ScanError extends Error {
  constructor(
    public code: ScanErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ScanError";
  }
}
