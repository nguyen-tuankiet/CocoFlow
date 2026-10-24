import { detectByEdges, detectByText, detectDocument } from "./detect";
import { isValidQuad } from "./geometry";
import { renderRaster } from "./warp";
import { MAX_OUTPUT_SIDE, READABLE_SIDE } from "./limits";
import { ScanError } from "./types";
import type { Detection, Quad, Raster, RenderOptions } from "./types";

/** Finds the page in a photo (see detectDocument). */
export function analyze(src: Raster): Detection {
  return detectDocument(src);
}

/** Re-runs one of the two finders on its own; null when it finds nothing. */
export function analyzeWith(src: Raster, method: "edges" | "text"): Quad | null {
  return method === "edges" ? detectByEdges(src) : detectByText(src);
}

/** Straightens `src` according to `o`. Throws ScanError("quad") for an outline that cannot be straightened. */
export function render(src: Raster, o: RenderOptions): Raster {
  if (!isValidQuad(o.quad, src.width, src.height)) throw new ScanError("quad");
  try {
    return renderRaster(src, { ...o, maxSide: Math.min(o.maxSide ?? MAX_OUTPUT_SIDE, MAX_OUTPUT_SIDE), minLong: READABLE_SIDE });
  } catch (e) {
    if (e instanceof ScanError) throw e;
    throw new ScanError("quad", e instanceof Error ? e.message : String(e));
  }
}
