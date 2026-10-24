import { MAX_FILES, MAX_FILE_BYTES } from "./engine/limits";
import { ScanError } from "./engine/types";
import type { ScanErrorCode } from "./engine/types";

const OK_TYPES = new Set(["image/jpeg", "image/png"]);
const OK_EXT = /\.(jpe?g|png)$/i;

/** Null when the file can be processed, otherwise the reason. */
export function checkFile(file: { name: string; type: string; size: number }): ScanErrorCode | null {
  if (!OK_TYPES.has(file.type) && !(file.type === "" && OK_EXT.test(file.name))) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > MAX_FILE_BYTES) return "size";
  return null;
}

export interface Intake<T> {
  accepted: T[];
  rejected: { file: T; code: ScanErrorCode }[];
  /** Files left out because the batch would exceed MAX_FILES. */
  overflow: T[];
}

/** Splits dropped files into the ones to process and the ones to refuse, keeping at most `room` of the former. */
export function intake<T extends { name: string; type: string; size: number }>(files: T[], room = MAX_FILES): Intake<T> {
  const accepted: T[] = [];
  const rejected: { file: T; code: ScanErrorCode }[] = [];
  const overflow: T[] = [];
  for (const file of files) {
    const code = checkFile(file);
    if (code) rejected.push({ file, code });
    else if (accepted.length >= room) overflow.push(file);
    else accepted.push(file);
  }
  return { accepted, rejected, overflow };
}

export const errorCode = (e: unknown): ScanErrorCode => (e instanceof ScanError ? e.code : "internal");
