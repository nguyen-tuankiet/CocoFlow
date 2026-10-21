import type { ReactNode } from "react";
import { Button, Card, Col, Collapse, Divider, Row, Space, Typography } from "antd";
import {
  AppstoreAddOutlined,
  ControlOutlined,
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
import { Feature, NewTag, Shot } from "./Showcase";
import { useT } from "./lang";
import { RELEASE } from "./release";

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
  const f = RELEASE.files;

  const steps = [
    { title: t("Cầm file lên", "Pick up a file"), body: t("Chọn một hoặc nhiều file trên desktop, trong Explorer hay một ứng dụng khác và bắt đầu kéo như khi muốn di chuyển chúng.", "Select one or more files on the desktop, in Explorer or another app and start dragging, just as if you were moving them.") },
    { title: t("Chọn chế độ bằng phím", "Choose a mode with a key"), body: t(<><kbd>Shift</kbd> đổi định dạng, <kbd>Ctrl</kbd> công cụ, <kbd>Alt</kbd> thao tác nhanh, <kbd>Shift</kbd>+<kbd>Ctrl</kbd> nén để gửi, <kbd>Ctrl</kbd>+<kbd>Alt</kbd> AI. Bánh xe mở ra rồi thì bạn có thể nhả phím.</>, <><kbd>Shift</kbd> changes format, <kbd>Ctrl</kbd> tools, <kbd>Alt</kbd> quick actions, <kbd>Shift</kbd>+<kbd>Ctrl</kbd> shrink to send, <kbd>Ctrl</kbd>+<kbd>Alt</kbd> AI. Once the wheel is open you can let go of the keys.</>) },
    { title: t("Thả xuống một ô", "Drop it on a slice"), body: t("File mới nằm cạnh file gốc, file gốc không bị đụng tới. Việc nào cũng có thể tạm dừng hoặc hủy.", "The new file lands beside the original, which is left untouched. Any job can be paused or cancelled.") },
  ];

  const more = [
    { icon: <SnippetsOutlined />, isNew: true, title: t("Dán ảnh từ clipboard", "Paste from the clipboard"), body: t(<>Sao chép một ảnh (ví dụ WebP từ trình duyệt), bấm <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> rồi đổi sang PNG hay JPG.</>, <>Copy an image (say a WebP from your browser), press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> and turn it into PNG or JPG.</>) },
    { icon: <PauseCircleOutlined />, title: t("Tạm dừng và hủy từng việc", "Pause and cancel each job"), body: t("Nén video lâu quá? Tạm dừng, tiếp tục hoặc hủy bất cứ lúc nào. Việc bị hủy sẽ được dọn sạch file dang dở.", "Video taking forever? Pause, resume or cancel any time. A cancelled job cleans up its unfinished files.") },
    { icon: <MergeCellsOutlined />, title: t("Ghép nhiều file", "Merge several files"), body: t("Chọn nhiều file rồi ghép video, ghép âm thanh, gộp PDF hoặc gộp một loạt ảnh thành một file PDF.", "Select several files and join videos, join audio, merge PDFs or combine a batch of photos into one PDF.") },
    { icon: <ThunderboltOutlined />, title: t("Xử lý cả loạt file", "Whole batches at once"), body: t("Thả nhiều file vào cùng một ô, Tangelo tự xếp hàng và gửi thông báo khi xong, không làm phiền từng file một.", "Drop many files on one slice. Tangelo queues them and sends one notification when they are done.") },
    { icon: <AppstoreAddOutlined />, title: t("Kéo từ mọi ứng dụng", "Drag from any app"), body: t("Không chỉ Explorer: kéo từ màn hình desktop hay các ứng dụng khác đều mở được bánh xe. Có thể tắt nếu bạn chỉ cần Explorer.", "Not just Explorer: dragging from the desktop or other apps opens the wheel too. Switch it off if you only want Explorer.") },
    { icon: <TranslationOutlined />, title: t("Tiếng Việt và công cụ có sẵn", "Vietnamese and tools built in"), body: t("Giao diện tiếng Việt hoặc English. Bộ cài đã gồm ffmpeg, ImageMagick, Pandoc, Ghostscript và 7-Zip nên cài xong là dùng.", "English or Vietnamese interface. The installer already includes ffmpeg, ImageMagick, Pandoc, Ghostscript and 7-Zip, so it works right after install.") },
  ];

  const promises = [
    { icon: <LockOutlined />, title: t("File ở lại trên máy bạn", "Files stay on your PC"), body: t("Mọi thao tác chạy cục bộ, không cần tài khoản, dùng được cả khi mất mạng.", "Everything runs locally, no account needed, and it works offline.") },
    { icon: <FileDoneOutlined />, title: t("File gốc được giữ nguyên", "Originals are left alone"), body: t("Kết quả là file mới nằm cạnh file gốc, có hậu tố rõ ràng và không ghi đè.", "Results are new files beside the original, clearly named and never overwriting.") },
    { icon: <WindowsOutlined />, title: t("Nằm yên ở khay hệ thống", "Lives in the tray"), body: t("Không có cửa sổ chính phải quản lý. Bánh xe chỉ hiện ra đúng lúc bạn đang kéo file.", "No main window to manage. The wheel only appears while you are dragging a file.") },
  ];

  const faq = [
    { q: t("File của tôi có bị gửi lên mạng không?", "Are my files uploaded anywhere?"), a: t("Không. Mọi thao tác chạy ngay trên máy bằng các công cụ đi kèm. Tangelo không cần tài khoản và không gửi file hay dữ liệu đi đâu.", "No. Everything runs on your PC with the bundled tools. Tangelo needs no account and sends no files or data anywhere.") },
    { q: t("Tangelo có miễn phí không?", "Is Tangelo free?"), a: t("Có. Bản hiện tại hoàn toàn miễn phí và không có quảng cáo.", "Yes. The current version is completely free and has no ads.") },
    { q: t("Windows báo “SmartScreen đã bảo vệ PC của bạn”, có an toàn không?", "Windows says “protected your PC”. Is it safe?"), a: t(<>Cảnh báo này xuất hiện vì bộ cài chưa được ký số, không phải vì có vấn đề gì. Bấm <b>Thông tin thêm</b> rồi <b>Vẫn chạy</b>.</>, <>The warning appears because the installer is not code-signed yet, not because something is wrong. Click <b>More info</b>, then <b>Run anyway</b>.</>) },
    { q: t("Tôi kéo file mà bánh xe không hiện?", "The wheel does not appear when I drag?"), a: t(<>Hãy bắt đầu kéo rồi mới giữ <kbd>Shift</kbd> (hoặc <kbd>Ctrl</kbd>, <kbd>Alt</kbd>). Kiểm tra ô “Bánh xe kéo thả” đang bật trong cửa sổ Tangelo hoặc menu ở khay hệ thống. Nếu kéo từ ứng dụng không phải Explorer, bật thêm “Từ mọi ứng dụng”.</>, <>Start dragging first, then hold <kbd>Shift</kbd> (or <kbd>Ctrl</kbd>, <kbd>Alt</kbd>). Make sure “Drag wheel” is on in the Tangelo window or tray menu. When dragging from an app other than Explorer, also enable “From any app”.</>) },
    { q: t("Kéo ảnh trực tiếp từ trình duyệt được không?", "Can I drag an image straight from my browser?"), a: t(<>Trình duyệt không đưa ra một file thật khi bạn kéo ảnh, nên cách nhanh nhất là bấm chuột phải → Sao chép ảnh, rồi nhấn <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> để Tangelo nhận ảnh đó.</>, <>Browsers do not hand over a real file when you drag an image, so the quickest way is right-click → Copy image, then press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> and Tangelo picks it up.</>) },
    { q: t("Tại sao bộ cài nặng gần 500 MB?", "Why is the installer almost 500 MB?"), a: t("Vì nó đã đóng sẵn mọi thứ để bạn khỏi phải cài thêm gì: các công cụ chuyển đổi (ffmpeg, ImageMagick, Pandoc, Ghostscript, 7-Zip) và cả các mô hình AI chạy offline. Chỉ có LibreOffice, dùng cho slide PowerPoint, được tách ra thành gói riêng.", "Because it ships with everything so you install nothing else: the conversion engines (ffmpeg, ImageMagick, Pandoc, Ghostscript, 7-Zip) and the offline AI models. Only LibreOffice, used for PowerPoint slides, is a separate add-on.") },
    { q: t("Làm sao cài gói LibreOffice?", "How do I install the LibreOffice add-on?"), a: t("Tải file .zip của gói, giải nén và chép thư mục bin vào thư mục cài đặt của Tangelo (hoặc thư mục bản portable), chọn gộp khi được hỏi. Mở lại Tangelo là dùng được.", "Download the add-on .zip, extract it and copy its bin folder into the Tangelo folder (or the portable folder), merging when asked. Restart Tangelo and it is ready.") },
    { q: t("Làm sao gỡ cài đặt?", "How do I uninstall?"), a: t("Vào Cài đặt → Ứng dụng → Tangelo → Gỡ cài đặt. Với bản portable, chỉ cần xóa thư mục.", "Settings → Apps → Tangelo → Uninstall. For the portable version just delete the folder.") },
  ];

  return (
    <>
      <header className="topbar">
        <div className="container">
          <a className="brand" href="#top" aria-label="Tangelo"><Logo /> Tangelo</a>
          <nav className="topnav">
            <a className="hide-s" href="#how">{t("Cách dùng", "How it works")}</a>
            <a className="hide-s" href="#features">{t("Tính năng", "Features")}</a>
            <a className="hide-s" href="#highlights">{t("Nổi bật", "Highlights")}</a>
            <a className="hide-s" href="#faq">FAQ</a>
            <LangSwitch />
            <Button type="primary" size="small" href="#download">{t("Tải về", "Download")}</Button>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="container hero-center">
            <div className="pill">{t("Miễn phí cho Windows 10 / 11", "Free for Windows 10 / 11")}</div>
            <Title level={1}>
              {t(<>Đổi, nén, cắt file<br /><span className="accent">ngay lúc đang kéo.</span></>, <>Convert, shrink and trim<br /><span className="accent">while you drag.</span></>)}
            </Title>
            <Paragraph className="hero-lead">
              {t("Tangelo nằm yên ở khay hệ thống. Khi bạn kéo một file và nhấn một phím, bánh xe hiện ra dưới con trỏ, chỉ gồm những việc áp dụng được cho đúng file đó.", "Tangelo waits quietly in your tray. Start dragging a file, press a key, and a wheel appears under your cursor with just the things that apply to that file.")}
            </Paragraph>
            <Space wrap size="middle" className="hero-cta">
              <Button type="primary" size="large" icon={<DownloadOutlined />} href="#download">{t("Tải Tangelo", "Get Tangelo")}</Button>
              <Button size="large" href="#how">{t("Xem cách dùng", "See how it works")}</Button>
            </Space>
            <div className="hero-demo"><Demo /></div>
          </div>
        </section>

        <Divider style={{ margin: 0 }} />

        <section className="section" id="how">
          <div className="container">
            <Head eyebrow={t("Cách dùng", "How it works")} title={t("Chỉ ba bước, không cần mở app", "Three steps, and the app never opens")} lead={t("Tangelo ở yên trong khay hệ thống, chỉ hiện ra đúng lúc bạn đang kéo file.", "Tangelo stays in the tray and only shows up while you are dragging a file.")} />
            <Row gutter={[20, 20]}>
              {steps.map((s, i) => (
                <Col key={i} xs={24} md={8}>
                  <Card style={{ height: "100%" }}>
                    <div className="step-no">{i + 1}</div>
                    <Title level={4} style={{ marginTop: 0 }}>{s.title}</Title>
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
            <Head eyebrow={t("Nổi bật", "Highlights")} title={t("Không chỉ là đổi đuôi file", "More than changing a file extension")} lead={t("Dưới đây là ảnh chụp từ chính Tangelo: vài việc nó làm sẵn để bạn không phải mở thêm công cụ nào khác.", "These are screenshots of Tangelo itself: a few things it does so you do not need yet another tool.")} />
            <Feature
              eyebrow={t("Chia sẻ", "Share")}
              title={t("Nén theo nơi bạn sẽ gửi", "Shrink for where it is going")}
              body={t("Bạn không cần nhớ bitrate hay chất lượng. Chọn nơi sẽ gửi file, Tangelo tự tính để file vừa đủ dung lượng.", "No need to remember bitrates or quality settings. Choose where the file is going and Tangelo works out the rest so it just fits.")}
              points={[
                t("Zalo, Email, Story, Web, Facebook, Shopee, ảnh đại diện…", "Chat, email, story, web, Facebook, Shopee, avatar…"),
                t("Video được nén hai lượt để chạm đúng giới hạn", "Video is encoded in two passes to land on the limit"),
                t("Bánh xe báo trước kết quả, ví dụ 148 MB → ≤ 25 MB", "The wheel shows the result first, e.g. 148 MB → ≤ 25 MB"),
              ]}
            >
              <Shot name="share" tags={[t("Chọn nơi gửi", "Pick the destination"), t("Tự tính dung lượng", "Size worked out for you")]} alt={t("Chế độ Chia sẻ trong Tangelo với các mục Zalo, Email, Story và Web", "Tangelo's Share mode with chat, email, story and web presets")} />
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
              <Shot name="ai" tags={[t("Chạy offline", "Runs offline"), t("Không tải file lên mạng", "Nothing is uploaded")]} alt={t("Chế độ AI trong Tangelo: OCR, xóa nền, phóng to", "Tangelo's AI mode: OCR, background removal, upscaling")} />
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
              <Shot name="tools" tags={[t("Công cụ cho video", "Video tools")]} alt={t("Các công cụ dành cho video trong Tangelo", "Tangelo's video tools")} />
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
              <Shot name="trim" narrow tags={[t("Xem trước trực tiếp", "Live preview"), t("Cắt đoạn video", "Trim video")]} alt={t("Cửa sổ cắt đoạn video có xem trước", "The trim window with a live preview")} />
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
              <a className="brand" href="#top"><Logo size={44} /> Tangelo</a>
              <p>{t("Kéo file, giữ một phím, thả vào bánh xe để chuyển đổi, nén và chia sẻ ngay trên máy Windows. Tiết kiệm thời gian, không phải mở thêm công cụ nào khác.", "Drag a file, hold a key and drop it on the wheel to convert, shrink and share right on your Windows PC. It saves time, with no extra tools to open.")}</p>
            </div>
            <div className="foot-col">
              <h4><ThunderboltOutlined /> {t("Tính năng", "Features")}</h4>
              <a href="#features">{t("Chuyển đổi định dạng", "Convert formats")}</a>
              <a href="#features">{t("Công cụ theo loại file", "Tools per file type")}</a>
              <a href="#highlights">{t("Nén để chia sẻ", "Shrink to share")}</a>
              <a href="#highlights">{t("AI chạy offline", "Offline AI")}</a>
            </div>
            <div className="foot-col">
              <h4><SettingOutlined /> {t("Cách hoạt động", "How it works")}</h4>
              <a href="#how">{t("Quy trình 3 thao tác", "Three moves")}</a>
              <a href="#top">{t("Demo kéo thả", "Drag-and-drop demo")}</a>
              <a href="#features">{t("Tất cả loại file", "Every file type")}</a>
            </div>
            <div className="foot-col">
              <h4><ControlOutlined /> {t("Cài đặt", "Install")}</h4>
              <a href="#download">{t("Tải về", "Download")}</a>
              <a href="#download">{t("Gói bổ sung", "Add-ons")}</a>
              <a href="#faq">{t("Khắc phục sự cố", "Troubleshooting")}</a>
            </div>
            <div className="foot-col">
              <h4><QuestionCircleOutlined /> {t("Hỏi đáp", "Q&A")}</h4>
              <a href="#faq">{t("Câu hỏi thường gặp", "Frequently asked questions")}</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Tangelo. {t("Miễn phí, chạy hoàn toàn trên máy bạn.", "Free, and it runs entirely on your PC.")}</span>
            <span>
              {t("Được phát triển bởi", "Developed by")}{" "}
              <a className="dev" href="https://github.com/nguyen-tuankiet" target="_blank" rel="noopener noreferrer"><b>Nguyễn Tuấn Kiệt</b> <HeartOutlined /></a>
            </span>
          </div>
          <div className="foot-credit">{t("Xây dựng trên ffmpeg, ImageMagick, Pandoc, Ghostscript, 7-Zip, Tesseract, whisper.cpp và các phần mềm mã nguồn mở khác.", "Built on ffmpeg, ImageMagick, Pandoc, Ghostscript, 7-Zip, Tesseract, whisper.cpp and other open-source software.")}</div>
        </div>
      </footer>
    </>
  );
}
