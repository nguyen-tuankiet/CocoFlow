//! Texts that the Rust side shows (notifications, job titles). The web UI has its own table in src/i18n.ts.

use std::sync::atomic::{AtomicU8, Ordering};

pub struct Strings {
    pub code: &'static str,
    pub done: &'static str,
    pub failed: &'static str,
    pub finished_with_errors: &'static str,
    pub app: &'static str,
    pub action_failed: &'static str,
    pub opened: &'static str,
    pub shown_in_folder: &'static str,
    pub path_copied: &'static str,
    pub file_copied: &'static str,
    pub copy_to_title: &'static str,
    pub move_to_title: &'static str,
    pub clipboard_empty: &'static str,
    pub clipboard_unreadable: &'static str,
    pub tray_open: &'static str,
    pub tray_wheel: &'static str,
    pub tray_paste: &'static str,
    pub tray_quit: &'static str,
}

static EN: Strings = Strings {
    code: "en",
    done: "Done",
    failed: "Failed",
    finished_with_errors: "Finished with errors",
    app: "Tangelo",
    action_failed: "Tangelo — action failed",
    opened: "Opened",
    shown_in_folder: "Shown in folder",
    path_copied: "Path copied",
    file_copied: "File copied",
    copy_to_title: "Copy to…",
    move_to_title: "Move to…",
    clipboard_empty: "The clipboard has no image or file. Copy an image (or a file in Explorer) first.",
    clipboard_unreadable: "Could not read the clipboard",
    tray_open: "Open Tangelo",
    tray_wheel: "Drag wheel enabled",
    tray_paste: "Convert image from clipboard (Ctrl+Alt+V)",
    tray_quit: "Quit",
};

static VI: Strings = Strings {
    code: "vi",
    done: "Hoàn tất",
    failed: "Thất bại",
    finished_with_errors: "Hoàn tất (có lỗi)",
    app: "Tangelo",
    action_failed: "Tangelo — thao tác thất bại",
    opened: "Đã mở",
    shown_in_folder: "Đã mở thư mục chứa file",
    path_copied: "Đã sao chép đường dẫn",
    file_copied: "Đã sao chép file",
    copy_to_title: "Sao chép đến…",
    move_to_title: "Di chuyển đến…",
    clipboard_empty: "Clipboard chưa có ảnh hay file. Hãy sao chép một ảnh (hoặc file trong Explorer) trước.",
    clipboard_unreadable: "Không đọc được clipboard",
    tray_open: "Mở Tangelo",
    tray_wheel: "Bật bánh xe kéo thả",
    tray_paste: "Chuyển đổi ảnh từ clipboard (Ctrl+Alt+V)",
    tray_quit: "Thoát",
};

static CURRENT: AtomicU8 = AtomicU8::new(0);

pub fn set(code: &str) {
    CURRENT.store(if code.starts_with("vi") { 1 } else { 0 }, Ordering::SeqCst);
}

pub fn get() -> &'static Strings {
    if CURRENT.load(Ordering::SeqCst) == 1 { &VI } else { &EN }
}

impl Strings {
    fn vi(&self) -> bool {
        self.code == "vi"
    }

    pub fn n_finished(&self, n: usize) -> String {
        if self.vi() { format!("{n} file đã xong") } else { format!("{n} files finished") }
    }

    pub fn n_done_failed(&self, ok: usize, failed: usize) -> String {
        if self.vi() { format!("{ok} xong, {failed} lỗi") } else { format!("{ok} done, {failed} failed") }
    }

    pub fn n_paths_copied(&self, n: usize) -> String {
        if self.vi() { format!("Đã sao chép {n} đường dẫn") } else { format!("{n} paths copied") }
    }

    pub fn n_files_copied(&self, n: usize) -> String {
        if self.vi() { format!("Đã sao chép {n} file") } else { format!("{n} files copied") }
    }

    pub fn items_to(&self, copy: bool, n: usize, dir: &str) -> String {
        match (self.vi(), copy) {
            (true, true) => format!("Đã sao chép {n} mục đến {dir}"),
            (true, false) => format!("Đã di chuyển {n} mục đến {dir}"),
            (false, true) => format!("Copied {n} item(s) to {dir}"),
            (false, false) => format!("Moved {n} item(s) to {dir}"),
        }
    }

    pub fn merge_title(&self, n: usize) -> String {
        if self.vi() { format!("Ghép {n} file") } else { format!("Merge {n} files") }
    }

