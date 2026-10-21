import { useT } from "./lang";

const VN = (
  <svg width="26" height="18" viewBox="0 0 24 16" aria-hidden="true">
    <rect width="24" height="16" rx="2.5" fill="#da251d" />
    <polygon fill="#ffde00" points="12,4.2 12.97,7.17 16.09,7.17 13.57,9.01 14.53,11.98 12,10.15 9.47,11.98 10.43,9.01 7.91,7.17 11.03,7.17" />
  </svg>
);

const UK = (
  <svg width="26" height="18" viewBox="0 0 60 40" aria-hidden="true">
    <clipPath id="uk-clip"><rect width="60" height="40" rx="5" /></clipPath>
    <g clipPath="url(#uk-clip)">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0L60 40M60 0L0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0L60 40M60 0L0 40" stroke="#c8102e" strokeWidth="3" />
      <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0v40M0 20h60" stroke="#c8102e" strokeWidth="8" />
    </g>
  </svg>
);

/** Two flags; the one in use is highlighted. */
export default function LangSwitch() {
  const { lang, setLang } = useT();
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button type="button" className={lang === "vi" ? "on" : ""} onClick={() => setLang("vi")} aria-label="Tiếng Việt" aria-pressed={lang === "vi"} title="Tiếng Việt">{VN}</button>
      <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")} aria-label="English" aria-pressed={lang === "en"} title="English">{UK}</button>
    </div>
  );
}
