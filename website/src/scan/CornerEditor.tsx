import { RotateLeftOutlined, RotateRightOutlined } from "@ant-design/icons";
import { Button, Modal, message } from "antd";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { useT } from "../lang";
import type { Engine } from "./client";
import { clampQuad, defaultQuad, isValidQuad, outputSize } from "./engine/geometry";
import type { Quad, Turns } from "./engine/types";
import type { Item, Settings } from "./useScanner";

interface Props {
  item: Item;
  engine: Engine;
  settings: Settings;
  onApply: (quad: Quad, turns: Turns) => void;
  onClose: () => void;
}

/** Original photo with four draggable corners on the left, the straightened page (live) on the right. */
export default function CornerEditor({ item, engine, settings, onApply, onClose }: Props) {
  const { t } = useT();
  const w = item.width;
  const h = item.height;
  const [pts, setPts] = useState<Quad>(() => item.quad ?? defaultQuad(w, h));
  const [turns, setTurns] = useState<Turns>(item.turns);
  const paper = settings.paper;
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const token = useRef(0);
  const valid = isValidQuad(pts, w, h);
  const [msg, msgHolder] = message.useMessage();

  // live preview: always the latest corners, never more than one request in flight
  const pending = useRef(false);
  const again = useRef(false);
  useEffect(() => {
    if (!valid) return;
    const run = async () => {
      if (pending.current) {
        again.current = true;
        return;
      }
      pending.current = true;
      const mine = ++token.current;
      try {
        const r = await engine.preview(item.id, { quad: pts, text: item.text, look: settings.look, paper, turns, format: "jpeg" });
        if (mine === token.current && canvas.current) {
          canvas.current.width = r.width;
          canvas.current.height = r.height;
          canvas.current.getContext("2d")!.putImageData(new ImageData(r.data as unknown as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), 0, 0);
        }
      } catch {
        /* an unusable outline simply keeps the last picture */
      } finally {
        pending.current = false;
        if (again.current) {
          again.current = false;
          void run();
        }
      }
    };
    void run();
  }, [pts, turns, paper, valid, engine, item.id, settings.look]);

  const toPicture = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  const bound = (q: Quad) => clampQuad(q, w, h, 0.15);

  const grabCorner = (i: number) => (e: RPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = toPicture(ev);
      setPts((prev) => bound(prev.map((q, k) => (k === i ? p : q)) as Quad));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const grabShape = (e: RPointerEvent<SVGPolygonElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const from = toPicture(e);
    const start = pts;
    const move = (ev: PointerEvent) => {
      const p = toPicture(ev);
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      setPts(bound(start.map((q) => ({ x: q.x + dx, y: q.y + dy })) as Quad));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const nudge = (i: number, e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    setPts((prev) => bound(prev.map((q, k) => (k === i ? { x: q.x + v[0], y: q.y + v[1] } : q)) as Quad));
  };

  const find = async (method: "auto" | "edges" | "text") => {
    setBusy(true);
    try {
      const d = await engine.analyze(item.id, method);
      if (d) setPts(d.quad);
      else msg.info(method === "text" ? t("Không tìm thấy dòng chữ nào để căn.", "No lines of text found to align to.") : t("Không nhận ra mép trang giấy.", "Could not find the edges of the page."));
    } catch {
      msg.error(t("Không nhận diện được. Hãy kéo bốn góc bằng tay.", "Detection failed. Drag the four corners by hand."));
    } finally {
      setBusy(false);
    }
  };

  const size = valid ? outputSize(pts, paper) : null;
  const rotated = turns % 2 === 1 && size ? { w: size.h, h: size.w } : size;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <Modal
      open
      centered
      width={1000}
      onCancel={onClose}
      title={t("Chỉnh bốn góc", "Adjust the four corners") + " · " + item.name}
      footer={[
        <Button key="c" onClick={onClose}>{t("Hủy", "Cancel")}</Button>,
        <Button key="a" type="primary" disabled={!valid} onClick={() => onApply(pts, turns)}>{t("Áp dụng", "Apply")}</Button>,
      ]}
    >
      {msgHolder}
      <div className="sc-editor">
        <div className="sc-pane">
          <div className="sc-label">{t("Ảnh gốc: kéo bốn chấm vào bốn góc trang giấy", "Original: drag the four dots onto the corners of the page")}</div>
          <div className="sc-stage" ref={stage} style={{ aspectRatio: `${w} / ${h}` }}>
            <img src={item.srcUrl} alt="" draggable={false} />
            <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
              <path className="sc-dim" fillRule="evenodd" d={`M0 0H${w}V${h}H0Z M${pts.map((p) => `${p.x} ${p.y}`).join(" L")} Z`} />
              <polygon className={`sc-poly${valid ? "" : " bad"}`} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} onPointerDown={grabShape} />
            </svg>
            {pts.map((p, i) => (
              <div
                key={i}
                className="sc-dot"
                role="slider"
                tabIndex={0}
                aria-label={t(["Góc trên trái", "Góc trên phải", "Góc dưới phải", "Góc dưới trái"][i], ["Top-left corner", "Top-right corner", "Bottom-right corner", "Bottom-left corner"][i])}
                style={{ left: pct(p.x, w), top: pct(p.y, h) }}
                onPointerDown={grabCorner(i)}
                onKeyDown={(e) => nudge(i, e)}
              />
            ))}
          </div>
        </div>
        <div className="sc-pane">
          <div className="sc-label">{t("Kết quả (xem trước)", "Result (preview)")}</div>
          <div className="sc-result">
            <canvas ref={canvas} />
          </div>
          <div className="sc-note">{rotated ? `${rotated.w} × ${rotated.h} px` : t("Bốn góc chưa hợp lệ: không được chéo nhau hay quá nhỏ.", "The corners are not valid: they must not cross or be too small.")}</div>
        </div>
      </div>
      <div className="sc-tools">
        <Button loading={busy} onClick={() => find("auto")}>{t("Tự tìm trang", "Find the page")}</Button>
        <Button loading={busy} onClick={() => find("text")} title={t("Dùng khi ảnh không thấy mép giấy", "For photos where the edges of the paper are not visible")}>
          {t("Căn theo chữ", "Align to text")}
        </Button>
        <Button onClick={() => setPts(defaultQuad(w, h))}>{t("Đặt lại", "Reset")}</Button>
        <Button icon={<RotateLeftOutlined />} aria-label={t("Xoay trái", "Rotate left")} onClick={() => setTurns(((turns + 3) % 4) as Turns)} />
        <Button icon={<RotateRightOutlined />} aria-label={t("Xoay phải", "Rotate right")} onClick={() => setTurns(((turns + 1) % 4) as Turns)} />
      </div>
    </Modal>
  );
}
