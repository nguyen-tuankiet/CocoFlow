import { zipSync } from "fflate";

/** "page.jpg" → "page_scan.jpg"; names that repeat get " (2)", " (3)"… so nothing is overwritten inside a ZIP. */
export function resultName(original: string, ext: string, taken: Set<string> = new Set()): string {
  const stem = original.replace(/\.[^.\\/]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").trim() || "scan";
  let name = `${stem}_scan.${ext}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem}_scan (${n}).${ext}`;
  taken.add(name.toLowerCase());
  return name;
}

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/** One ZIP with all the results. JPEG and PNG are already compressed, so the entries are stored as they are. */
export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  if (!entries.length) throw new Error("nothing to zip");
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) files[e.name] = new Uint8Array(await e.blob.arrayBuffer());
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}
