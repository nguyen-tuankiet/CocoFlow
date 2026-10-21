import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "antd";
import {
  ArrowRightOutlined,
  CommentOutlined,
  CustomerServiceOutlined,
  ExpandOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FolderOpenOutlined,
  FundProjectionScreenOutlined,
  GroupOutlined,
  InfoCircleFilled,
  PictureOutlined,
  PlayCircleOutlined,
  ShareAltOutlined,
  StarOutlined,
  SwapOutlined,
  TableOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { AI, AI_DESC, FORMAT, TOOLS, TOOL_DESC, TYPES, extOf, listsFor } from "./data";
import type { FType } from "./data";
import { Icon } from "./appicons";
import { useT } from "./lang";

const TYPE_ICON: Record<string, ReactNode> = {
  image: <PictureOutlined />,
  video: <PlayCircleOutlined />,
  audio: <CustomerServiceOutlined />,
  pdf: <FilePdfOutlined />,
  document: <FileTextOutlined />,
  sheet: <TableOutlined />,
  slides: <FundProjectionScreenOutlined />,
  archive: <FileZipOutlined />,
  subtitle: <CommentOutlined />,
};

const NOUN: Record<string, { vi: string; en: string }> = {
  image: { vi: "ảnh", en: "an image" },
  video: { vi: "video", en: "a video" },
  audio: { vi: "âm thanh", en: "an audio" },
  pdf: { vi: "PDF", en: "a PDF" },
  document: { vi: "tài liệu", en: "a document" },
  sheet: { vi: "bảng tính", en: "a spreadsheet" },
  slides: { vi: "slide", en: "a slide" },
  archive: { vi: "file nén", en: "an archive" },
  subtitle: { vi: "phụ đề", en: "a subtitle" },
};

type Sel = { mode: "convert" | "tools" | "share" | "ai"; key: string };

/** One plain row: an outline icon, the label, and the chips on a single line. */
function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="ft-row">
      <div className="ft-label">
        <span className="ft-icon">{icon}</span>
        <b>{label}</b>
      </div>
      <div className="ft-chips">{children}</div>
    </div>
  );
}

