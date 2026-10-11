# Soi Đề AI (SoiDe)

Hệ thống Thẩm định & Phản biện Đề thi Trắc nghiệm Thông minh theo chuẩn Chương trình Giáo dục Phổ thông 2018 (CT GDPT 2018).

---

## 🌟 Tính Năng Nổi Bật

- **Thẩm định ma trận đề chuẩn CT GDPT 2018**: Đánh giá 4 mức độ tư duy (Biết, Hiểu, Vận dụng, Vận dụng cao) và tỷ lệ chuẩn 40-30-20-10.
- **Quy trình thẩm định đa bước**:
  - Đọc & chuẩn hóa dữ liệu đề
  - Giải độc lập đối soát đáp án
  - Phát hiện lỗi ngữ nghĩa, lỗi format, bẫy ảo giác
  - Xuất báo cáo biên bản thẩm định
- **Giao diện hiện đại & Responsive**: Tương thích toàn diện từ màn hình điện thoại (320px+) đến máy tính bảng và màn hình lớn.
- **Bộ lọc thông minh**: Lọc nhanh các câu hỏi theo trạng thái (Chặn lại, Nên xem, Gợi ý, Đạt chuẩn).
- **Xuất biên bản chuyên nghiệp**: Xuất báo cáo thẩm định định dạng DOCX / PDF phục vụ tổ bộ môn và hội đồng thẩm định đề thi.

---

## 🛠️ Công Nghệ Sử Dụng

- **Frontend**: React 18, Vite, Lucide Icons, Pure CSS Responsive Design System.
- **Backend**: Node.js, Express, SQLite, Axios, Docx / PDFKit generation.
- **AI Engine**: LLM Multi-agent Pipeline for exam validation.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Khởi chạy Backend
```bash
cd backend
npm install
npm run dev
# Server lắng nghe tại http://localhost:8010
```

### 2. Khởi chạy Frontend
```bash
cd frontend
npm install
npm run dev
# Giao diện chạy tại http://localhost:5173
```

Hoặc chạy nhanh qua file batch trên Windows:
- `start-api.bat`: Khởi động backend
- `start-web.bat`: Khởi động frontend

---

## 📄 Bản Quyền
Phát triển bởi Nagaruuuu & cộng đồng giáo dục.
