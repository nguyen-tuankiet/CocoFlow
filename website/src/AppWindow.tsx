import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FileBadge, Icon, iconColor } from "./appicons";
import { ACTIONS, ACTION_KEYS, AI, FORMAT, MODE_INFO, TOOLS, TYPES, listsFor } from "./data";
import type { L, ModeKey } from "./data";
import { useT } from "./lang";

// ============================================================================================
// An interactive copy of the real Cocoflow window: pick a tab, click an option, watch the job
// run in Activity (pause, resume, cancel). "Cắt đoạn" opens the trim editor, also working.
// ============================================================================================

const FRAMES = 12;
const frameSrc = (i: number) => `./frames/f${String(Math.max(0, Math.min(FRAMES - 1, i))).padStart(2, "0")}.jpg`;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const parseTime = (v: string): number | null => {
  const m = v.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return m ? (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]) : null;
};

type JobStatus = "running" | "paused" | "done" | "cancelled";
type Job = { id: number; title: string; status: JobStatus; pct: number; speed: number };

type Tile = { key: string; label: L; icon: ReactNode; sub?: string; edit?: boolean; job: string };

function Pill({ children }: { children: ReactNode }) {
  return <span className="aw-chip">{children}</span>;
}

// ------------------------------------------------------------------------------------ trim editor
export function TrimDialog({ file, onClose, onStart, inline }: { file: string; onClose?: () => void; onStart?: (a: number, b: number) => void; inline?: boolean }) {
  const { t } = useT();
  const D = 12;
  const [a, setA] = useState(0);
  const [b, setB] = useState(D);
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(false);
  const [msg, setMsg] = useState("");
  const [fromText, setFromText] = useState(fmtTime(0));
  const [toText, setToText] = useState(fmtTime(D));
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<"a" | "b" | "p" | null>(null);

  useEffect(() => setFromText(fmtTime(a)), [a]);
  useEffect(() => setToText(fmtTime(b)), [b]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setP((x) => {
        const nx = x + 0.1;
        if (nx >= b) {
          setPlaying(false);
          return b;
        }
        return nx;
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, b]);

  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(D, ((clientX - r.left) / r.width) * D));
  };
  const onMove = (e: PointerEvent) => {
    const v = Math.round(at(e.clientX) * 10) / 10;
    if (drag.current === "a") setA(Math.min(v, b - 0.5)), setP(Math.min(v, b - 0.5));
    if (drag.current === "b") setB(Math.max(v, a + 0.5)), setP(Math.max(v, a + 0.5));
    if (drag.current === "p") setP(v);
  };
  const stop = () => {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stop);
  };
  const begin = (which: "a" | "b" | "p") => (e: React.PointerEvent) => {
    e.stopPropagation();
    setPlaying(false);
    drag.current = which;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    if (which === "p") setP(Math.round(at(e.clientX) * 10) / 10);
  };

  const commit = (which: "a" | "b", text: string) => {
    const v = parseTime(text);
    if (v === null) return which === "a" ? setFromText(fmtTime(a)) : setToText(fmtTime(b));
    if (which === "a") setA(Math.max(0, Math.min(v, b - 0.5)));
    else setB(Math.min(D, Math.max(v, a + 0.5)));
  };

  const pct = (v: number) => `${(v / D) * 100}%`;
  const frame = Math.floor((p / D) * FRAMES);

  const body = (
    <>
      <div className="aw-stage"><img src={frameSrc(frame)} alt="" draggable={false} /></div>
      <div className="aw-track" ref={track} onPointerDown={begin("p")}>
        <div className="aw-range" style={{ left: pct(a), width: `${((b - a) / D) * 100}%` }} />
        <div className="aw-head" style={{ left: pct(p) }} />
        <div className="aw-handle" style={{ left: pct(a) }} onPointerDown={begin("a")} />
        <div className="aw-handle" style={{ left: pct(b) }} onPointerDown={begin("b")} />
      </div>
      <div className="aw-row">
        <button type="button" className="aw-ghost play" onClick={() => { if (p >= b - 0.05) setP(a); setPlaying((x) => !x); }} aria-label="Play">{playing ? "❚❚" : "▶"}</button>
        <span className="aw-time">{fmtTime(p)} / {fmtTime(D)}</span>
      </div>
      <div className="aw-row">
        <label>{t("Từ", "From")} <input value={fromText} onChange={(e) => setFromText(e.target.value)} onBlur={() => commit("a", fromText)} onKeyDown={(e) => e.key === "Enter" && commit("a", fromText)} /></label>
        <label>{t("Đến", "To")} <input value={toText} onChange={(e) => setToText(e.target.value)} onBlur={() => commit("b", toText)} onKeyDown={(e) => e.key === "Enter" && commit("b", toText)} /></label>
        <button type="button" className="aw-chipbtn" onClick={() => setA(Math.min(p, b - 0.5))}>{t("Đặt điểm đầu", "Start here")}</button>
        <button type="button" className="aw-chipbtn" onClick={() => setB(Math.max(p, a + 0.5))}>{t("Đặt điểm cuối", "End here")}</button>
        <button type="button" className="aw-chipbtn" onClick={() => { setP(a); setPlaying(true); }}>{t("Xem đoạn đã chọn", "Play selection")}</button>
      </div>
      <div className="aw-note">{t("Đoạn chọn", "Selection")}: {fmtTime(b - a)} {t("trên", "of")} {fmtTime(D)}</div>
      <label className="aw-check"><input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} /> {t("Nhanh (không mã hóa lại, điểm cắt có thể lệch 1–2 giây)", "Fast (no re-encoding, cut points may be off by a second or two)")}</label>
    </>
  );

  return (
    <div className={`aw-dialog${inline ? " inline" : ""}`} role="dialog">
      <header>
        <h3>{t("Cắt đoạn", "Trim")} <small>{file}</small></h3>
        {onClose && <button type="button" className="aw-x" onClick={onClose} aria-label="Close">✕</button>}
      </header>
      <div className="aw-body">{body}</div>
      <footer>
        <span className="aw-msg">{msg}</span>
        <button type="button" className="aw-ghost" onClick={onClose ?? (() => { setA(0); setB(D); setP(0); setMsg(""); })}>{onClose ? t("Hủy", "Cancel") : t("Đặt lại", "Reset")}</button>
        <button
          type="button"
          className="aw-primary"
          onClick={() => (onStart ? onStart(a, b) : setMsg(`✓ ${t("Đã bắt đầu cắt", "Trimming started")} ${fmtTime(a)} – ${fmtTime(b)}`))}
        >
          {t("Bắt đầu", "Start")}
        </button>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------------------------ the window
export default function AppWindow({ typeId, mode: initialMode = "convert" }: { typeId: string; mode?: ModeKey }) {
  const { lang, t } = useT();
  const type = TYPES.find((x) => x.id === typeId)!;
  const [mode, setMode] = useState<ModeKey>(initialMode);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [trim, setTrim] = useState(false);
  const counter = useRef(0);
  const file = `${type.example.name}.${type.example.ext}`;
  const lists = listsFor(type, type.example.ext);

  const tiles: Tile[] = useMemo(() => {
    switch (mode) {
      case "convert":
        return lists.convert.map((e) => ({ key: e, label: FORMAT[e], icon: <FileBadge ext={e} size={37} />, job: `→ ${e.toUpperCase()}` }));
      case "tools":
        return lists.tools.map((k) => ({ key: k, label: TOOLS[k].label, icon: <Glyph name={TOOLS[k].icon} />, edit: k === "trim", job: TOOLS[k].label[lang] }));
      case "actions":
        return ACTION_KEYS.map((k) => ({ key: k, label: ACTIONS[k].label, icon: <Glyph name={ACTIONS[k].icon} />, job: ACTIONS[k].label[lang] }));
      case "share":
        return lists.share.map((g, i) => ({ key: `g${i}`, label: g.label, icon: <Glyph name={g.icon} />, sub: g.sub, job: `→ ${g.label[lang]}` }));
      case "ai":
        return lists.ai.map((k) => ({ key: k, label: AI[k].label, icon: <Glyph name={AI[k].icon} />, job: AI[k].label[lang] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lang, type.id]);

  const run = (title: string, seconds: number) => {
    const id = ++counter.current;
    const job: Job = { id, title, status: "running", pct: 0, speed: 100 / (seconds * 10) };
    setJobs((j) => [job, ...j].slice(0, 4));
  };

  // every running job moves forward 10 times a second
  useEffect(() => {
    if (!jobs.some((j) => j.status === "running")) return;
    const id = window.setInterval(() => {
      setJobs((all) => all.map((j) => (j.status !== "running" ? j : j.pct + j.speed >= 100 ? { ...j, pct: 100, status: "done" } : { ...j, pct: j.pct + j.speed })));
    }, 100);
    return () => clearInterval(id);
  }, [jobs]);

  const click = (tile: Tile) => {
    if (tile.edit) return setTrim(true);
    const secs = mode === "ai" ? 3.2 : Math.max(1.4, type.seconds * 1.6);
    run(mode === "convert" || mode === "share" ? `${file} ${tile.job}` : `${file} · ${tile.job}`, secs);
  };
  const setStatus = (id: number, status: JobStatus) => setJobs((all) => all.map((j) => (j.id === id ? { ...j, status } : j)));

  const modes: ModeKey[] = ["convert", "tools", "actions", "share", "ai"];
  const stateText = (j: Job) =>
    j.status === "done" ? t("Xong", "Done") : j.status === "cancelled" ? t("Đã hủy", "Cancelled") : j.status === "paused" ? `${t("Tạm dừng", "Paused")} ${Math.round(j.pct)}%` : `${Math.round(j.pct)}%`;

  return (
    <div className="aw-frame">
      <div className="aw-titlebar" aria-hidden="true">
        <img src="./logo.png" alt="" width="16" height="16" />
        <span>Cocoflow</span>
        <span className="aw-ctl"><i>–</i><i>▢</i><i>✕</i></span>
      </div>

      <div className="aw-app">
        <section className="aw-work">
          <div className="aw-filesrow">
            <div className="aw-files"><Pill><FileBadge ext={type.example.ext} size={14} /> {file}</Pill></div>
            <button type="button" className="aw-ghost" onClick={() => setJobs([])}>{t("Xóa", "Clear")}</button>
          </div>
          <div className="aw-tabs" role="tablist">
            {modes.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={m === mode} className={`aw-tab${m === mode ? " on" : ""}`} onClick={() => setMode(m)}>
                {MODE_INFO[m].label[lang]}<small>{MODE_INFO[m].keys}</small>
              </button>
            ))}
          </div>
          {tiles.length === 0 ? (
            <div className="aw-empty">{t("Không có lựa chọn nào cho loại file này ở chế độ này.", "Nothing for this kind of file in this mode.")}</div>
          ) : (
            <div className="aw-options">
              {tiles.map((tile) => (
                <button key={tile.key} type="button" className="aw-option" onClick={() => click(tile)}>
                  {tile.icon}
                  <span>{tile.label[lang]}</span>
                  {tile.sub && <small>{tile.sub}</small>}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="aw-activity">
          <div className="aw-ahead">
            <h4>{t("Hoạt động", "Activity")}</h4>
            {jobs.some((j) => j.status === "running" || j.status === "paused") && (
              <button type="button" className="aw-ghost small" onClick={() => setJobs((all) => all.map((j) => (j.status === "running" || j.status === "paused" ? { ...j, status: "cancelled" } : j)))}>{t("Hủy tất cả", "Cancel all")}</button>
            )}
          </div>
          {jobs.length === 0 ? (
            <div className="aw-muted">{t("Chưa có gì. Bấm vào một ô ở trên.", "Nothing yet. Click an option above.")}</div>
          ) : (
            <div className="aw-jobs">
              {jobs.map((j) => (
                <div key={j.id} className={`aw-job ${j.status}`}>
                  <div className="aw-jtitle" title={j.title}>{j.title}</div>
                  <div className="aw-jright">
                    {j.status === "done" ? (
                      <button type="button" className="aw-ghost">{t("Mở thư mục", "Show")}</button>
                    ) : (
                      <>
                        <span className="aw-state">{stateText(j)}</span>
                        {(j.status === "running" || j.status === "paused") && (
                          <span className="aw-jactions">
                            {j.status === "running" ? (
                              <button type="button" className="aw-icon" onClick={() => setStatus(j.id, "paused")} title={t("Tạm dừng", "Pause")}>⏸</button>
                            ) : (
                              <button type="button" className="aw-icon" onClick={() => setStatus(j.id, "running")} title={t("Tiếp tục", "Resume")}>▶</button>
                            )}
                            <button type="button" className="aw-icon" onClick={() => setStatus(j.id, "cancelled")} title={t("Hủy", "Cancel")}>✕</button>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {(j.status === "running" || j.status === "paused") && (
                    <div className={`aw-bar${j.status === "paused" ? " paused" : ""}`}><i style={{ width: `${j.pct}%` }} /></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {trim && (
        <div className="aw-modal" onPointerDown={(e) => e.target === e.currentTarget && setTrim(false)}>
          <TrimDialog file={file} onClose={() => setTrim(false)} onStart={(a, b) => { setTrim(false); run(`${file} · ${t("Cắt đoạn", "Trim")} ${fmtTime(a)}–${fmtTime(b)}`, 2.2); }} />
        </div>
      )}
    </div>
  );
}

function Glyph({ name }: { name: string }) {
  return (
    <span className="aw-glyph" style={{ color: iconColor(name) }}>
      <Icon name={name} size={26} />
    </span>
  );
}
