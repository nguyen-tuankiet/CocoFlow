import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { FileBadge, Icon } from "./appicons";
import {
  ACTIONS, ACTION_KEYS, AI, FORMAT, MODE_INFO, MODE_KEYS, TOOLS, TYPES, targetsFor,
} from "./data";
import type { FType, L, ModeKey } from "./data";
import { useT } from "./lang";

// ---- geometry of the real wheel (src/wheel.ts of the app)
const SIZE = 480;
const C = SIZE / 2;
const R_IN = 72;
const R_OUT = 184;
const GAP = 7;
const STROKE = 8;
const TASKBAR = 34;

type Opt = { key: string; label: L; icon: ReactNode; sub?: string; out?: { ext: string; suffix: string }; toast?: L };
type Item = { id: string; typeId: string; name: string; ext: string; fresh?: boolean };
type Drag = { item: Item; x: number; y: number; sx: number; sy: number; cx: number | null; cy: number; auto: boolean };
type Job = { id: number; from: string; to: string; running: boolean; toast?: L };

const typeOf = (typeId: string): FType => TYPES.find((t) => t.id === typeId)!;
const L2 = (vi: string, en: string): L => ({ vi, en });

/** The slices the real wheel shows for a kind of file in a mode. */
function optionsFor(type: FType, mode: ModeKey): Opt[] {
  const ex = type.example.ext;
  switch (mode) {
    case "convert":
      return targetsFor(type).map((e) => ({ key: e, label: FORMAT[e], icon: <FileBadge ext={e} size={30} />, out: { ext: e, suffix: "" } }));
    case "tools":
      return type.tools.map((k) => {
        const d = TOOLS[k];
        return { key: k, label: d.label, icon: <Icon name={d.icon} size={30} />, out: d.toast ? undefined : { ext: d.ext ?? ex, suffix: d.suffix }, toast: d.toast };
      });
    case "actions":
      return ACTION_KEYS.map((k) => ({ key: k, label: ACTIONS[k].label, icon: <Icon name={ACTIONS[k].icon} size={30} />, toast: ACTIONS[k].toast }));
    case "share":
      return type.share.map((g, i) => ({ key: `g${i}`, label: g.label, icon: <Icon name={g.icon} size={30} />, sub: g.sub, out: { ext: g.ext, suffix: g.suffix } }));
    case "ai":
      return type.ai.map((k) => {
        const d = AI[k];
        return { key: k, label: d.label, icon: <Icon name={d.icon} size={30} />, out: { ext: d.ext ?? "txt", suffix: d.suffix } };
      });
  }
}

/** Point at radius r and angle a (radians, 0 = top, clockwise), in wheel units. */
const pt = (r: number, a: number): [number, number] => [C + r * Math.sin(a), C - r * Math.cos(a)];

/** Ring slice whose edges stay GAP px away from the neighbours. */
function slicePath(a0: number, a1: number): string {
  const ro = R_OUT - GAP, ri = R_IN + GAP;
  if (a1 - a0 >= Math.PI * 2 - 0.01) {
    const [ox, oy] = pt(ro, 0), [oxb, oyb] = pt(ro, Math.PI), [ix, iy] = pt(ri, 0), [ixb, iyb] = pt(ri, Math.PI);
    return `M${ox} ${oy}A${ro} ${ro} 0 1 1 ${oxb} ${oyb}A${ro} ${ro} 0 1 1 ${ox} ${oy}ZM${ix} ${iy}A${ri} ${ri} 0 1 0 ${ixb} ${iyb}A${ri} ${ri} 0 1 0 ${ix} ${iy}Z`;
  }
  const oA0 = a0 + Math.asin(GAP / ro), oA1 = a1 - Math.asin(GAP / ro);
  const iA0 = a0 + Math.asin(GAP / ri), iA1 = a1 - Math.asin(GAP / ri);
  const large = oA1 - oA0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(ro, oA0), [x1, y1] = pt(ro, oA1), [x2, y2] = pt(ri, iA1), [x3, y3] = pt(ri, iA0);
  return `M${x0} ${y0}A${ro} ${ro} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${large} 0 ${x3} ${y3}Z`;
}

