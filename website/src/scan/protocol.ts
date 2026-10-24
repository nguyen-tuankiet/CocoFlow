import type { RenderOptions, ScanErrorCode } from "./engine/types";

/** Messages from the page to the worker. `id` pairs a request with its reply; `key` names the photo. */
export type Request =
  | { id: number; type: "load"; key: string; file: Blob }
  | { id: number; type: "analyze"; key: string; method: "auto" | "edges" | "text" }
  | { id: number; type: "preview"; key: string; options: RenderOptions }
  | { id: number; type: "render"; key: string; options: RenderOptions }
  | { id: number; type: "release"; key: string };

export type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; code: ScanErrorCode; message: string };
