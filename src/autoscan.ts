// "Scan document" without a dialog: find the page in each photo (the text lines decide the direction, the paper edges
// where to cut), straighten it with the shared engine and save it next to the photo. Photos where no page is found are
// reported with a Windows notification and can be done by hand with "Scan (adjust corners)".

import { notifyText } from "./api";
import { t } from "./i18n";
import { analyze } from "../website/src/scan/engine/pipeline";
import { fromSmall, loadPhoto, renderAndSave, textFromSmall } from "./scanrender";

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

async function scanOne(path: string): Promise<void> {
  const photo = await loadPhoto(path);
  const found = analyze(photo.small);
  if (found.method === "none") {
    await notifyText("Cocoflow", t("scan.nopage", { name: baseName(path) }));
    return;
  }
  await renderAndSave(path, photo, {
    quad: fromSmall(photo, found.quad),
    text: textFromSmall(photo, found.text),
    look: "white",
    paper: "auto",
  });
}

export async function autoScan(paths: string[]): Promise<void> {
  for (const path of paths) {
    try {
      await scanOne(path);
    } catch (e) {
      await notifyText("Cocoflow", t("scan.failed", { name: baseName(path), why: String(e) })).catch(() => {});
    }
  }
}
