import type { ReactNode } from "react";
import { Alert, Statistic, Tabs } from "antd";
import { AI, FORMAT, MODE_INFO, TOOLS, TYPES, targetsFor } from "./data";
import type { FType, ModeKey } from "./data";
import { FileBadge, Icon } from "./appicons";
import { useT } from "./lang";

const Chip = ({ icon, children, sub }: { icon: ReactNode; children: ReactNode; sub?: string }) => (
  <span className="chip">
    {icon}
    <span>{children}</span>
    {sub && <em>{sub}</em>}
  </span>
);

function Row({ mode, label, children }: { mode?: ModeKey; label?: string; children: ReactNode }) {
  const { lang } = useT();
  return (
    <div className="frow">
      <div className="frow-label">
        <b>{mode ? MODE_INFO[mode].label[lang] : label}</b>
        {mode && <kbd>{MODE_INFO[mode].keys}</kbd>}
      </div>
      <div className="frow-body">{children}</div>
    </div>
  );
}

function Panel({ type }: { type: FType }) {
  const { lang, t } = useT();
  return (
    <div className="fpanel">
      <div className="fpanel-head">
        <FileBadge ext={type.example.ext} size={44} />
        <div>
          <b className="fpanel-title">{type.name[lang]}</b>
          <div className="muted">{t(`Kéo một file .${type.example.ext} vào bánh xe, bạn sẽ thấy:`, `Drag a .${type.example.ext} file onto the wheel and you will see:`)}</div>
        </div>
      </div>

      <Row label={t("Đọc được", "Opens")}>
        {type.inputs.map((i) => <span key={i} className="fmt">{i}</span>)}
      </Row>
      <Row mode="convert">
        {targetsFor(type).map((e) => <Chip key={e} icon={<FileBadge ext={e} size={20} />}>{FORMAT[e][lang]}</Chip>)}
      </Row>
      {type.tools.length > 0 && (
        <Row mode="tools">
          {type.tools.map((k) => <Chip key={k} icon={<Icon name={TOOLS[k].icon} size={20} />}>{TOOLS[k].label[lang]}</Chip>)}
        </Row>
      )}
      {type.multi && (
        <Row label={t("Nhiều file", "Several files")}>
          <span className="muted-body">{t("Chọn nhiều file rồi ", "Select several and ")}{type.multi[lang]}.</span>
        </Row>
      )}
      {type.share.length > 0 && (
        <Row mode="share">
          {type.share.map((g) => <Chip key={g.label.vi} icon={<Icon name={g.icon} size={20} />} sub={g.sub}>{g.label[lang]}</Chip>)}
        </Row>
      )}
      {type.ai.length > 0 && (
        <Row mode="ai">
          {type.ai.map((k) => <Chip key={k} icon={<Icon name={AI[k].icon} size={20} />}>{AI[k].label[lang]}</Chip>)}
        </Row>
      )}
      {type.note && <Alert type="info" showIcon message={type.note[lang]} style={{ marginTop: 16 }} />}
    </div>
  );
}

export default function Formats() {
  const { lang, t } = useT();
  return (
    <>
      <div className="stats">
        <Statistic value="60+" title={t("định dạng đọc được", "formats it opens")} />
        <Statistic value="5" title={t("chế độ bánh xe", "wheel modes")} />
        <Statistic value="17" title={t("mục tiêu nén sẵn", "ready-made size targets")} />
        <Statistic value="5" title={t("công cụ AI chạy offline", "offline AI tools")} />
      </div>
      <Tabs centered size="large" items={TYPES.map((tp) => ({ key: tp.id, label: tp.name[lang], children: <Panel type={tp} /> }))} destroyOnHidden />
    </>
  );
}
