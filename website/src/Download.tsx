import { Button } from "antd";
import { DownloadOutlined, FileZipOutlined, FilePptOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { useT } from "./lang";
import { FileKey, RELEASE, urlOf } from "./release";

export const Logo = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="18" r="11" fill="#ff8a1f" />
    <circle cx="12" cy="14" r="3" fill="#ffb25c" opacity=".8" />
    <path d="M16 8c0-3 2-5 5-5 0 3-2 5-5 5z" fill="#37b24d" />
  </svg>
);

export default function Download() {
  const { t } = useT();
  const f = RELEASE.files;

  const steps: ReactNode[] = [
    t(<>Chạy file <b>.exe</b> vừa tải. Nếu Windows cảnh báo, chọn <b>Thông tin thêm</b> rồi <b>Vẫn chạy</b>.</>, <>Run the downloaded <b>.exe</b>. If Windows warns you, choose <b>More info</b> then <b>Run anyway</b>.</>),
    t(<>Tìm quả cam nhỏ ở <b>khay hệ thống</b>, cạnh đồng hồ. Thấy nó là Tangelo đã sẵn sàng.</>, <>Look for the little orange in the <b>system tray</b>, next to the clock. If it is there, Tangelo is ready.</>),
    t(<>Kéo một file bất kỳ rồi nhấn <kbd>Shift</kbd> để mở bánh xe.</>, <>Drag any file and press <kbd>Shift</kbd> to open the wheel.</>),
  ];

  const extras: [FileKey, string, string, ReactNode][] = [
    ["portable", t("Bản portable", "Portable"), t("Giải nén là chạy, không cần cài. Hợp để mang theo USB.", "Unzip and run, no installer. Handy for a USB stick."), <FileZipOutlined />],
    ["office", t("Gói LibreOffice", "LibreOffice add-on"), t("Đổi slide PowerPoint sang PDF/ảnh, và PDF sang PowerPoint.", "PowerPoint slides to PDF/images, and PDF to PowerPoint."), <FilePptOutlined />],
  ];

  return (
    <div className="container dl">
      <div className="section-head">
        <div className="eyebrow">{t("Tải về", "Download")}</div>
        <h2 className="dl-title">{t("Cài Tangelo trong một phút", "Install Tangelo in a minute")}</h2>
        <p className="dl-lead">{t("Một bộ cài duy nhất, không cần tài khoản và không có quảng cáo.", "One installer, no account and no ads.")}</p>
      </div>

      <div className="dl-card">
        <div className="dl-main">
          <div className="dl-app">
            <Logo size={52} />
            <div>
              <b>Tangelo {t("cho Windows", "for Windows")}</b>
              <span>v{RELEASE.version} · {f.setup.size}</span>
            </div>
          </div>
          <Button type="primary" size="large" block className="dl-btn" icon={<DownloadOutlined />} href={urlOf("setup")}>
            {t("Tải bộ cài (.exe)", "Download installer (.exe)")}
          </Button>
          <ul className="dl-facts">
            <li>{t("Windows 10 hoặc 11, 64-bit", "Windows 10 or 11, 64-bit")}</li>
            <li>{t("Cài riêng cho tài khoản của bạn, không cần quyền quản trị", "Installs for your own account, no admin rights needed")}</li>
            <li>{t("WebView2 có sẵn trên Windows 11, bộ cài tự tải nếu máy thiếu", "WebView2 is built into Windows 11; the installer fetches it if missing")}</li>
          </ul>
        </div>

        <div className="dl-timeline">
          <div className="dl-tl-title">{t("Ba bước đầu tiên", "Your first three steps")}</div>
          <ol>
            {steps.map((s, i) => (
              <li key={i}><span className="dot">{i + 1}</span><div>{s}</div></li>
            ))}
          </ol>
        </div>
      </div>

      <div className="dl-more-head">
        <b>{t("Tải thêm (tùy chọn)", "More downloads (optional)")}</b>
        <span>{t("AI offline đã có sẵn trong bộ cài. Gói LibreOffice: giải nén rồi chép thư mục bin vào thư mục của Tangelo.", "Offline AI is already inside the installer. LibreOffice add-on: unzip it and copy its bin folder into the Tangelo folder.")}</span>
      </div>
      <div className="dl-extras">
        {extras.map(([k, title, body, icon]) => (
          <div key={k} className="dl-extra">
            <div className="dl-extra-icon">{icon}</div>
            <div className="dl-extra-body">
              <div><b>{title}</b> <span className="dl-size">{f[k].size}</span></div>
              <p>{body}</p>
            </div>
            <Button icon={<DownloadOutlined />} href={urlOf(k)} aria-label={`${title} (.zip)`}>.zip</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
