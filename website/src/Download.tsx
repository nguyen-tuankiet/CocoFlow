import { DownloadOutlined, SafetyOutlined, SettingOutlined, ThunderboltOutlined, WindowsFilled } from "@ant-design/icons";
import type { ReactNode } from "react";
import { FileBadge } from "./appicons";
import { useT } from "./lang";
import { useRelease } from "./release";

/** The Cocoflow wave (website/public/logo.png, made by scripts/make-icons.ps1). */
export const Logo = ({ size = 30 }: { size?: number }) => (
  <img src="./logo.png" width={size} height={size} alt="" aria-hidden="true" style={{ display: "block" }} />
);

export default function Download() {
  const { t } = useT();
  const rel = useRelease();

  const steps: { art: ReactNode; title: string; body: ReactNode }[] = [
    {
      art: <FileBadge ext="exe" size={30} />,
      title: t("Chạy file .exe vừa tải", "Run the downloaded .exe"),
      body: t(<>Nếu Windows cảnh báo, chọn <b>Thông tin thêm</b> rồi <b>Vẫn chạy</b>.</>, <>If Windows warns you, choose <b>More info</b> then <b>Run anyway</b>.</>),
    },
    {
      art: <SettingOutlined />,
      title: t("Đợi cài đặt hoàn tất", "Wait for the install to finish"),
      body: t("Quá trình diễn ra trong vài giây, không cần thao tác phức tạp.", "It takes a few seconds and needs nothing complicated."),
    },
    {
      art: <kbd className="dl-key">Shift</kbd>,
      title: t("Mở Cocoflow bằng Shift", "Open Cocoflow with Shift"),
      body: t(<>Kéo một file bất kỳ rồi nhấn <kbd>Shift</kbd> để mở nhanh.</>, <>Drag any file and press <kbd>Shift</kbd> to open it right away.</>),
    },
  ];

  const facts: { icon: ReactNode; text: string }[] = [
    { icon: <WindowsFilled />, text: t("Windows 10 hoặc 11, 64-bit", "Windows 10 or 11, 64-bit") },
    { icon: <SafetyOutlined />, text: t("Cài riêng cho tài khoản của bạn, không cần quyền quản trị", "Installs for your own account, no admin rights needed") },
    { icon: <ThunderboltOutlined />, text: t("WebView2 có sẵn trên Windows 11, bộ cài tự tải nếu máy thiếu", "WebView2 is built into Windows 11; the installer fetches it if missing") },
  ];

  return (
    <div className="container dl">
      <div className="dl-head">
        <span className="dl-pill">{t("Tải về", "Download")}</span>
        <h2>{t(<>Cài Cocoflow trong <span>một phút</span></>, <>Install Cocoflow in <span>a minute</span></>)}</h2>
        <p>{t("Chọn bản tiêu chuẩn là đủ cho hầu hết mọi người. Không cần tài khoản, không có quảng cáo.", "The standard build is enough for most people. No account, no ads.")}</p>
      </div>

      <div className="dl-card">
        <div className="dl-main">
          <div className="dl-app">
            <Logo size={64} />
            <div>
              <b>Cocoflow {t("cho Windows", "for Windows")}</b>
              <span>v{rel.version}</span>
            </div>
          </div>

          <div className="dl-choices">
            <a className="dl-choice primary" href={rel.setup.url}>
              <span className="dl-choice-icon"><WindowsFilled /></span>
              <span className="dl-choice-text">
                <b>{t("Bản tiêu chuẩn", "Standard")} <em>{rel.setup.size}</em></b>
                <small>{t("Chuyển đổi, nén, cắt, chỉnh sửa và AI offline", "Convert, compress, trim, edit and offline AI")}</small>
              </span>
              <DownloadOutlined className="dl-choice-dl" />
            </a>
            <a className="dl-choice" href={rel.full.url}>
              <span className="dl-choice-icon"><WindowsFilled /></span>
              <span className="dl-choice-text">
                <b>{t("Bản đầy đủ", "Full")} <em>{rel.full.size}</em></b>
                <small>{t("Thêm đổi slide PowerPoint và PDF sang PowerPoint (đã có sẵn LibreOffice)", "Adds PowerPoint slide and PDF-to-PowerPoint conversion (LibreOffice included)")}</small>
              </span>
              <DownloadOutlined className="dl-choice-dl" />
            </a>
          </div>

          <ul className="dl-facts">
            {facts.map((x, i) => (
              <li key={i}><span className="dl-fact-icon">{x.icon}</span>{x.text}</li>
            ))}
          </ul>
        </div>

        <div className="dl-steps">
          <span className="dl-steps-pill"><SettingOutlined /> {t("Ba bước đơn giản", "Three simple steps")}</span>
          <ol>
            {steps.map((s, i) => (
              <li key={i}>
                <span className="dl-no">{i + 1}</span>
                <span className="dl-step-art">{s.art}</span>
                <div className="dl-step-text">
                  <b>{s.title}</b>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
