# Straighten document photos (`/scan`)

A tool on the website (`website/scan.html`, served as `/scan`) that turns photos of tilted or skewed paper into square
pages. Everything runs in the browser, in a Web Worker; no photo leaves the visitor's computer.

## What it does

- Accepts several JPG, JPEG or PNG photos (drag and drop, file picker, or paste). Limits are in `src/scan/engine/limits.ts`
  (40 photos per batch, 30 MB and 60 megapixels each).
- Finds the page by itself. The lines of printed text decide the direction (level lines, upright margins), the edges of
  the paper decide where to cut when all four are in the photo. If there is no readable text the paper edges are used on
  their own; for a photo with neither, a default frame is shown for the user to move. Hand-placed corners are never
  overwritten by an automatic run.
- Straightens it with a perspective transform and bicubic resampling. Text and colours are kept as photographed;
  "Clean page (grey)" is an optional look that evens out the light. No generative AI is involved.
- Per photo: compare with the original, drag the four corners (mouse, touch or arrow keys) with a live preview, rotate,
  process again, retry after an error, download. All results can be downloaded as one ZIP.

## Code map (`website/src/scan/`)

| File | Role |
|---|---|
| `engine/geometry.ts` | homography, quad validation, output size |
| `engine/detect.ts`, `engine/textblock.ts` | page finders (paper edges, text lines) |
| `engine/warp.ts` | perspective warp, clean look, rotation |
| `engine/pipeline.ts` | `analyze` / `render` with validation |
| `host.ts` | decode, preview and encode on top of canvas APIs (worker or main thread) |
| `worker.ts`, `client.ts`, `protocol.ts` | Web Worker and its fallback on the main thread |
| `validate.ts`, `zip.ts` | file checks, result names, ZIP |
| `useScanner.ts`, `ScanApp.tsx`, `CornerEditor.tsx` | queue, page and corner editor |

The engine is plain TypeScript on pixel arrays, so it is tested without a browser. The Windows app imports the same
engine (`src/autoscan.ts`, `src/scan.ts`): "Straighten document" ("Làm thẳng tài liệu") in its Tools list finds the page without any window,
straightens it at full size in the web view (`src/scanrender.ts`) and hands the encoded page to the backend
(`save_scan` in `main.rs`), which saves it as `<name>_scan.jpg` next to the photo as a job in Activity. "Straighten (adjust
corners)…" opens the corner editor instead and saves the same way. The older ImageMagick recipe in `plan.rs` (tool `scan`)
is no longer used by either.

## Tests

```
npm --prefix website test
```

Vitest tests in `src/scan/__tests__/` build a synthetic printed page, "photograph" it from an angle with known corners and
check corner detection, the perspective transform, rotation, the clean look, file validation, result names, the ZIP and the
error cases. The worker, the batch flow, the corner editor, downloads and the mobile layout were checked in a headless
browser against the production build.
