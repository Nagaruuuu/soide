# SOI ĐỀ AI — Plan Code MVP (đa môn, thi ieeai.net 25/10/2026)

> Mục tiêu: web app cho GV dán đề trắc nghiệm 4 lựa chọn → soi lỗi → sửa → xuất báo cáo.
> Demo chính: Toán + Anh. Các môn khác chạy lõi chung + nhãn giới hạn trung thực.
> Stack: React (Vite) + Node.js/Express + SQLite + 1 LLM qua lớp AIProvider + sandbox Python cho Toán số.
> Không code cổng thanh toán ở MVP, nhưng giữ cột quota để bán premium sau.

## 1. Cấu trúc thư mục (tạo mới trong `C:\Users\HP\Desktop\soide`)

```
soide/
  PLAN-CODE.md            (file này)
  frontend/               (React + Vite)
    src/
      pages/              (A_Overview, B_Input, C_Results, D_Compare, E_Report)
      components/         (QuestionCard, SeverityFilter, DiffView, ScopeBanner)
      lib/                (api client, types)
  backend/
    src/
      index.js            (Express entry)
      routes/             (checks.js, results.js, report.js)
      modules/
        parser/           (tách câu, tách A-D)
        rules/            (rules chung + rules theo nhóm môn)
        solver/           (gọi sandbox Python, chỉ nhóm T)
        llm/              (AIProvider, prompt solver + phản biện, validate JSON)
        aggregator/       (gộp + xếp hạng severity)
        review/           (xác nhận/bác bỏ/cần chuyên gia)
        report/           (tổng hợp báo cáo)
      db/                 (sqlite schema, migration)
      middleware/         (rateLimit, inputLimit, errorHandler)
    sandbox/
      solve.py            (chạy riêng, giới hạn timeout/RAM, không mạng)
    tests/
      gold/               (60 câu gold-set: 30 đúng + 30 gài lỗi, do GV gán nhãn)
      unit/               (parser, rules)
      integration/        (pipeline end-to-end)
```

## 2. Phân loại nhóm môn (quyết định kiến trúc đa môn)

| Nhóm | Môn | Kiểm chứng ở MVP |
|------|-----|------------------|
| T (tính toán) | Toán, Lý, Hóa bài tập số | rules + solver sandbox (tính lại) + LLM → nhãn `computed`, được báo `Chặn lại` |
| N (ngôn ngữ/quy tắc) | Anh (ngữ pháp/từ vựng), Tin | rules + checker nhẹ → nhãn `rule`, mức tối đa `Nên xem` |
| H (hiểu/nhận định) | Văn, Sử, Địa lý thuyết, Sinh, GDCD... | chỉ rules mơ hồ + LLM gợi ý → nhãn `llm-suggest`, bắt buộc kèm `chưa thể kết luận — cần GV quyết`, không báo `Chặn lại` đáp án |

Form nhập có `Môn ▾` → tự gợi ý nhóm, GV được sửa nhóm thủ công.

## 3. Schema dữ liệu (SQLite, tối giản + giữ cửa premium)

```sql
users(id, display_name, plan TEXT DEFAULT 'free', monthly_quota INT DEFAULT 30, used_this_month INT DEFAULT 0);
checks(id, user_id, title, subject, grade, level_expect, group_kind TEXT, created_at);
questions(id, check_id, ord, content, opt_a, opt_b, opt_c, opt_d, expected_answer, explanation);
findings(id, question_id, severity TEXT, category, evidence, expected_answer, suggested_answer,
         fix_suggestion, confidence TEXT, verification_method TEXT, status TEXT DEFAULT 'pending');
decisions_log(question_id, finding_id, action TEXT, at);  -- confirmed/rejected/needs_expert
```

- `verification_method ∈ {rule, computed, llm-suggest}` — bắt buộc hiển thị trên UI.
- `severity ∈ {blocker, review, hint, ok}` (Chặn lại / Nên xem / Gợi ý / Ổn).
- `confidence ∈ {thấp, vừa, cao}` — cấm hiển thị % giả tạo.
- Không lưu tên HS/trường. Job xóa đề sau 30 ngày + nút xóa tay.

## 4. API endpoints (khái niệm, chưa code)

