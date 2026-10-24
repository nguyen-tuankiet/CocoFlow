// "What's new" window of the new-version banner: the changes of every release newer than the installed one, in the
// user's language, with Download and Skip.

import { getLang, t } from "./i18n";
import { download, noteLines, skipUpdate, type Update } from "./update";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Escapes a line and turns **bold** into <strong> and `name` into <code>. */
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

const day = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(getLang() === "vi" ? "vi-VN" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export function showUpdateNotes(u: Update) {
  document.querySelector(".modal.update-notes")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal update-notes";
  const sections = u.notes
    .map((n) => {
      const lines = noteLines(n.body);
      const items = lines.length
        ? `<ul>${lines.map((l) => (l.heading ? `</ul><h5>${inline(l.text)}</h5><ul>` : `<li>${inline(l.text)}</li>`)).join("")}</ul>`.replace(/<ul><\/ul>/g, "")
        : `<p class="ed-note">${esc(t("update.noNotes"))}</p>`;
      const when = day(n.date);
      return `<section><h4>Cocoflow ${esc(n.version)}${when ? ` <small>${esc(when)}</small>` : ""}</h4>${items}</section>`;
    })
    .join("");
  overlay.innerHTML = `
    <div class="dialog notes-dialog" role="dialog" aria-modal="true" aria-label="${esc(t("update.notesTitle", { v: u.version }))}">
      <header><h3>${esc(t("update.notesTitle", { v: u.version }))}</h3><button class="x" aria-label="${esc(t("update.close"))}">✕</button></header>
      <div class="ed-body notes-body">${sections || `<p class="ed-note">${esc(t("update.noNotes"))}</p>`}</div>
      <footer>
        <button class="ghost skip">${esc(t("update.skip"))}</button>
        <span class="grow"></span>
        <button class="ghost close">${esc(t("update.close"))}</button>
        <button class="primary get">${esc(t("update.get"))}</button>
      </footer>
    </div>`;
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => e.target === overlay && close());
  overlay.querySelector(".x")!.addEventListener("click", close);
  overlay.querySelector(".close")!.addEventListener("click", close);
  overlay.querySelector(".get")!.addEventListener("click", () => {
    download(u);
    close();
  });
  overlay.querySelector(".skip")!.addEventListener("click", () => {
    skipUpdate(u);
    close();
  });
  document.body.appendChild(overlay);
  overlay.querySelector<HTMLButtonElement>(".get")!.focus();
}
