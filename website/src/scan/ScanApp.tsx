import {
  CheckCircleFilled,
  CloseCircleFilled,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileZipOutlined,
  InboxOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
} from "@ant-design/icons";
import { Button, Progress, Segmented, Tooltip, message } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import LangSwitch from "../LangSwitch";
import { useT } from "../lang";
import CornerEditor from "./CornerEditor";
import { MAX_FILES, MAX_FILE_BYTES } from "./engine/limits";
import type { Look, Paper, ScanErrorCode } from "./engine/types";
import { useScanner } from "./useScanner";
import type { Item, Notice } from "./useScanner";
import { resultName } from "./zip";

const mb = (n: number) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;

function save(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function ScanApp() {
  const { t } = useT();
  const [msg, msgHolder] = message.useMessage();
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null);

  const reason = (code: ScanErrorCode): string =>
    ({
      type: t("không phải ảnh JPG hoặc PNG", "not a JPG or PNG image"),
      empty: t("tệp rỗng", "the file is empty"),
      size: t(`lớn hơn ${mb(MAX_FILE_BYTES)}`, `larger than ${mb(MAX_FILE_BYTES)}`),
      pixels: t("ảnh quá lớn (trên 60 megapixel)", "the photo is too large (over 60 megapixels)"),
      decode: t("không đọc được ảnh, tệp có thể bị hỏng", "the image cannot be read, the file may be damaged"),
      quad: t("bốn góc không hợp lệ", "the four corners are not valid"),
      internal: t("lỗi không xác định khi xử lý", "an unexpected error while processing"),
    })[code];

  const onNotice = useCallback(
    (n: Notice) => {
      const lines = n.rejected.slice(0, 4).map((r) => `${r.name}: ${reason(r.code)}`);
      if (n.rejected.length > 4) lines.push(t(`… và ${n.rejected.length - 4} tệp khác`, `… and ${n.rejected.length - 4} more`));
      if (n.overflow) lines.push(t(`${n.overflow} ảnh bị bỏ qua vì tối đa ${MAX_FILES} ảnh mỗi lần`, `${n.overflow} skipped: at most ${MAX_FILES} photos at a time`));
      msg.open({ type: "warning", duration: 7, content: <div className="sc-toast">{lines.map((l, i) => <div key={i}>{l}</div>)}</div> });
    },
    [msg, t], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sc = useScanner(onNotice);
  const { items } = sc;

  const take = (files: FileList | File[] | null) => {
    if (files && files.length) sc.add(Array.from(files));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files);
  };

  // paste a screenshot or a copied photo
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) sc.add(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [sc.add]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;
  const finished = done + failed;
  const editItem = items.find((i) => i.id === editing);

  const zip = async () => {
    setZipping(true);
    try {
      const blob = await sc.downloadZip();
      const url = URL.createObjectURL(blob);
      save(url, "cocoflow-scan.zip");
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch {
      msg.error(t("Không tạo được tệp ZIP.", "Could not create the ZIP file."));
    } finally {
      setZipping(false);
    }
  };

  const stepText = (it: Item) =>
    it.status === "queued"
      ? t("Đang chờ…", "Waiting…")
      : it.step === "load"
        ? t("Đang đọc ảnh…", "Reading the photo…")
        : it.step === "analyze"
          ? t("Đang tìm trang giấy…", "Finding the page…")
          : t("Đang căn thẳng…", "Straightening…");

  const methodText = (it: Item) =>
    it.method === "both"
      ? t("Đã căn theo chữ và mép giấy", "Aligned to the text and the paper")
      : it.method === "edges"
        ? t("Đã nhận ra mép giấy", "Page edges found")
        : it.method === "text"
        ? t("Căn theo dòng chữ", "Aligned to the text")
        : it.method === "none"
          ? t("Chưa nhận ra trang: hãy chỉnh bốn góc", "Page not found: adjust the corners")
          : "";

  return (
    <div className="sc-page">
      {msgHolder}
      <header className="sc-top">
        <a className="sc-brand" href="./" aria-label="Cocoflow">
          <img src="./logo.png" width={28} height={28} alt="" />
          Cocoflow
        </a>
        <div className="sc-top-right">
          <a className="sc-home" href="./">{t("Trang chủ", "Home")}</a>
          <LangSwitch />
        </div>
      </header>

      <main className="sc-main">
        <h1>{t("Làm thẳng ảnh tài liệu", "Straighten document photos")}</h1>
        <p className="sc-lead">
          {t(
            "Kéo ảnh chụp giấy tờ bị nghiêng hoặc méo vào đây, Cocoflow căn lại thành trang vuông vức. Mọi thứ chạy ngay trong trình duyệt của bạn: ảnh không được tải lên đâu cả.",
            "Drop photos of tilted or skewed paper here and Cocoflow turns them into square pages. Everything runs in your browser: your photos are never uploaded.",
          )}
        </p>

        <label
          className={`sc-drop${dragging ? " over" : ""}`}
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            multiple
            onChange={(e) => {
              take(e.target.files);
              e.target.value = "";
            }}
          />
          <InboxOutlined className="sc-drop-icon" />
          <b>{t("Kéo thả ảnh vào đây hoặc bấm để chọn", "Drag photos here or click to choose")}</b>
          <span className="sc-hint">{t(`JPG, JPEG, PNG · tối đa ${MAX_FILES} ảnh, mỗi ảnh ${mb(MAX_FILE_BYTES)} · có thể dán ảnh bằng Ctrl+V`, `JPG, JPEG, PNG · up to ${MAX_FILES} photos, ${mb(MAX_FILE_BYTES)} each · you can paste with Ctrl+V`)}</span>
        </label>

        <div className="sc-options">
          <div>
            <span className="sc-opt-label">{t("Kiểu", "Look")}</span>
            <Segmented
              value={sc.settings.look}
              onChange={(v) => sc.setSettings({ look: v as Look })}
              options={[
                { label: t("Giấy trắng", "White paper"), value: "white" },
                { label: t("Giữ màu gốc", "Original colours"), value: "color" },
                { label: t("Trang sạch (xám)", "Clean page (grey)"), value: "clean" },
              ]}
            />
          </div>
          <div>
            <span className="sc-opt-label">{t("Khổ giấy", "Paper")}</span>
            <Segmented
              value={sc.settings.paper}
              onChange={(v) => sc.setSettings({ paper: v as Paper })}
              options={[
                { label: t("Tự động", "Automatic"), value: "auto" },
                { label: t("Theo ảnh", "As photographed"), value: "photo" },
                { label: t("A4 dọc", "A4 portrait"), value: "a4p" },
                { label: t("A4 ngang", "A4 landscape"), value: "a4l" },
              ]}
            />
          </div>
        </div>

        {items.length > 0 && (
          <section className="sc-summary" aria-live="polite">
            <div className="sc-sum-text">
              <b>{t(`${finished}/${items.length} ảnh đã xử lý`, `${finished}/${items.length} photos processed`)}</b>
              {failed > 0 && <span className="sc-bad"> · {t(`${failed} lỗi`, `${failed} failed`)}</span>}
            </div>
            <Progress percent={Math.round((finished / items.length) * 100)} showInfo={false} size="small" status={finished < items.length ? "active" : failed === items.length ? "exception" : "success"} />
            <div className="sc-actions">
              <Button type="primary" icon={<FileZipOutlined />} loading={zipping} disabled={done === 0} onClick={zip}>
                {t("Tải tất cả (ZIP)", "Download all (ZIP)")}
              </Button>
              {failed > 0 && (
                <Button icon={<ReloadOutlined />} onClick={sc.retryFailed}>
                  {t("Thử lại các ảnh lỗi", "Retry failed")}
                </Button>
              )}
              <Button icon={<DeleteOutlined />} onClick={sc.clear}>
                {t("Xóa tất cả", "Clear all")}
              </Button>
            </div>
          </section>
        )}

        <section className="sc-grid">
          {items.map((it) => {
            const busy = it.status === "queued" || it.status === "working";
            const original = showOriginal[it.id];
            const shown = original || !it.result ? it.srcUrl : it.result.url;
            return (
              <article className={`sc-card ${it.status}`} key={it.id}>
                <div className="sc-thumb">
                  {it.status !== "error" && <img src={shown} alt={it.name} />}
                  {busy && (
                    <div className="sc-over">
                      <LoadingOutlined />
                      <span>{stepText(it)}</span>
                      <Progress percent={Math.round(it.progress * 100)} showInfo={false} size="small" />
                    </div>
                  )}
                  {it.status === "error" && (
                    <div className="sc-over err">
                      <CloseCircleFilled />
                      <span>{reason(it.error ?? "internal")}</span>
                    </div>
                  )}
                </div>
                <div className="sc-meta">
                  <div className="sc-name" title={it.name}>{it.name}</div>
                  <div className="sc-sub">
                    {it.status === "done" && it.result ? (
                      <>
                        <CheckCircleFilled className="sc-ok" /> {it.result.width} × {it.result.height} px · {methodText(it)}
                      </>
                    ) : it.status === "error" ? (
                      <span className="sc-bad">{t("Lỗi", "Error")}</span>
                    ) : (
                      mb(it.size)
                    )}
                  </div>
                </div>
                {it.result && (
                  <Segmented
                    size="small"
                    block
                    value={original ? "o" : "r"}
                    onChange={(v) => setShowOriginal((s) => ({ ...s, [it.id]: v === "o" }))}
                    options={[
                      { label: t("Kết quả", "Result"), value: "r" },
                      { label: t("Ảnh gốc", "Original"), value: "o" },
                    ]}
                  />
                )}
                <div className="sc-card-actions">
                  {it.status === "error" ? (
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => sc.retry(it.id)}>
                      {t("Thử lại", "Retry")}
                    </Button>
                  ) : (
                    <>
                      <Tooltip title={t("Chỉnh bốn góc", "Adjust the corners")}>
                        <Button size="small" icon={<EditOutlined />} disabled={!it.result} onClick={() => setEditing(it.id)} />
                      </Tooltip>
                      <Tooltip title={t("Xử lý lại tự động", "Process again automatically")}>
                        <Button size="small" icon={<ReloadOutlined />} disabled={busy} onClick={() => sc.redetect(it.id)} />
                      </Tooltip>
                      <Tooltip title={t("Xoay trái", "Rotate left")}>
                        <Button size="small" icon={<RotateLeftOutlined />} disabled={!it.result || busy} onClick={() => sc.rotate(it.id, -1)} />
                      </Tooltip>
                      <Tooltip title={t("Xoay phải", "Rotate right")}>
                        <Button size="small" icon={<RotateRightOutlined />} disabled={!it.result || busy} onClick={() => sc.rotate(it.id, 1)} />
                      </Tooltip>
                      <Button
                        size="small"
                        type="primary"
                        icon={<DownloadOutlined />}
                        disabled={!it.result}
                        onClick={() => it.result && save(it.result.url, resultName(it.name, it.result.ext))}
                      >
                        {t("Tải", "Save")}
                      </Button>
                    </>
                  )}
                  <Tooltip title={t("Xóa", "Remove")}>
                    <Button size="small" icon={<DeleteOutlined />} onClick={() => sc.remove(it.id)} />
                  </Tooltip>
                </div>
              </article>
            );
          })}
        </section>

        {items.length === 0 && (
          <ul className="sc-tips">
            <li>{t("Chụp thẳng từ trên xuống, đủ sáng, thấy rõ bốn góc tờ giấy càng tốt.", "Shoot from above in good light, with all four corners of the paper in view if you can.")}</li>
            <li>{t("Ảnh không thấy mép giấy vẫn căn được theo các dòng chữ.", "Photos without visible paper edges are aligned to the lines of text.")}</li>
            <li>{t("Nhận diện sai? Bấm nút bút chì để kéo bốn góc bằng tay.", "Detection off? Use the pencil button to drag the four corners yourself.")}</li>
          </ul>
        )}
      </main>

      {editItem && editItem.result && (
        <CornerEditor
          key={editItem.id}
          item={editItem}
          engine={sc.engine()}
          settings={sc.settings}
          onClose={() => setEditing(null)}
          onApply={(quad, turns) => {
            sc.adjust(editItem.id, quad, turns);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
