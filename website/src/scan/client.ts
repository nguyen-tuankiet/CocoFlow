// What the page talks to: a Web Worker when the browser can run one with OffscreenCanvas, otherwise the same engine
// on the main thread (slower on big photos, but it works everywhere).

import { ScanHost } from "./host";
import { ScanError } from "./engine/types";
import type { Detection, Raster, RenderOptions, Rendered } from "./engine/types";
import type { Reply, Request } from "./protocol";

export interface Engine {
  readonly kind: "worker" | "main";
  load(key: string, file: Blob): Promise<{ width: number; height: number }>;
  analyze(key: string, method?: "auto" | "edges" | "text"): Promise<Detection | null>;
  preview(key: string, options: RenderOptions): Promise<Raster>;
  render(key: string, options: RenderOptions): Promise<Rendered>;
  release(key: string): void;
  dispose(): void;
}

/** Lets the browser paint between heavy steps when everything runs on the main thread. */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export function mainThreadEngine(): Engine {
  const host = new ScanHost();
  const run = async <T>(f: () => Promise<T>): Promise<T> => {
    await yieldToUi();
    return f();
  };
  return {
    kind: "main",
    load: (k, f) => run(() => host.load(k, f)),
    analyze: (k, m = "auto") => run(() => host.analyze(k, m)),
    preview: (k, o) => run(() => host.preview(k, o)),
    render: (k, o) => run(() => host.render(k, o)),
    release: (k) => host.release(k),
    dispose: () => host.dispose(),
  };
}

type Distribute<T> = T extends unknown ? Omit<T, "id"> : never;

function workerEngine(worker: Worker): Engine {
  let next = 1;
  const waiting = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
  worker.onmessage = (ev: MessageEvent<Reply>) => {
    const r = ev.data;
    const w = waiting.get(r.id);
    if (!w) return;
    waiting.delete(r.id);
    if (r.ok) w.ok(r.value);
    else w.fail(new ScanError(r.code, r.message));
  };
  worker.onerror = (ev) => {
    // the worker died: fail everything that is waiting
    const err = new ScanError("internal", ev.message || "worker error");
    for (const w of waiting.values()) w.fail(err);
    waiting.clear();
  };
  const call = <T>(req: Distribute<Request>, transfer: Transferable[] = []) =>
    new Promise<T>((ok, fail) => {
      const id = next++;
      waiting.set(id, { ok: ok as (v: unknown) => void, fail });
      worker.postMessage({ ...req, id }, transfer);
    });
  return {
    kind: "worker",
    load: (key, file) => call({ type: "load", key, file }),
    analyze: (key, method = "auto") => call({ type: "analyze", key, method }),
    preview: (key, options) => call({ type: "preview", key, options }),
    render: (key, options) => call({ type: "render", key, options }),
    release: (key) => void call({ type: "release", key }).catch(() => {}),
    dispose: () => worker.terminate(),
  };
}

export function createEngine(): Engine {
  const canWorker = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined";
  if (canWorker) {
    try {
      return workerEngine(new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
    } catch {
      /* fall through to the main thread */
    }
  }
  return mainThreadEngine();
}
