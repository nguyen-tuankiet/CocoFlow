// Web Worker: runs ScanHost off the main thread so the page stays responsive on large photos.
import { ScanHost } from "./host";
import { ScanError } from "./engine/types";
import type { Reply, Request } from "./protocol";

const host = new ScanHost();

self.onmessage = async (ev: MessageEvent<Request>) => {
  const m = ev.data;
  const reply = (r: Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transfer);
  try {
    switch (m.type) {
      case "load":
        reply({ id: m.id, ok: true, value: await host.load(m.key, m.file) });
        break;
      case "analyze":
        reply({ id: m.id, ok: true, value: await host.analyze(m.key, m.method) });
        break;
      case "preview": {
        const r = await host.preview(m.key, m.options);
        reply({ id: m.id, ok: true, value: r }, [r.data.buffer]);
        break;
      }
      case "render":
        reply({ id: m.id, ok: true, value: await host.render(m.key, m.options) });
        break;
      case "release":
        host.release(m.key);
        reply({ id: m.id, ok: true, value: null });
        break;
    }
  } catch (e) {
    const code = e instanceof ScanError ? e.code : "internal";
    reply({ id: m.id, ok: false, code, message: e instanceof Error ? e.message : String(e) });
  }
};