    pub fn zip_title(&self, what: &str) -> String {
        if self.vi() { format!("Nén zip {what}") } else { format!("Zip {what}") }
    }

    pub fn n_items(&self, n: usize) -> String {
        if self.vi() { format!("{n} mục") } else { format!("{n} items") }
    }

    /// Display name of a tool id such as "compress" or "rotate-right".
    pub fn tool_name(&self, id: &str) -> String {
        let vi = self.vi();
        let name = match (id, vi) {
            ("compress", false) => "Compress",
            ("compress", true) => "Nén nhẹ",
            ("half", false) => "Half size",
            ("half", true) => "Giảm nửa kích thước",
            ("max1920" | "max1080" | "max512", false) => "Resize",
            ("max1920" | "max1080" | "max512", true) => "Đổi kích thước",
            ("p1080" | "p720" | "p480", false) => "Resolution",
            ("p1080" | "p720" | "p480", true) => "Độ phân giải",
            ("rotate-right", false) => "Rotate right",
            ("rotate-right", true) => "Xoay phải",
            ("rotate-left", false) => "Rotate left",
            ("rotate-left", true) => "Xoay trái",
            ("flip", false) => "Flip",
            ("flip", true) => "Lật ngang",
            ("grayscale", false) => "Grayscale",
            ("grayscale", true) => "Đen trắng",
            ("mute", false) => "Remove audio",
            ("mute", true) => "Bỏ âm thanh",
            ("frame", false) => "Grab frame",
            ("frame", true) => "Chụp khung hình",
            ("normalize", false) => "Normalize",
            ("normalize", true) => "Chuẩn hóa âm lượng",
            ("trim-silence", false) => "Trim silence",
            ("trim-silence", true) => "Cắt khoảng lặng",
            ("faster", false) => "Speed 1.5×",
            ("faster", true) => "Tăng tốc 1.5×",
            ("extract", false) => "Extract",
            ("extract", true) => "Giải nén",
            ("resize", false) => "Resize",
            ("resize", true) => "Đổi kích thước",
            ("trim", false) => "Trim",
            ("trim", true) => "Cắt đoạn",
            ("crop", false) => "Crop",
            ("crop", true) => "Cắt khung hình",
            ("split", false) => "Split",
            ("split", true) => "Tách file",
            (other, _) => other,
        };
        name.to_string()
    }

    /// Display name of an AI tool id such as "ocr" or "rmbg".
    pub fn ai_name(&self, id: &str) -> &'static str {
        match (id, self.vi()) {
            ("ocr", false) => "Text (OCR)",
            ("ocr", true) => "Chữ trong ảnh (OCR)",
            ("ocr-pdf", false) => "Searchable PDF",
            ("ocr-pdf", true) => "PDF tìm kiếm được",
            ("rmbg", false) => "Remove background",
            ("rmbg", true) => "Xóa nền",
            ("up2", false) => "Upscale ×2",
            ("up2", true) => "Phóng to ×2",
            ("up4", false) => "Upscale ×4",
            ("up4", true) => "Phóng to ×4",
            ("transcribe", false) => "Subtitles",
            ("transcribe", true) => "Phụ đề",
            ("talk-summary", false) => "Summary of speech",
            ("talk-summary", true) => "Tóm tắt lời nói",
            ("summary", false) => "Summary",
            ("summary", true) => "Tóm tắt",
            _ => "AI",
        }
    }

    /// Display name of a Share goal id (see goals.rs).
    pub fn goal_name(&self, id: &str) -> &'static str {
        let vi = self.vi();
        match (id, vi) {
            ("v-chat" | "i-chat", _) => "Chat",
            ("v-email" | "i-email" | "a-email" | "p-email", _) => "Email",
            ("v-story", _) => "Story",
            ("v-web", _) => "Web 1080p",
            ("i-web", _) => "Web",
            ("i-fb", _) => "Facebook",
            ("i-shopee", _) => "Shopee",
            ("i-avatar", false) => "Avatar",
            ("i-avatar", true) => "Ảnh đại diện",
            ("a-voice", false) => "Voice note",
            ("a-voice", true) => "Tin nhắn thoại",
            ("a-tiny", false) => "Tiny",
            ("a-tiny", true) => "Siêu nhỏ",
            ("a-podcast", _) => "Podcast",
            ("p-small", false) => "Small",
            ("p-small", true) => "Nhỏ gọn",
            ("p-print", false) => "Print",
            ("p-print", true) => "In ấn",
            _ => "Share",
        }
    }
}