/** Slice under (x,y) for a wheel centred at (cx,cy) drawn at `scale`; -1 outside the ring. */
function hoverIndex(d: Drag, n: number, scale: number): number {
  if (d.cx === null || n === 0) return -1;
  const dx = (d.x - d.cx) / scale, dy = (d.y - d.cy) / scale;
  const r = Math.hypot(dx, dy);
  if (r < R_IN || r > R_OUT + 40) return -1;
  let a = Math.atan2(dx, -dy);
  if (a < 0) a += Math.PI * 2;
  return Math.min(n - 1, Math.floor(a / ((Math.PI * 2) / n)));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function tween(ms: number, token: { stop: boolean }, cb: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      if (token.stop) return resolve();
      const t = Math.min(1, (now - start) / ms);
      cb(easeInOut(t));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

const START: Item[] = ["image", "video", "audio", "pdf", "document", "sheet"].map((id) => {
  const t = typeOf(id);
  return { id: `f-${id}`, typeId: id, name: t.example.name, ext: t.example.ext };
});

// what the self-playing demo shows, in order
const SCRIPT: { type: string; mode: ModeKey; pick: string }[] = [
  { type: "image", mode: "convert", pick: "jpg" },
  { type: "video", mode: "share", pick: "g0" },
  { type: "pdf", mode: "ai", pick: "ocr" },
  { type: "audio", mode: "tools", pick: "normalize" },
];

// ---------------------------------------------------------------- the wheel, drawn like the app draws it
function WheelView({ opts, hover, mode, item, lang, enter, out }: { opts: Opt[]; hover: number; mode: ModeKey; item: Item; lang: "vi" | "en"; enter: boolean; out: boolean }) {
  const { t } = useT();
  const type = typeOf(item.typeId);
  const n = opts.length;
  const step = (Math.PI * 2) / Math.max(n, 1);
  const mid = (R_IN + R_OUT) / 2 + 2;
  const hovered = hover >= 0 ? opts[hover] : undefined;
  const sub = hovered?.sub ? `${type.example.size} → ${hovered.sub}` : type.example.size;

  let pointer = "";
  if (hover >= 0 && n > 0) {
    const a = (hover + 0.5) * step;
    const [tx, ty] = pt(R_IN + 14, a), [bx1, by1] = pt(R_IN + 1, a - 0.085), [bx2, by2] = pt(R_IN + 1, a + 0.085);
    pointer = `M${tx} ${ty}L${bx1} ${by1}L${bx2} ${by2}Z`;
  }

  const hub = (
    <div className="w-hub-content">
      <div className="w-hub-badge"><FileBadge ext={item.ext} size={34} /></div>
      <div className="w-fname">{item.name}.{item.ext}</div>
      <div className={`w-fcount${hovered?.sub ? " goal" : ""}`}>{sub}</div>
    </div>
  );

  const pills = (
    <div className="w-modes">
      {MODE_KEYS.map((m) => (
        <span key={m} data-wmode={m} className={`w-pill${m === mode ? " on" : ""}`}>
          {m === mode && <b>{MODE_INFO[m].keys}</b>}
          {MODE_INFO[m].label[lang]}
        </span>
      ))}
    </div>
  );

  const cls = `w-stage${enter ? " enter" : ""}${out ? " out" : ""}`;
  if (n === 0) {
    const others = MODE_KEYS.filter((m) => m !== mode && optionsFor(type, m).length > 0).map((m) => `${MODE_INFO[m].keys} → ${MODE_INFO[m].label[lang]}`).join("  ·  ");
    return (
      <div className={cls}>
        <div className="w-card">
          {hub}
          <div className="w-reason">{t("Không có mục nào cho loại file này", "Nothing here for this kind of file")}</div>
          {others && <div className="w-hint">{t("Thử: ", "Try: ")}{others}</div>}
        </div>
        {pills}
      </div>
    );
  }

  return (
    <div className={cls}>
      <svg className="w-ring" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="w-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".97" /><stop offset="1" stopColor="#e9effb" stopOpacity=".97" /></linearGradient>
          <linearGradient id="w-hotg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e4edff" /><stop offset="1" stopColor="#bcd0ff" /></linearGradient>
          <radialGradient id="w-hubg" cx="50%" cy="38%" r="75%"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#eef2fb" /></radialGradient>
          <filter id="w-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g>
          {opts.map((o, i) => {
            const d = slicePath(i * step, (i + 1) * step);
            return (
              <g key={o.key}>
                <path className="w-edge" d={d} strokeWidth={STROKE + 2} />
                <path className={`w-slice${hover === i ? " hot" : ""}`} d={d} strokeWidth={STROKE} />
              </g>
            );
          })}
        </g>
        <circle className="w-hub-ring" cx={C} cy={C} r={R_IN - 6} filter="url(#w-glow)" />
        <circle className="w-hub" cx={C} cy={C} r={R_IN - 6} />
        <path className="w-pointer" d={pointer} />
      </svg>
      {opts.map((o, i) => {
        const [lx, ly] = pt(mid, n === 1 ? 0 : (i + 0.5) * step);
        return (
          <div key={o.key} className={`w-label${hover === i ? " hot" : ""}`} style={{ left: lx, top: ly }}>
            <div className="w-icon">{o.icon}</div>
            <span>{o.label[lang]}</span>
            {o.sub && <em>{o.sub}</em>}
          </div>
        );
      })}
      {hub}
      {pills}
    </div>
  );
}

// ---------------------------------------------------------------- the demo
export default function Demo() {
  const { lang, t } = useT();
  const [mode, setModeState] = useState<ModeKey>("convert");
  const [items, setItems] = useState<Item[]>(START);
  const [drag, setDragState] = useState<Drag | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [closing, setClosing] = useState<{ cx: number; cy: number; opts: Opt[]; hover: number; item: Item; mode: ModeKey } | null>(null);
  const [box, setBox] = useState({ w: 600, h: 520 });

  const deskRef = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<Drag | null>(null);
  const modeRef = useRef<ModeKey>("convert");
  const itemsRef = useRef<Item[]>(START);
  const boxRef = useRef(box);
  const auto = useRef({ stop: false });
  const inView = useRef(true);
  const timers = useRef<number[]>([]);
  const counter = useRef(0);

  const scale = Math.min(1, (box.w - 12) / SIZE, (box.h - TASKBAR - 8) / SIZE);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const setMode = (m: ModeKey) => {
    modeRef.current = m;
    setModeState(m);
  };
  const setAllItems = (fn: (prev: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItems(itemsRef.current);
  };

  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      boxRef.current = { w: r.width, h: r.height };
      setBox(boxRef.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wheelCenter = (x: number, y: number): [number, number] => {
    const { w, h } = boxRef.current;
    const half = (SIZE / 2) * scaleRef.current;
    return [clamp(x, half + 4, w - half - 4), clamp(y, half + 4, h - TASKBAR - half - 4)];
  };

  // ---- jobs: a Windows notification when one finishes, like the app
  const typeFor = (ext: string, fallback: string) => TYPES.find((tp) => tp.inputs.some((i) => i.toLowerCase() === ext.toLowerCase()))?.id ?? fallback;

  const runOption = (item: Item, m: ModeKey, key: string) => {
    const type = typeOf(item.typeId);
    const o = optionsFor(type, m).find((x) => x.key === key);
    if (!o) return;
    const id = ++counter.current;
    const outName = o.out ? `${item.name}${o.out.suffix}` : "";
    const job: Job = { id, from: `${item.name}.${item.ext}`, to: o.out ? `${outName}.${o.out.ext}` : "", running: !!o.out, toast: o.toast };
    setJobs((j) => [...j.slice(-1), job]);
    const remove = () => setJobs((j) => j.filter((x) => x.id !== id));
    const finishJob = () => {
      setJobs((j) => j.map((x) => (x.id === id ? { ...x, running: false } : x)));
      if (o.out) {
        setAllItems((prev) => {
          const used = new Set(prev.map((p) => `${p.name}.${p.ext}`));
          let name = outName;
          for (let n = 2; used.has(`${name}.${o.out!.ext}`); n++) name = `${outName}-${n}`;
          const fresh: Item = { id: `n-${id}`, typeId: typeFor(o.out!.ext, item.typeId), name, ext: o.out!.ext, fresh: true };
          return [...prev.filter((p) => !p.fresh), fresh];
        });
      }
      timers.current.push(window.setTimeout(remove, 3400));
    };
    if (!o.out) timers.current.push(window.setTimeout(finishJob, 120));
    else timers.current.push(window.setTimeout(finishJob, Math.max(0.6, type.seconds) * 1000));
  };

  // ---- dragging
  const finish = (d: Drag) => {
    const opts = optionsFor(typeOf(d.item.typeId), modeRef.current);
    const idx = hoverIndex(d, opts.length, scaleRef.current);
    if (d.cx !== null) {
      setClosing({ cx: d.cx, cy: d.cy, opts, hover: idx, item: d.item, mode: modeRef.current });
      timers.current.push(window.setTimeout(() => setClosing(null), 200));
    }
    setDrag(null);
    if (idx >= 0) runOption(d.item, modeRef.current, opts[idx].key);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.auto || !deskRef.current) return;
    const r = deskRef.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const next: Drag = { ...d, x, y };
    if (next.cx === null && Math.hypot(x - d.sx, y - d.sy) > 6) {
      const half = (SIZE / 2) * scaleRef.current;
      next.cx = clamp(x, half + 4, r.width - half - 4);
      next.cy = clamp(y, half + 4, r.height - TASKBAR - half - 4);
    }
    // hovering a mode pill switches mode, so the wheel works without any key
    if (next.cx !== null) {
      const pill = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-wmode]");
      if (pill && pill.dataset.wmode !== modeRef.current) {
        modeRef.current = pill.dataset.wmode as ModeKey;
        setModeState(modeRef.current);
      }
    }
    setDrag(next);
  }, []);

  const onUp = useCallback(() => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    const d = dragRef.current;
    if (d && !d.auto) finishRef.current(d);
  }, [onMove]);

  const stopAuto = () => {
    auto.current.stop = true;
    if (dragRef.current?.auto) setDrag(null);
  };

  const onFileDown = (e: ReactPointerEvent, item: Item) => {
    if (e.button !== 0 || !deskRef.current) return;
    stopAuto();
    const r = deskRef.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    setDrag({ item, x, y, sx: x, sy: y, cx: null, cy: 0, auto: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    e.preventDefault();
  };

  // Shift / Ctrl / Alt pick the mode while a file is dragged, like in the app
  useEffect(() => {
    const modeFromKeys = (e: KeyboardEvent): ModeKey | null => {
      if (e.ctrlKey && e.altKey && !e.shiftKey) return "ai";
      if (e.shiftKey && e.ctrlKey) return "share";
      if (e.shiftKey) return "convert";
      if (e.ctrlKey) return "tools";
      if (e.altKey) return "actions";
      return null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!dragRef.current || dragRef.current.auto) return;
      const m = modeFromKeys(e);
      if (m) setMode(m);
      if (e.key === "Alt") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // ---- self-playing demo until the visitor touches it
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const token = { stop: false };
    auto.current = token;
    const io = new IntersectionObserver(([en]) => (inView.current = en.isIntersecting), { threshold: 0.35 });
    if (deskRef.current) io.observe(deskRef.current);

    (async () => {
      await sleep(1200);
      for (let step = 0; !token.stop; step = (step + 1) % SCRIPT.length) {
        while (!token.stop && (!inView.current || document.hidden)) await sleep(400);
        if (token.stop) return;
        const s = SCRIPT[step];
        const item = itemsRef.current.find((i) => i.typeId === s.type && !i.fresh);
        const tile = item && tiles.current.get(item.id);
        const desk = deskRef.current;
        if (!item || !tile || !desk) return;
        const dr = desk.getBoundingClientRect(), tr = tile.getBoundingClientRect();
        const from = { x: tr.left - dr.left + tr.width / 2, y: tr.top - dr.top + tr.height / 2 - 6 };
        const to = { x: dr.width * 0.5, y: (dr.height - TASKBAR) * 0.62 };
        setMode(s.mode);
        setDrag({ item, x: from.x, y: from.y, sx: from.x, sy: from.y, cx: null, cy: 0, auto: true });
        await tween(1100, token, (k) => {
          const d = dragRef.current;
          if (d) setDrag({ ...d, x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
        });
        if (token.stop || !dragRef.current) return;
        const [cx, cy] = wheelCenter(to.x, to.y);
        setDrag({ ...dragRef.current, cx, cy });
        await sleep(900);
        if (token.stop || !dragRef.current) return;
        const opts = optionsFor(typeOf(s.type), s.mode);
        const idx = Math.max(0, opts.findIndex((o) => o.key === s.pick));
        const a = ((idx + 0.5) * Math.PI * 2) / opts.length;
        const r = ((R_IN + R_OUT) / 2) * scaleRef.current;
        const target = { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
        const from2 = { x: dragRef.current.x, y: dragRef.current.y };
        await tween(800, token, (k) => {
          const d = dragRef.current;
          if (d) setDrag({ ...d, x: from2.x + (target.x - from2.x) * k, y: from2.y + (target.y - from2.y) * k });
        });
        if (token.stop || !dragRef.current) return;
        await sleep(650);
        if (token.stop || !dragRef.current) return;
        finishRef.current(dragRef.current);
        await sleep(4200);
        if (token.stop) return;
        setAllItems((prev) => prev.filter((p) => !p.fresh));
        await sleep(600);
      }
    })();

    return () => {
      token.stop = true;
      io.disconnect();
      timers.current.forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- render
  const dragType = drag ? typeOf(drag.item.typeId) : null;
  const opts = useMemo(() => (dragType ? optionsFor(dragType, mode) : []), [dragType, mode]);
  const hover = drag ? hoverIndex(drag, opts.length, scale) : -1;
  const shown = drag && drag.cx !== null ? { cx: drag.cx, cy: drag.cy, opts, hover, item: drag.item, mode, out: false } : closing ? { ...closing, out: true } : null;
  const running = jobs.find((j) => j.running);
  const toast = [...jobs].reverse().find((j) => !j.running);

  return (
    <div className="demo">
      <div className="desk" ref={deskRef} onPointerDown={() => { if (!auto.current.stop) stopAuto(); }}>
        <div className="win-bar" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#f5b942"><path d="M3 7.5A2.5 2.5 0 015.5 5H9l2 2.2h7.5A2.5 2.5 0 0121 9.7V17.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z" /></svg>
          <span>{t("Tải xuống", "Downloads")}</span>
          <span className="win-ctl"><i>–</i><i>▢</i><i>✕</i></span>
        </div>
        <div className="desk-files">
          {items.map((it) => (
            <div
              key={it.id}
              ref={(el) => {
                if (el) tiles.current.set(it.id, el);
                else tiles.current.delete(it.id);
              }}
              className={`tile${drag?.item.id === it.id ? " dim" : ""}${it.fresh ? " fresh" : ""}`}
              onPointerDown={(e) => onFileDown(e, it)}
            >
              <FileBadge ext={it.ext} size={44} />
              <span className="tile-name">{it.name}.{it.ext}</span>
            </div>
          ))}
        </div>

        {shown && (
          <div className="w-pos" style={{ left: shown.cx - SIZE / 2, top: shown.cy - SIZE / 2, transform: `scale(${scale})` }}>
            <WheelView opts={shown.opts} hover={shown.hover} mode={shown.mode} item={shown.item} lang={lang} enter={!shown.out} out={shown.out} key={shown.out ? "closing" : `${shown.item.id}-${shown.mode}`} />
          </div>
        )}

        {drag && (
          <div className="ghost" style={{ transform: `translate3d(${drag.x - 26}px, ${drag.y - 30}px, 0) rotate(-4deg)` }}>
            <FileBadge ext={drag.item.ext} size={44} />
          </div>
        )}
        {drag?.auto && (
          <svg className="cursor" width="22" height="26" viewBox="0 0 22 26" style={{ transform: `translate3d(${drag.x - 2}px, ${drag.y - 2}px, 0)` }} aria-hidden="true">
            <path d="M2 1.5v19l5.2-4.6 3.4 7.6 3.1-1.4-3.4-7.4H18z" fill="#111827" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        )}

        {toast && (
          <div className="toast" key={toast.id}>
            <div className="toast-app"><span className="tray-dot" /> Tangelo</div>
            <div className="toast-title">{toast.toast ? toast.toast[lang] : t("Hoàn tất", "Done")}</div>
            {toast.to && <div className="toast-body">{toast.from} → {toast.to}</div>}
          </div>
        )}

        <div className="taskbar" aria-hidden="true">
          <span className="start"><i /><i /><i /><i /></span>
          <span className="status">{running ? t(`Đang xử lý ${running.from}…`, `Working on ${running.from}…`) : ""}</span>
          <span className="tray"><span className={`tray-dot${running ? " busy" : ""}`} /><span>9:41</span></span>
        </div>
      </div>

      <p className="demo-caption">{t(<>Đây là bản chạy thử ngay trên trang: nắm một file, kéo vào khung rồi thả lên ô bạn chọn. Nhấn <kbd>Shift</kbd>, <kbd>Ctrl</kbd> hoặc <kbd>Alt</kbd> khi đang kéo để đổi bộ ô.</>, <>This is a live try-out: grab a file, pull it into the window and release on a slice. Press <kbd>Shift</kbd>, <kbd>Ctrl</kbd> or <kbd>Alt</kbd> while dragging to change the set of slices.</>)}</p>
    </div>
  );
}
