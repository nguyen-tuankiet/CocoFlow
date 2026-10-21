import { useEffect, useState } from "react";
import { Segmented } from "antd";
import { useT } from "./lang";

type Label = string | { vi: string; en: string };
type Slice = [badge: string, label: Label, color: string];
type Mode = { vi: string; en: string; key: string; slices: Slice[] };

const MODES: Record<string, Mode> = {
  convert: {
    vi: "Chuyển đổi", en: "Convert", key: "Shift",
    slices: [["JPG", "JPG", "#3f6df6"], ["PNG", "PNG", "#3f6df6"], ["WEBP", "WebP", "#3f6df6"], ["PDF", "PDF", "#ef4f4f"], ["MP4", "MP4", "#7a5af8"], ["MP3", "MP3", "#12a594"]],
  },
  tools: {
    vi: "Công cụ", en: "Tools", key: "Ctrl",
    slices: [
      ["ZIP", "Zip", "#e0a100"], ["CUT", { vi: "Cắt", en: "Trim" }, "#7a5af8"], ["CROP", { vi: "Xén", en: "Crop" }, "#7a5af8"],
      ["SIZE", { vi: "Đổi cỡ", en: "Resize" }, "#3f6df6"], ["PDF", { vi: "Chia PDF", en: "Split PDF" }, "#ef4f4f"], ["MERGE", { vi: "Ghép", en: "Merge" }, "#12a594"],
    ],
  },
  actions: {
    vi: "Thao tác", en: "Actions", key: "Alt",
    slices: [
      ["OPEN", { vi: "Mở", en: "Open" }, "#3f6df6"], ["DIR", { vi: "Thư mục", en: "Folder" }, "#e0a100"], ["PATH", { vi: "Chép đường dẫn", en: "Copy path" }, "#7a5af8"],
      ["COPY", { vi: "Chép file", en: "Copy file" }, "#12a594"], ["MOVE", { vi: "Di chuyển", en: "Move to" }, "#ef4f4f"], ["TO", { vi: "Sao chép đến", en: "Copy to" }, "#3f6df6"],
    ],
  },
  share: {
    vi: "Chia sẻ", en: "Share", key: "Shift+Ctrl",
    slices: [["ZALO", "Zalo", "#0a68ff"], ["MAIL", "Email", "#7a5af8"], ["STORY", "Story", "#e1306c"], ["WEB", "Web", "#12a594"], ["FB", "Facebook", "#1877f2"], ["SHOP", "Shopee", "#ee4d2d"]],
  },
  ai: {
    vi: "AI", en: "AI", key: "Ctrl+Alt",
    slices: [
      ["OCR", { vi: "OCR tiếng Việt", en: "OCR" }, "#7a5af8"], ["SRT", { vi: "Phụ đề", en: "Subtitles" }, "#3f6df6"], ["BG", { vi: "Xóa nền", en: "Remove bg" }, "#12a594"],
      ["4X", { vi: "Phóng to", en: "Upscale" }, "#e0a100"], ["SUM", { vi: "Tóm tắt", en: "Summary" }, "#ef4f4f"], ["TXT", { vi: "Lấy văn bản", en: "Extract text" }, "#3f6df6"],
    ],
  },
};

const C = 210;
const polar = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const sector = (a0: number, a1: number, r0: number, r1: number) => {
  const [px, py] = polar(r1, a0), [qx, qy] = polar(r1, a1), [sx, sy] = polar(r0, a1), [tx, ty] = polar(r0, a0);
  return `M${px},${py}A${r1},${r1} 0 0 1 ${qx},${qy}L${sx},${sy}A${r0},${r0} 0 0 0 ${tx},${ty}Z`;
};

export default function Wheel() {
  const { lang, t } = useT();
  const [mode, setMode] = useState<keyof typeof MODES>("convert");
  const [tick, setTick] = useState(0);

  // the flying file chip reaches the first slice of "Convert" about 3.7 s into its 6 s loop
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 60), 100);
    return () => clearInterval(id);
  }, []);
  const lit = (i: number) => mode === "convert" && i === 0 && tick >= 36 && tick < 48;

  const m = MODES[mode];
  const step = 360 / m.slices.length;
  const text = (v: Label) => (typeof v === "string" ? v : v[lang]);

  return (
    <div className="stage">
      <div className="wheel-box">
        <svg viewBox="0 0 420 420" role="img" aria-label="Tangelo wheel">
          {m.slices.map(([badge, label, color], i) => {
            const a0 = i * step + 1.2, a1 = (i + 1) * step - 1.2;
            const [cx, cy] = polar(144, (a0 + a1) / 2);
            return (
              <g key={`${mode}-${badge}`} className={`slice-g${lit(i) ? " hot" : ""}`}>
                <path className="slice" d={sector(a0, a1, 78, 200)} />
                <rect x={cx - 20} y={cy - 24} width={40} height={22} rx={6} fill={color} />
                <text className="badge-t" x={cx} y={cy - 9}>{badge.slice(0, 5)}</text>
                <text className="lab" x={cx} y={cy + 16}>{text(label)}</text>
              </g>
            );
          })}
          <circle className="hub" cx={C} cy={C} r={70} />
          <text className="hub-t" x={C} y={206}>{t("Thả file", "Drop here")}</text>
          <text className="hub-t" x={C} y={224} style={{ fontWeight: 800 }}>{m[lang]}</text>
        </svg>
        {mode === "convert" && (
          <div className="chip" aria-hidden="true">
            <i>HEIC</i> photo.heic
          </div>
        )}
      </div>
      <Segmented
        value={mode}
        onChange={(v) => setMode(v as keyof typeof MODES)}
        options={Object.entries(MODES).map(([k, v]) => ({
          value: k,
          label: (
            <span>
              {v[lang]} <kbd>{v.key}</kbd>
            </span>
          ),
        }))}
        style={{ maxWidth: "100%", overflowX: "auto" }}
      />
      <span style={{ color: "#6b7280", fontSize: 13 }}>{t("Bấm các chế độ để xem bánh xe thay đổi.", "Click a mode to see the wheel change.")}</span>
    </div>
  );
}
