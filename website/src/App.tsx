import type { ReactNode } from "react";
import { Button, Card, Col, Collapse, Divider, Row, Space, Typography } from "antd";
import {
  AppstoreAddOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  HeartOutlined,
  LockOutlined,
  MergeCellsOutlined,
  PauseCircleOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  SnippetsOutlined,
  ThunderboltOutlined,
  TranslationOutlined,
  WindowsOutlined,
} from "@ant-design/icons";
import Demo from "./Demo";
import Download, { Logo } from "./Download";
import Formats from "./Formats";
import LangSwitch from "./LangSwitch";
import AppWindow, { TrimDialog } from "./AppWindow";
import { Feature, NewTag } from "./Showcase";
import { useT } from "./lang";
import { StepFiles, StepModes, StepResult } from "./StepArt";

const { Title, Paragraph, Text } = Typography;

const Head = ({ eyebrow, title, lead }: { eyebrow: ReactNode; title: ReactNode; lead?: ReactNode }) => (
  <div className="section-head">
    <div className="eyebrow">{eyebrow}</div>
    <Title level={2}>{title}</Title>
    {lead && <Paragraph type="secondary" style={{ fontSize: 17, maxWidth: 660, margin: "0 auto" }}>{lead}</Paragraph>}
  </div>
);

