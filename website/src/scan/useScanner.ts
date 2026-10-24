import { useCallback, useEffect, useRef, useState } from "react";
import { createEngine } from "./client";
import { MAX_FILES } from "./engine/limits";
import type { Engine } from "./client";
import type { Look, Method, Paper, Quad, ScanErrorCode, TextArea, Turns } from "./engine/types";
import { errorCode, intake } from "./validate";
import { buildZip, resultName } from "./zip";

export type Status = "queued" | "working" | "done" | "error";
export type Step = "load" | "analyze" | "render";

export interface Item {
  id: string;
  file: File;
  name: string;
  size: number;
  /** Object URL of the original (revoked when the item goes away). */
  srcUrl: string;
  width: number;
  height: number;
  status: Status;
  step: Step | null;
  progress: number;
  error?: ScanErrorCode;
  errorText?: string;
  quad?: Quad;
  /** Where the text is (photo pixels), when the page was found from the text: its margins are cleaned. */
  text?: TextArea;
  method?: Method;
  /** True once the corners were set by hand: automatic re-runs then leave them alone. */
  manual: boolean;
  turns: Turns;
  result?: { url: string; blob: Blob; width: number; height: number; ext: "jpg" | "png" };
}

export interface Settings {
  look: Look;
  paper: Paper;
}

export interface Notice {
  kind: "error" | "warning" | "info";
  /** Files refused or dropped, by reason. */
  rejected: { name: string; code: ScanErrorCode }[];
  overflow: number;
}

let counter = 0;
const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

