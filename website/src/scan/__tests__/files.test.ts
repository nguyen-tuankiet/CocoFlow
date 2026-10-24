import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MAX_FILES, MAX_FILE_BYTES } from "../engine/limits";
import { ScanError } from "../engine/types";
import { checkFile, errorCode, intake } from "../validate";
import { buildZip, resultName } from "../zip";

const file = (name: string, type: string, size: number) => ({ name, type, size });

describe("choosing files", () => {
  it("accepts JPG, JPEG and PNG", () => {
    expect(checkFile(file("a.jpg", "image/jpeg", 10))).toBeNull();
    expect(checkFile(file("a.jpeg", "image/jpeg", 10))).toBeNull();
    expect(checkFile(file("a.png", "image/png", 10))).toBeNull();
    expect(checkFile(file("A.JPG", "", 10))).toBeNull(); // some systems give no MIME type
  });

  it("refuses other types, empty files and files that are too big", () => {
    expect(checkFile(file("a.gif", "image/gif", 10))).toBe("type");
    expect(checkFile(file("a.pdf", "application/pdf", 10))).toBe("type");
    expect(checkFile(file("notes.txt", "", 10))).toBe("type");
    expect(checkFile(file("a.png", "image/png", 0))).toBe("empty");
    expect(checkFile(file("a.png", "image/png", MAX_FILE_BYTES + 1))).toBe("size");
    expect(checkFile(file("a.png", "image/png", MAX_FILE_BYTES))).toBeNull();
  });

  it("splits a drop into accepted, rejected and overflow", () => {
    const files = [file("1.jpg", "image/jpeg", 5), file("x.gif", "image/gif", 5), file("2.png", "image/png", 5), file("3.png", "image/png", 5)];
    const r = intake(files, 2);
    expect(r.accepted.map((f) => f.name)).toEqual(["1.jpg", "2.png"]);
    expect(r.rejected.map((x) => [x.file.name, x.code])).toEqual([["x.gif", "type"]]);
    expect(r.overflow.map((f) => f.name)).toEqual(["3.png"]);
    const many = Array.from({ length: MAX_FILES + 5 }, (_, i) => file(`${i}.jpg`, "image/jpeg", 5));
    expect(intake(many).accepted).toHaveLength(MAX_FILES);
    expect(intake(many).overflow).toHaveLength(5);
  });

  it("maps errors to codes", () => {
    expect(errorCode(new ScanError("decode"))).toBe("decode");
    expect(errorCode(new Error("boom"))).toBe("internal");
  });
});

describe("export", () => {
  it("names results and keeps names unique", () => {
    const taken = new Set<string>();
    expect(resultName("page.jpg", "jpg", taken)).toBe("page_scan.jpg");
    expect(resultName("page.png", "jpg", taken)).toBe("page_scan (2).jpg");
    expect(resultName("PAGE.jpeg", "jpg", taken)).toBe("PAGE_scan (3).jpg");
    expect(resultName("a/b:c.jpg", "png")).toBe("a_b_c_scan.png");
    expect(resultName("", "png")).toBe("scan_scan.png");
  });

  it("builds a ZIP that holds every result byte for byte", async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([9, 8, 7]);
    const zip = await buildZip([
      { name: "a_scan.jpg", blob: new Blob([a], { type: "image/jpeg" }) },
      { name: "b_scan.png", blob: new Blob([b], { type: "image/png" }) },
    ]);
    expect(zip.type).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["a_scan.jpg", "b_scan.png"]);
    expect(Array.from(files["a_scan.jpg"])).toEqual(Array.from(a));
    expect(Array.from(files["b_scan.png"])).toEqual(Array.from(b));
  });

  it("refuses to build an empty ZIP", async () => {
    await expect(buildZip([])).rejects.toThrow();
  });
});
