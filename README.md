# Cocoflow

Ứng dụng Windows chuyển đổi file bằng cách **kéo thả**: kéo một file, nhấn một phím (Shift / Ctrl / Alt…) và một bánh xe hiện ngay dưới con trỏ. Thả vào ô cần dùng để chuyển đổi, nén, cắt, chia sẻ hoặc chạy AI offline. Mọi thứ chạy trên máy, không tải file lên mạng.

*Cocoflow is a Windows drag-and-drop file converter: drag a file, press a key, and drop it on a wheel that opens under your cursor.*

## Tính năng

- **Chuyển đổi** ảnh, video, âm thanh, tài liệu, bảng tính, PDF, slide, file nén, phụ đề.
- **Công cụ** theo từng loại file: nén, đổi kích thước, cắt đoạn, cắt khung, tách file, ghép…, có xem trước.
- **Chia sẻ**: nén theo nơi gửi (Zalo, Email, Story, Shopee…), tự tính để vừa dung lượng.
- **AI offline**: OCR tiếng Việt, phụ đề (Whisper), xóa nền, phóng to ảnh, tóm tắt.
- Dán ảnh từ clipboard (`Ctrl+Alt+V`), tạm dừng / hủy từng việc, giao diện tiếng Việt và English.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src-tauri/` | Phần lõi bằng Rust (Tauri 2): theo dõi kéo thả, bánh xe, chạy công cụ, hàng đợi việc |
| `src/`, `index.html`, `wheel.html` | Giao diện (TypeScript + Vite): cửa sổ chính, bánh xe, trình cắt/xén |
| `website/` | Trang giới thiệu và tải về (React + Ant Design, có demo kéo thả) |
| `scripts/`, `packaging/`, `docs/` | Đóng gói bộ cài, ký số, winget, tài liệu |

## Chạy và build

Cần Node.js, Rust (MSVC) và WebView2.

```bash
npm install
npm run tauri dev        # chạy thử
```

Bộ cài cần thêm các công cụ bên thứ ba (ffmpeg, Pandoc, ImageMagick, Ghostscript, 7-Zip và gói AI) đặt trong `installer-bin/`. Các file này **không** nằm trong repo vì quá nặng; xem `docs/RELEASE.md` và `docs/AI.md` để biết tải ở đâu. Sau đó:

```powershell
powershell -File scripts\make-release.ps1
```

Trang web:

```bash
cd website
npm install
npm run dev              # xem thử
npm run build            # ra thư mục website/dist
```

Địa chỉ tải file trên trang web nằm trong `website/src/release.ts`.

## Ghi chú giấy phép

Repo chưa có file `LICENSE`: hãy chọn giấy phép phù hợp trước khi công khai. Bản phát hành đóng gói sẵn ffmpeg, Pandoc, ImageMagick, Ghostscript, 7-Zip, Tesseract, whisper.cpp và các phần mềm khác, mỗi thứ có giấy phép riêng (danh sách ở `docs/`).
