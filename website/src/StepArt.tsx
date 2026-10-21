import { CheckCircleFilled } from "@ant-design/icons";
import { FileBadge } from "./appicons";
import { MODE_INFO } from "./data";
import { useT } from "./lang";

/** Step 1: a few files, one of them being dragged. */
export function StepFiles() {
  return (
    <div className="sa sa-files" aria-hidden="true">
      <span className="sa-file f1"><FileBadge ext="pdf" size={46} /></span>
      <span className="sa-file f2"><FileBadge ext="mp4" size={46} /></span>
      <span className="sa-file f3"><FileBadge ext="png" size={46} /></span>
      <svg className="sa-cursor" width="22" height="26" viewBox="0 0 22 26">
        <path d="M2 1.5v19l5.2-4.6 3.4 7.6 3.1-1.4-3.4-7.4H18z" fill="#111827" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Step 2: the mode bar of the wheel. */
export function StepModes() {
  const { lang } = useT();
  const modes = ["convert", "tools", "actions"] as const;
  return (
    <div className="sa sa-modes" aria-hidden="true">
      <div className="w-modes sa-bar">
        {modes.map((m, i) => (
          <span key={m} className={`w-pill${i === 0 ? " on" : ""}`}>
            {i === 0 && <b>{MODE_INFO[m].keys}</b>}
            {MODE_INFO[m].label[lang]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Step 3: original file next to the new one. */
export function StepResult() {
  return (
    <div className="sa sa-result" aria-hidden="true">
      <span className="sa-chip"><FileBadge ext="png" size={22} /> anh.png</span>
      <span className="sa-arrow">→</span>
      <span className="sa-chip out"><FileBadge ext="jpg" size={22} /> anh.jpg <CheckCircleFilled /></span>
    </div>
  );
}
