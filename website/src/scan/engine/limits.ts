/** Largest file accepted (bytes). */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
/** Most files added in one go. */
export const MAX_FILES = 40;
/** Photos with more pixels than this are refused (a 60 megapixel photo already needs about 240 MB as RGBA). */
export const MAX_PIXELS = 60_000_000;
/** Photos above this are shrunk before straightening, to keep the memory of the worker reasonable. */
export const MAX_WORK_PIXELS = 24_000_000;
/** Pages smaller than this (longest side, in pixels) are enlarged a little, at most 2x, so that the text reads well. */
export const READABLE_SIDE = 1700;
/** Longest side of the finished page. */
export const MAX_OUTPUT_SIDE = 5000;
/** Longest side of the small copy used for live previews while the corners are dragged. */
export const PREVIEW_SIDE = 1200;