function Panel({ type }: { type: FType }) {
  const { lang, t } = useT();
  const [src, setSrc] = useState(type.example.ext);
  const lists = listsFor(type, src);
  const shownTools = lists.tools.filter((k) => !type.hideTools?.includes(k));
  const [sel, setSel] = useState<Sel>({ mode: "convert", key: lists.convert[0] });

  // changing the source format changes what the wheel offers: keep the pick only if it is still there
  useEffect(() => {
    const ok =
      (sel.mode === "convert" && lists.convert.includes(sel.key)) ||
      (sel.mode === "tools" && lists.tools.includes(sel.key)) ||
      (sel.mode === "ai" && lists.ai.includes(sel.key)) ||
      (sel.mode === "share" && sel.key.startsWith("g") && Number(sel.key.slice(1)) < lists.share.length);
    if (!ok) setSel({ mode: "convert", key: lists.convert[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const noun = NOUN[type.id][lang];
  const base = type.example.name;
  const on = (m: Sel["mode"], k: string) => (sel.mode === m && sel.key === k ? " on" : "");

  // the result of the picked option
  let outName = "", desc = "", toast = false;
  if (sel.mode === "convert") {
    outName = `${base}.${sel.key}`;
    desc = t(`Chuyển ${src.toUpperCase()} sang ${FORMAT[sel.key]?.vi ?? sel.key.toUpperCase()}. File mới nằm cạnh file gốc.`, `Converts ${src.toUpperCase()} to ${FORMAT[sel.key]?.en ?? sel.key.toUpperCase()}. The new file lands next to the original.`);
  } else if (sel.mode === "tools") {
    const d = TOOLS[sel.key];
    toast = !!d.toast;
    outName = d.toast ? "" : `${base}${d.suffix}.${d.ext ?? src}`;
    desc = TOOL_DESC[sel.key][lang];
  } else if (sel.mode === "ai") {
    const d = AI[sel.key];
    outName = `${base}${d.suffix}.${d.ext ?? "txt"}`;
    desc = AI_DESC[sel.key][lang];
  } else {
    const g = lists.share[Number(sel.key.slice(1))];
    if (g) {
      outName = `${base}${g.suffix}.${g.ext}`;
      desc = t(`Tự tính cấu hình để phù hợp ${g.label.vi}: ${type.example.size} → ${g.sub}.`, `Works out the settings to suit ${g.label.en}: ${type.example.size} → ${g.sub}.`);
    }
  }

  return (
    <div className="ft-card">
      <div className="ft-banner">
        <span className="ft-banner-icon">{TYPE_ICON[type.id]}</span>
        <div className="ft-banner-text">
          <h3>{type.name[lang]}</h3>
          <p>{t(`Kéo một file ${noun} vào bánh xe, hoặc bấm vào các ô bên dưới để xem Cocoflow làm được gì.`, `Drag ${noun} file onto the wheel, or click the chips below to see what Cocoflow can do.`)}</p>
        </div>
        <Button className="cta cta-sm" type="primary" icon={<FolderOpenOutlined />} href="#top">{t("Thử trong demo", "Try the demo")}</Button>
      </div>

      <div className="ft-rows">
        <Row icon={<ExpandOutlined />} label={t("Đọc được", "Opens")}>
          {type.inputs.map((i) => {
            const e = extOf(i);
            return (
              <button key={i} type="button" className={`ft-pill${e === src ? " on" : ""}`} onClick={() => setSrc(e)}>{i}</button>
            );
          })}
        </Row>

        <Row icon={<SwapOutlined />} label={t("Chuyển đổi", "Convert")}>
          {lists.convert.map((e) => (
            <button key={e} type="button" className={`ft-pill${on("convert", e)}`} onClick={() => setSel({ mode: "convert", key: e })}>{e.toUpperCase()}</button>
          ))}
        </Row>

        {shownTools.length > 0 && (
          <Row icon={<ToolOutlined />} label={t("Công cụ", "Tools")}>
            {shownTools.map((k) => (
              <button key={k} type="button" className={`ft-tool${on("tools", k)}`} onClick={() => setSel({ mode: "tools", key: k })}>
                <Icon name={TOOLS[k].icon} size={18} color="currentColor" />
                {TOOLS[k].label[lang]}
              </button>
            ))}
          </Row>
        )}

        {type.multi && (
          <Row icon={<GroupOutlined />} label={t("Nhiều file", "Several files")}>
            <span className="ft-text">{t("Chọn nhiều file rồi ", "Select several and ")}{type.multi[lang]}.</span>
          </Row>
        )}

        {lists.share.length > 0 && (
          <Row icon={<ShareAltOutlined />} label={t("Chia sẻ", "Share")}>
            {lists.share.map((g, i) => (
              <button key={g.label.vi} type="button" className={`ft-pill${on("share", `g${i}`)}`} onClick={() => setSel({ mode: "share", key: `g${i}` })}>
                {g.label[lang]} {g.sub}
              </button>
            ))}
          </Row>
        )}

        {lists.ai.length > 0 && (
          <Row icon={<StarOutlined />} label={t("AI offline", "AI offline")}>
            {lists.ai.map((k) => (
              <button key={k} type="button" className={`ft-pill${on("ai", k)}`} onClick={() => setSel({ mode: "ai", key: k })}>
                {AI[k].label[lang]}
              </button>
            ))}
          </Row>
        )}
      </div>

      <div className="ft-result" key={`${src}-${sel.mode}-${sel.key}`}>
        <span className="ft-flow">
          {base}.{src} <ArrowRightOutlined /> {toast ? t("thư mục cạnh file gốc", "folder next to the original") : outName}
        </span>
        <span className="ft-desc">{desc}</span>
      </div>

      {type.note && (
        <div className="ft-note">
          <InfoCircleFilled />
          <span>{type.note[lang]}</span>
        </div>
      )}
    </div>
  );
}

export default function Formats() {
  const { lang } = useT();
  const [active, setActive] = useState(TYPES[0].id);
  const type = TYPES.find((x) => x.id === active) ?? TYPES[0];
  return (
    <div className="ft-wrap">
      <div className="ft-tabs" role="tablist">
        {TYPES.map((tp) => (
          <button key={tp.id} type="button" role="tab" aria-selected={tp.id === active} className={`ft-tab${tp.id === active ? " on" : ""}`} onClick={() => setActive(tp.id)}>
            {TYPE_ICON[tp.id]}
            <span>{tp.name[lang]}</span>
          </button>
        ))}
      </div>
      <Panel type={type} key={type.id} />
    </div>
  );
}
