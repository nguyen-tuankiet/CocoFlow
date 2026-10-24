import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type Lang = "vi" | "en";

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: "vi", setLang: () => {} });

function initial(): Lang {
  try {
    const saved = localStorage.getItem("cocoflow-lang");
    if (saved === "vi" || saved === "en") return saved;
  } catch {
    /* storage can be blocked */
  }
  return (navigator.language || "vi").toLowerCase().startsWith("vi") ? "vi" : "en";
}

/** `title` overrides the default page title (used by pages other than the home page). */
export function LangProvider({ children, title }: { children: ReactNode; title?: { vi: string; en: string } }) {
  const [lang, setLangState] = useState<Lang>(initial);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = title ? title[lang] : lang === "vi" ? "Cocoflow – Thao tác chuyển đổi file trong tích tắc" : "Cocoflow – File conversion in a flash";
  }, [lang, title]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("cocoflow-lang", l);
    } catch {
      /* ignore */
    }
  };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

/** `const { t } = useT(); t("Tiếng Việt", "English")` */
export function useT() {
  const { lang, setLang } = useContext(LangContext);
  const t = <A, B = A>(vi: A, en: B): A | B => (lang === "vi" ? vi : en);
  return { lang, setLang, t };
}