export function useScanner(onNotice: (n: Notice) => void) {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettingsState] = useState<Settings>({ look: "white", paper: "auto" });
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const engineRef = useRef<Engine | null>(null);
  const loaded = useRef(new Set<string>());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  const engine = useCallback(() => (engineRef.current ??= createEngine()), []);
  const get = (id: string) => itemsRef.current.find((i) => i.id === id);
  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
    itemsRef.current = itemsRef.current.map((i) => (i.id === id ? { ...i, ...p } : i));
  }, []);
  const enqueue = (task: () => Promise<void>) => {
    chain.current = chain.current.then(task).catch(() => {});
  };

  const fail = (id: string, e: unknown) =>
    patch(id, { status: "error", step: null, error: errorCode(e), errorText: e instanceof Error ? e.message : String(e) });

  /** Draws the final image from the item's current corners, rotation and the global look. */
  const renderItem = async (id: string) => {
    const it = get(id);
    if (!it || !it.quad) return;
    const png = it.file.type === "image/png";
    const r = await engine().render(id, {
      quad: it.quad,
      text: it.text,
      look: settingsRef.current.look,
      paper: settingsRef.current.paper,
      turns: it.turns,
      format: png ? "png" : "jpeg",
    });
    const now = get(id);
    if (!now) return; // removed while rendering
    if (now.result) URL.revokeObjectURL(now.result.url);
    patch(id, { status: "done", step: null, progress: 1, error: undefined, result: { url: URL.createObjectURL(r.blob), blob: r.blob, width: r.width, height: r.height, ext: png ? "png" : "jpg" } });
  };

  const runFull = async (id: string) => {
    const it = get(id);
    if (!it) return;
    try {
      patch(id, { status: "working", step: "load", progress: 0.1, error: undefined, errorText: undefined });
      if (!loaded.current.has(id)) {
        const dim = await engine().load(id, it.file);
        if (!get(id)) return engine().release(id);
        loaded.current.add(id);
        patch(id, { width: dim.width, height: dim.height });
      }
      if (!get(id)?.manual || !get(id)?.quad) {
        patch(id, { step: "analyze", progress: 0.35 });
        const d = await engine().analyze(id, "auto");
        if (!get(id) || !d) return;
        patch(id, { quad: d.quad, text: d.text, method: d.method });
      }
      patch(id, { step: "render", progress: 0.7 });
      await renderItem(id);
    } catch (e) {
      if (get(id)) fail(id, e);
    }
  };

  const runRender = async (id: string) => {
    if (!get(id)?.quad) return runFull(id);
    try {
      patch(id, { status: "working", step: "render", progress: 0.7, error: undefined, errorText: undefined });
      await renderItem(id);
    } catch (e) {
      if (get(id)) fail(id, e);
    }
  };

  const add = useCallback((files: File[]) => {
    const { accepted, rejected, overflow } = intake(files, Math.max(0, MAX_FILES - itemsRef.current.length));
    if (rejected.length || overflow.length) {
      noticeRef.current({ kind: "warning", rejected: rejected.map((r) => ({ name: r.file.name, code: r.code })), overflow: overflow.length });
    }
    const fresh: Item[] = accepted.map((file) => ({
      id: newId(),
      file,
      name: file.name,
      size: file.size,
      srcUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
      status: "queued",
      step: null,
      progress: 0,
      manual: false,
      turns: 0,
    }));
    if (!fresh.length) return;
    itemsRef.current = [...itemsRef.current, ...fresh];
    setItems(itemsRef.current);
    for (const it of fresh) enqueue(() => runFull(it.id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sets the corners (and rotation) by hand and draws the page again. */
  const adjust = useCallback((id: string, quad: Quad, turns: Turns) => {
    patch(id, { quad, turns, manual: true, status: "queued" });
    enqueue(() => runRender(id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rotate = useCallback((id: string, dir: 1 | -1) => {
    const it = get(id);
    if (!it) return;
    patch(id, { turns: ((it.turns + dir + 4) % 4) as Turns, status: "queued" });
    enqueue(() => runRender(id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Finds the page again from scratch (forgetting hand-placed corners); `method` limits it to one finder. */
  const redetect = useCallback((id: string, method: "auto" | "edges" | "text" = "auto") => {
    patch(id, { status: "queued", manual: false });
    enqueue(async () => {
      try {
        patch(id, { status: "working", step: "analyze", progress: 0.35, error: undefined });
        if (!loaded.current.has(id)) {
          const it = get(id);
          if (!it) return;
          const dim = await engine().load(id, it.file);
          loaded.current.add(id);
          patch(id, { width: dim.width, height: dim.height });
        }
        const d = await engine().analyze(id, method);
        if (!get(id)) return;
        if (d) patch(id, { quad: d.quad, text: d.text, method: d.method });
        patch(id, { step: "render", progress: 0.7 });
        await renderItem(id);
      } catch (e) {
        if (get(id)) fail(id, e);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Starts a failed photo over (decoding included). */
  const retry = useCallback((id: string) => {
    engine().release(id);
    loaded.current.delete(id);
    patch(id, { status: "queued", manual: false, quad: undefined, text: undefined, error: undefined, errorText: undefined });
    enqueue(() => runFull(id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const retryFailed = useCallback(() => {
    for (const it of itemsRef.current) if (it.status === "error") retry(it.id);
  }, [retry]);

  const dropItem = (it: Item) => {
    URL.revokeObjectURL(it.srcUrl);
    if (it.result) URL.revokeObjectURL(it.result.url);
    loaded.current.delete(it.id);
    engineRef.current?.release(it.id);
  };

  const remove = useCallback((id: string) => {
    const it = get(id);
    if (!it) return;
    dropItem(it);
    itemsRef.current = itemsRef.current.filter((i) => i.id !== id);
    setItems(itemsRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    itemsRef.current.forEach(dropItem);
    itemsRef.current = [];
    setItems([]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Changing the look or the paper draws every finished page again. */
  const setSettings = useCallback((s: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...s };
    settingsRef.current = next;
    setSettingsState(next);
    for (const it of itemsRef.current) if (it.status === "done") enqueue(() => runRender(it.id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadZip = useCallback(async (): Promise<Blob> => {
    const taken = new Set<string>();
    const entries = itemsRef.current.filter((i) => i.result).map((i) => ({ name: resultName(i.name, i.result!.ext, taken), blob: i.result!.blob }));
    return buildZip(entries);
  }, []);

  useEffect(
    () => () => {
      itemsRef.current.forEach(dropItem);
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { items, settings, setSettings, add, adjust, rotate, redetect, retry, retryFailed, remove, clear, downloadZip, engine };
}