export default function App() {
  const { t } = useT();

  const steps = [
    { title: t("Chọn file", "Pick a file"), body: t("Kéo một hoặc nhiều file từ Explorer hay màn hình desktop.", "Drag one or more files from Explorer or the desktop."), art: <StepFiles /> },
    { title: t("Chọn chế độ", "Pick a mode"), body: t("Nhấn Shift, Ctrl hoặc Alt để mở bánh xe tương ứng.", "Press Shift, Ctrl or Alt to open the matching wheel."), art: <StepModes /> },
    { title: t("Nhận kết quả", "Get the result"), body: t("Thả vào một ô, file mới nằm ngay cạnh file gốc.", "Drop it on a slice and the new file lands beside the original."), art: <StepResult /> },
  ];
  const more = [
    { icon: <SnippetsOutlined />, isNew: true, title: t("Dán ảnh từ clipboard", "Paste from the clipboard"), body: t(<>Sao chép một ảnh (ví dụ WebP từ trình duyệt), bấm <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> rồi đổi sang PNG hay JPG.</>, <>Copy an image (say a WebP from your browser), press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> and turn it into PNG or JPG.</>) },
    { icon: <PauseCircleOutlined />, title: t("Tạm dừng và hủy từng việc", "Pause and cancel each job"), body: t("Nén video lâu quá? Tạm dừng, tiếp tục hoặc hủy bất cứ lúc nào. Việc bị hủy sẽ được dọn sạch file dang dở.", "Video taking forever? Pause, resume or cancel any time. A cancelled job cleans up its unfinished files.") },
    { icon: <MergeCellsOutlined />, title: t("Ghép nhiều file", "Merge several files"), body: t("Chọn nhiều file rồi ghép video, ghép âm thanh, gộp PDF hoặc gộp một loạt ảnh thành một file PDF.", "Select several files and join videos, join audio, merge PDFs or combine a batch of photos into one PDF.") },
    { icon: <ThunderboltOutlined />, title: t("Xử lý cả loạt file", "Whole batches at once"), body: t("Thả nhiều file vào cùng một ô, Cocoflow tự xếp hàng và gửi thông báo khi xong, không làm phiền từng file một.", "Drop many files on one slice. Cocoflow queues them and sends one notification when they are done.") },
    { icon: <AppstoreAddOutlined />, title: t("Kéo từ mọi ứng dụng", "Drag from any app"), body: t("Không chỉ Explorer: kéo từ màn hình desktop hay các ứng dụng khác đều mở được bánh xe. Có thể tắt nếu bạn chỉ cần Explorer.", "Not just Explorer: dragging from the desktop or other apps opens the wheel too. Switch it off if you only want Explorer.") },
    { icon: <TranslationOutlined />, title: t("Tiếng Việt và công cụ có sẵn", "Vietnamese and tools built in"), body: t("Giao diện tiếng Việt hoặc English. Bộ cài đã gồm ffmpeg, ImageMagick, Pandoc, Ghostscript và 7-Zip nên cài xong là dùng.", "English or Vietnamese interface. The installer already includes ffmpeg, ImageMagick, Pandoc, Ghostscript and 7-Zip, so it works right after install.") },
  ];

  const promises = [
    { icon: <LockOutlined />, title: t("File ở lại trên máy bạn", "Files stay on your PC"), body: t("Mọi thao tác chạy cục bộ, không cần tài khoản, dùng được cả khi mất mạng.", "Everything runs locally, no account needed, and it works offline.") },
    { icon: <FileDoneOutlined />, title: t("File gốc được giữ nguyên", "Originals are left alone"), body: t("Kết quả là file mới nằm cạnh file gốc, có hậu tố rõ ràng và không ghi đè.", "Results are new files beside the original, clearly named and never overwriting.") },
    { icon: <WindowsOutlined />, title: t("Nằm yên ở khay hệ thống", "Lives in the tray"), body: t("Không có cửa sổ chính phải quản lý. Bánh xe chỉ hiện ra đúng lúc bạn đang kéo file.", "No main window to manage. The wheel only appears while you are dragging a file.") },
  ];

  const faq = [
    { q: t("Cocoflow có miễn phí không?", "Is Cocoflow free?"), a: t("Có. Hiện tại Cocoflow hoàn toàn miễn phí, không quảng cáo và không cần tài khoản.", "Yes. Cocoflow is currently completely free, with no ads and no account.") },
    { q: t("File của tôi có bị tải lên máy chủ không?", "Are my files uploaded to a server?"), a: t("Không. Mọi thao tác chạy ngay trên máy bạn bằng các công cụ đi kèm, và Cocoflow không gửi file hay dữ liệu đi đâu.", "No. Everything runs on your PC with the bundled tools, and Cocoflow sends no files or data anywhere.") },
    { q: t("Những định dạng nào được hỗ trợ?", "Which formats are supported?"), a: t(<>Hơn 60 định dạng đầu vào: ảnh (PNG, JPG, WebP, HEIC, SVG…), video (MP4, MKV, MOV…), âm thanh (MP3, WAV, FLAC…), tài liệu (DOCX, Markdown, HTML, EPUB…), PDF, bảng tính, slide, file nén và phụ đề. Xem từng loại ở mục <a href="#features">Tính năng</a>. Riêng đổi slide PowerPoint và PDF sang PowerPoint cần bản đầy đủ.</>, <>More than 60 input formats: images (PNG, JPG, WebP, HEIC, SVG…), video (MP4, MKV, MOV…), audio (MP3, WAV, FLAC…), documents (DOCX, Markdown, HTML, EPUB…), PDF, spreadsheets, slides, archives and subtitles. See each kind in <a href="#features">Features</a>. Converting PowerPoint slides and PDF to PowerPoint needs the full build.</>) },
    { q: t("Có dùng được khi không có mạng không?", "Does it work offline?"), a: t("Có. Mọi chức năng, kể cả AI (OCR, phụ đề, xóa nền, phóng to ảnh), đều chạy offline. Bạn chỉ cần mạng khi tải bộ cài.", "Yes. Every feature, including AI (OCR, subtitles, background removal, upscaling), works offline. You only need internet to download the installer.") },
    { q: t("Có giới hạn dung lượng file không?", "Is there a file size limit?"), a: t("Cocoflow không đặt giới hạn nào. File lớn chỉ tốn nhiều thời gian và dung lượng ổ đĩa hơn. Riêng mục Chia sẻ sẽ báo nếu video quá dài để vừa mức giới hạn bạn chọn (ví dụ 25 MB).", "Cocoflow sets no limit. Large files simply take longer and need more disk space. Only the Share mode warns you when a video is too long to fit the limit you picked (for example 25 MB).") },
    { q: t("Cocoflow hỗ trợ Windows phiên bản nào?", "Which Windows versions are supported?"), a: t("Windows 10 và Windows 11, bản 64-bit. Cần WebView2: có sẵn trên Windows 11, và bộ cài tự tải nếu máy bạn chưa có.", "Windows 10 and Windows 11, 64-bit. It needs WebView2, which is built into Windows 11; the installer downloads it if your PC does not have it.") },
    { q: t("Windows báo “SmartScreen đã bảo vệ PC của bạn”, có an toàn không?", "Windows says “protected your PC”. Is it safe?"), a: t(<>Cảnh báo này xuất hiện vì bộ cài chưa được ký số, không phải vì có vấn đề gì. Bấm <b>Thông tin thêm</b> rồi <b>Vẫn chạy</b>.</>, <>The warning appears because the installer is not code-signed yet, not because something is wrong. Click <b>More info</b>, then <b>Run anyway</b>.</>) },
  ];

  return (
    <>
      <header className="topbar">
        <div className="container">
          <a className="brand" href="#top" aria-label="Cocoflow"><Logo /> Cocoflow</a>
          <nav className="topnav">
            <a className="hide-s" href="#how">{t("Cách dùng", "How it works")}</a>
            <a className="hide-s" href="#features">{t("Tính năng", "Features")}</a>
            <a className="hide-s" href="#highlights">{t("Nổi bật", "Highlights")}</a>
            <a className="hide-s" href="#faq">FAQ</a>
            <LangSwitch />
            <Button type="primary" className="cta cta-sm" icon={<DownloadOutlined />} href="#download">{t("Tải về", "Download")}</Button>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="container hero-center">
            <div className="pill">{t("Miễn phí cho Windows 10 / 11", "Free for Windows 10 / 11")}</div>
            <Title level={1}>
              {t(<>Mọi công cụ xử lý file,<br /><span className="accent">trong một nơi.</span></>, <>Every file tool,<br /><span className="accent">in one place.</span></>)}
            </Title>
            <Paragraph className="hero-lead">
              {t("Chuyển đổi, nén, chỉnh sửa và tối ưu file ngay trên máy tính. Nhanh chóng, riêng tư, không cần cài nhiều ứng dụng.", "Convert, compress, edit and optimize files right on your computer. Fast, private, no pile of apps to install.")}
            </Paragraph>
            <Space wrap size="middle" className="hero-cta">
              <Button type="primary" className="cta cta-lg" icon={<DownloadOutlined />} href="#download">{t("Dùng thử miễn phí", "Try it free")}</Button>
              <Button className="ghost-lg" href="#features">{t("Khám phá tính năng", "Explore features")}</Button>
            </Space>
            <div className="hero-demo"><Demo /></div>
          </div>
        </section>

        <Divider style={{ margin: 0 }} />

        <section className="section" id="how">
          <div className="container">
            <Head eyebrow={t("Cách dùng", "How it works")} title={t("Xử lý file chỉ với 3 bước", "Process files in just 3 steps")} />
            <Row gutter={[20, 20]}>
              {steps.map((s, i) => (
                <Col key={i} xs={24} md={8}>
                  <Card style={{ height: "100%" }}>
                    <div className="step-art">{s.art}</div>
                    <div className="step-head"><span className="step-no">{i + 1}</span><Title level={4} style={{ margin: 0 }}>{s.title}</Title></div>
                    <Text type="secondary">{s.body}</Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        </section>

        <Divider style={{ margin: 0 }} />

        <section className="section" id="features">
          <div className="container">
            <Head eyebrow={t("Tính năng", "Features")} title={t("Mỗi loại file, một bộ công cụ riêng", "Each kind of file gets its own toolkit")} lead={t("Chọn một loại file bên dưới để xem bánh xe sẽ có những ô nào khi bạn kéo nó.", "Pick a kind of file below to see which slices the wheel offers when you drag it.")} />
            <Formats />
          </div>
        </section>

        <Divider style={{ margin: 0 }} />

        <section className="section" id="highlights">
          <div className="container">
            <Head eyebrow={t("Nổi bật", "Highlights")} title={t("Không chỉ là đổi đuôi file", "More than changing a file extension")} />
            <Feature
              eyebrow={t("Chia sẻ", "Share")}
              title={t("Nén theo nơi bạn sẽ gửi", "Shrink for where it is going")}
              body={t("Bạn không cần nhớ bitrate hay chất lượng. Chọn nơi sẽ gửi file, Cocoflow tự tính để file vừa đủ dung lượng.", "No need to remember bitrates or quality settings. Choose where the file is going and Cocoflow works out the rest so it just fits.")}
              points={[
                t("Zalo, Email, Story, Web, Facebook, Shopee, ảnh đại diện…", "Chat, email, story, web, Facebook, Shopee, avatar…"),
                t("Video được nén hai lượt để chạm đúng giới hạn", "Video is encoded in two passes to land on the limit"),
                t("Bánh xe báo trước kết quả, ví dụ 148 MB → ≤ 25 MB", "The wheel shows the result first, e.g. 148 MB → ≤ 25 MB"),
              ]}
            >
              <AppWindow typeId="video" mode="share" />
            </Feature>
            <Feature
              flip
              eyebrow={t("AI chạy offline", "Offline AI")}
              title={t("AI chạy ngay trên máy bạn", "AI that runs on your own PC")}
              body={t("Đã có sẵn trong bộ cài, chạy hoàn toàn offline nên file không rời khỏi máy.", "Already inside the installer and fully offline, so files never leave your PC.")}
              points={[
                t("Nhận dạng chữ tiếng Việt và tiếng Anh, xuất PDF tìm kiếm được", "Vietnamese and English text recognition, with searchable PDF output"),
                t("Tạo phụ đề bằng Whisper và tóm tắt lời nói", "Whisper subtitles and summaries of speech"),
                t("Xóa nền, phóng to ảnh ×2 hoặc ×4, tóm tắt tài liệu", "Background removal, ×2 or ×4 upscaling, document summaries"),
              ]}
            >
              <AppWindow typeId="image" mode="ai" />
            </Feature>
            <Feature
              eyebrow={t("Công cụ", "Tools")}
              title={t("Đúng công cụ cho từng loại file", "The right tools for each kind of file")}
              body={t("Mỗi loại file có một bộ công cụ riêng, chỉ gồm những gì áp dụng được cho nó.", "Each kind of file has its own set of tools, with only what applies to it.")}
              points={[
                t("Video: nén, đổi kích thước, cắt đoạn, cắt khung, tách file, bỏ âm thanh", "Video: compress, resize, trim, crop, split, remove audio"),
                t("Ảnh: nén, xoay, lật, đen trắng. Âm thanh: chuẩn hóa, cắt khoảng lặng", "Images: compress, rotate, flip, grayscale. Audio: normalize, trim silence"),
                t("Chọn nhiều file để ghép video, âm thanh hoặc PDF", "Select several files to merge video, audio or PDF"),
              ]}
            >
              <AppWindow typeId="video" mode="tools" />
            </Feature>
            <Feature
              flip
              eyebrow={t("Có xem trước", "Live preview")}
              title={t("Cắt, xén, chia ngay trong app", "Trim, crop and split in the app")}
              body={t("Xem trước kết quả rồi mới bấm Bắt đầu, không phải mở thêm phần mềm chỉnh sửa.", "Preview the result, then press Start, with no editing software to open.")}
              points={[
                t("Kéo hai đầu thanh trượt hoặc nhập thời gian chính xác", "Drag the two handles or type exact times"),
                t("Xem lại đoạn đã chọn trước khi lưu", "Play the selection before saving"),
                t("Chế độ Nhanh: cắt mà không mã hóa lại", "Fast mode: cut without re-encoding"),
              ]}
            >
              <TrimDialog file="chuyen-di.mp4" inline />
            </Feature>

            <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
              {more.map((x, i) => (
                <Col key={i} xs={24} sm={12} lg={8}>
                  <Card style={{ height: "100%" }}>
                    <div className="icon-tile">{x.icon}</div>
                    <Title level={5} style={{ marginTop: 0 }}>{x.title} {x.isNew && <NewTag />}</Title>
                    <Text type="secondary">{x.body}</Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        </section>

        <Divider style={{ margin: 0 }} />

        <section className="section">
          <div className="container">
            <Row gutter={[24, 24]}>
              {promises.map((x, i) => (
                <Col key={i} xs={24} md={8}>
                  <div className="promise">
                    <div className="icon-tile">{x.icon}</div>
                    <div>
                      <Title level={5} style={{ margin: "0 0 4px" }}>{x.title}</Title>
                      <Text type="secondary">{x.body}</Text>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        </section>

        <Divider style={{ margin: 0 }} />

        <section className="section" id="download">
          <Download />
        </section>

        <Divider style={{ margin: 0 }} />

        <section className="section" id="faq">
          <div className="container" style={{ maxWidth: 800 }}>
            <Head eyebrow="FAQ" title={t("Câu hỏi thường gặp", "Frequently asked questions")} />
            <Collapse accordion size="large" items={faq.map((x, i) => ({ key: i, label: <b>{x.q}</b>, children: <Text type="secondary">{x.a}</Text> }))} />
          </div>
        </section>
      </main>

      <footer className="site">
        <div className="container">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="brand" href="#top"><Logo size={40} /> Cocoflow</a>
              <p>{t("Chuyển đổi, nén, chỉnh sửa và tối ưu file ngay trên máy Windows của bạn.", "Convert, compress, edit and optimize files right on your Windows PC.")}</p>
            </div>
            <div className="foot-col">
              <h4><ThunderboltOutlined /> {t("Tính năng", "Features")}</h4>
              <a href="#features">{t("Chuyển đổi định dạng", "Convert formats")}</a>
              <a href="#highlights">{t("Nén để chia sẻ", "Shrink to share")}</a>
              <a href="#highlights">{t("AI chạy offline", "Offline AI")}</a>
            </div>
            <div className="foot-col">
              <h4><SettingOutlined /> {t("Cách dùng", "How it works")}</h4>
              <a href="#how">{t("Ba bước", "Three steps")}</a>
              <a href="#top">{t("Demo kéo thả", "Drag-and-drop demo")}</a>
            </div>
            <div className="foot-col">
              <h4><QuestionCircleOutlined /> {t("Hỗ trợ", "Support")}</h4>
              <a href="#download">{t("Tải về", "Download")}</a>
              <a href="#faq">{t("Câu hỏi thường gặp", "FAQ")}</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Cocoflow. {t("Miễn phí, chạy hoàn toàn trên máy bạn.", "Free, and it runs entirely on your PC.")}</span>
            <span>
              {t("Được phát triển bởi", "Developed by")}{" "}
              <a className="dev" href="https://github.com/nguyen-tuankiet" target="_blank" rel="noopener noreferrer"><b>Nguyễn Tuấn Kiệt</b> <HeartOutlined /></a>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