| Method + Path | Vào | Ra | Ghi chú |
|---|---|---|---|
| `POST /api/checks` | title, subject, grade, level_expect, questions[] | check_id, tách câu thử | validate ≤50 câu, ≤20k ký tự; trừ quota |
| `POST /api/checks/:id/run` | criteria[] (đáp án, duy nhất, đủ dữ kiện...) | job_id | chạy pipeline async, poll từng câu |
| `GET /api/checks/:id/results` | — | questions + findings (stream/poll) | UI C render dần, lỗi câu nào thử lại câu đó |
| `PATCH /api/results/:qid` | action: confirmed/rejected/needs_expert | ok | ghi decisions_log (minh chứng thi) |
| `GET /api/checks/:id/report` | — | tổng hợp: đã xác nhận / chưa xử lý / ổn + phạm vi & giới hạn | UI E + nút sao chép |
| `DELETE /api/checks/:id` | — | ok | GV xóa đề |

Lỗi chuẩn: `{error_code, message_vi, retryable}`. Mã: `INPUT_TOO_LONG, QUOTA_EXCEEDED, LLM_BAD_JSON, SOLVER_TIMEOUT, RATE_LIMITED`.

## 5. Pipeline kiểm định (1 LLM đủ, gọi thêm có điều kiện)

```
parser → rules chung → rẽ nhóm môn (T/N/H) → [solver nếu T] → LLM vai Solver (giải mù, không nhìn đáp án GV)
  → chỉ gọi LLM vai Phản biện khi: solver lệch đáp án GV HOẶC confidence=thấp
  → aggregator (gộp, xếp severity, gắn verification_method) → GV review
```

- Prompt LLM bắt buộc trả JSON theo schema, validate + retry tối đa 2 lần, hỏng → đánh `llm-suggest/thấp/chưa thể kết luận`.
- Sandbox: chạy `solve.py` với timeout 5s/câu, cấm import mạng/file, chạy tiến trình riêng (không phải server chính).
- Rate limit: 30 req/phút/user, 50 câu/lần chạy.

## 6. Rules lõi chung (làm trước, không tốn token)

1. Thiếu thành phần: thiếu A-D, thiếu đáp án dự kiến, numbering loạn.
2. Mẫu mơ hồ TV (regex + danh sách): phủ định kép, `có thể/một số/hầu hết`, `tất cả đều đúng` không giải thích, thiếu đơn vị, thiếu điều kiện/hình vẽ (`hình dưới`, `đồ thị` nhưng không kèm).
3. Trùng lặp: chuẩn hóa + cosine, ngưỡng 0.88 → `review`.
4. Dài câu bất thường / phương án lệch độ dài rõ rệt → `hint`.
5. Nhóm T thêm: đáp án số không khớp solver → `blocker`. Nhóm N (Anh): thì/mạo từ/số ít-nhiều cơ bản. Nhóm H: chỉ báo `thiếu ngữ cảnh` (thiếu thời gian/địa điểm/nguồn trích), `2 phương án đều biện minh được` ở mức gợi ý.

## 7. UI — 5 màn hình (React, tiếng Việt, laptop trước)

- **A Tổng quan:** danh sách lần kiểm tra + nút Kiểm tra mới + khung Phạm vi & giới hạn. Không biểu đồ giả.
- **B Nhập đề:** Môn/Lớp/Nhóm môn + textarea dán + bảng câu (Nội dung/A-D/Đáp án/Lời giải) + tickbox tiêu chí + Xem trước + cảnh báo privacy.
- **C Kết quả:** bộ lọc blocker/review/hint/ok + QuestionCard (nội dung, đáp án GV vs đề xuất, vấn đề, bằng chứng, confidence, verification_method) + nút Xác nhận/Bác bỏ/Cần chuyên gia. Skeleton khi loading, thử lại từng câu khi lỗi, nhãn vàng khi chưa kết luận, nhãn xanh khi ổn trong phạm vi.
- **D So sánh:** 2 cột gốc (khóa) vs đề xuất (sửa được), diff bôi vàng, Chấp nhận/Sửa tay/Bỏ qua.
- **E Báo cáo:** đã xác nhận / chưa xử lý / ổn + phạm vi & giới hạn + thời gian + model dùng + Sao chép báo cáo (xuất Word để sau nếu còn giờ).

Luồng ngắn nhất: A → B (dán 10 câu, tick mặc định) → Chạy → C (lọc Blocker) → E. Mục tiêu <3 phút/10 câu.

## 8. Task theo ngày (10/10 → 25/10, mỗi task có nghiệm thu)

| ID | Ngày | Mục tiêu | Đầu vào | Đầu ra + Nghiệm thu |
|----|------|----------|---------|---------------------|
| T1 | 10–11/10 | Chốt 2 môn demo + gold-set | Xin 30 câu Toán + 30 câu Anh (xóa tên trường/HS); fallback đề minh họa BGD | `tests/gold/*.json` có nhãn GV; thiếu thì ghi nợ |
| T2 | 12/10 | Khung BE+FE+DB | Khởi tạo Vite + Express + SQLite đúng §1/§3 | Chạy local 2 cổng, `GET /health` ok |
| T3 | 13/10 | Parser + UI B | Đề text mẫu | Dán 10 câu → tách đúng ≥9; thiếu A-D báo ngay; test INPUT_TOO_LONG |
| T4 | 14/10 | Rules chung + UI C (khung) | Parser xong | Mỗi rule có unit test; UI C render skeleton + filter |
| T5 | 15/10 | Solver sandbox + rẽ nhóm T/N/H | Câu Toán số mẫu | Lệch đáp án → blocker kèm phép tính; timeout → llm-suggest/thấp; test SOLVER_TIMEOUT |
| T6 | 16/10 | AIProvider + 2 vai LLM + validate JSON | API key ở server (.env) | JSON hỏng → retry 2 lần → fallback chưa kết luận; test LLM_BAD_JSON |
| T7 | 17/10 | Aggregator + UI D | Findings thô | Mỗi finding có severity + verification_method + fix; D diff bôi vàng, không ghi đè gốc |
| T8 | 18/10 | Review + Report + quota | Findings xong | PATCH review ghi log; E sao chép được; QUOTA_EXCEEDED khi quá 30 câu/tháng (free) |
| T9 | 19/10 | Hardening + E2E | Toàn pipeline | E2E 10 câu <3 phút; rate limit + xóa đề + lỗi hiển thị TV |
| T10 | 20–21/10 | Thử 3–5 GV thật | Gold-set + đề GV | Bảng precision/recall/thời gian + quote; sửa ngưỡng/prompt |
| T11 | 22–23/10 | Đóng demo cho hồ sơ | App chạy ổn | Quay màn hình 90s (Toán + Anh), chụp ảnh B→C→E cho slide |
| T12 | 24–25/10 | Đệm + nộp | Hồ sơ đủ | Nộp link BTC trước 20h 25/10 |

Phụ thuộc: T3→T4→T5→T6→T7→T8→T9→T10. T1 song song từ đầu. T11–T12 thuộc track slide (làm sau).

## 9. Đo chất lượng (không bịa số)

- precision = cảnh báo đúng / tổng cảnh báo; recall = lỗi bắt được / tổng lỗi gold-set; đếm false-alarm, miss.
- Baseline: cùng đề dán vào ChatGPT với 1 câu lệnh chung → so bằng tay.
- Thời gian: bấm giờ GV rà mắt vs dùng tool, cùng đề.
- Nguồn minh chứng: decisions_log + quote GV. Chưa có user → ghi `dự kiến`.

## 10. Tiêu chí tiếp tục / thu hẹp / dừng

- Tiếp tục đa môn nếu precision ≥60% ở Toán+Anh và ≥3 GV nói tiết kiệm thời gian.
- Thu hẹp: hồ sơ chỉ demo Toán+Anh, môn khác ghi `lộ trình`.
- Dừng/chuyển nếu GV không có đề text để dán hoặc chỉ muốn tạo đề (đụng Azota).

## 11. Việc CẤM ở MVP

Tự luận dài, upload DOCX/PDF/ảnh, LaTeX, ngân hàng đề, trộn mã đề, chấm bài, đa model voting, thống kê toàn trường, cổng thanh toán, mobile app, dark mode, điểm % chính xác giả tạo.
