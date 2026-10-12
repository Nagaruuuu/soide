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

## 11. Việc CẤM ở MVP (sửa 12/10/2026 — bỏ 2 mục đã thành lõi)

Còn CẤM: LaTeX, ngân hàng đề, trộn mã đề, chấm bài (đặt điểm tuyệt đối cho tự luận), OCR/ảnh scan, đa model voting song song trên toàn đề, thống kê toàn trường, cổng thanh toán (giữ cột quota để bán sau), mobile app, dark mode, điểm % chính xác giả tạo.

Đã BỎ khỏi danh sách CẤM (vì §13–17 đã làm thành lõi): `upload DOCX/PDF`, `tự luận`.

## 12. Nhật ký triển khai (cập nhật 12/10/2026 — logic đã code xong)

### 12.1. Định dạng đề (`question_format`)
- `checks.question_format ∈ {choice, essay}`, mặc định `choice` để tương thích DB cũ (migration `ADD COLUMN`).
- `POST /api/checks` nhận `question_format: choice | essay | auto`. `auto` (mặc định): ≥30% câu có dấu hiệu A-D → `choice`, ngược lại `essay`. Trả về `question_format` + `format_detected`.
- B_Input có chọn Trắc nghiệm / Tự luận / Tự đoán (mặc định), gửi `question_format`.
- `thieu_thanh_phan` (blocker thiếu A-D) **chỉ chạy khi format là trắc nghiệm** — không mặc định mọi câu đều có 4 PA.

### 12.2. Đề có/không đáp án (`has_answer`)
- `checks.has_answer ∈ {0, 1}`, `POST /api/checks` nhận `has_answer: true | false | "auto"`. `auto`: <30% câu có đáp án → coi như không có.
- Có đáp án + thiếu đáp án → `review thieu_dap_an` (giữ nguyên). Không đáp án → `info khong_kem_dap_an`, không kích LLM argue vô ích; solver khớp số → `hint goi_y_dap_an` (GV chốt).
- `compareSolution` thêm verdict `suggest` khi giải xong mà đề không có đáp án.

### 12.3. Rule nội dung chưa đủ (`noi_dung_chua_du`, warning)
- Kích hoạt khi: không phương án + không đáp án + thiếu dấu hiệu câu hỏi (không `?`, không từ nghi vấn, không số/phép tính) — vd `Câu 1: ashasjdad` chỉ trả **duy nhất 1 warning này**, không kết luận đáp án sai.
- `2+2=?` vẫn qua (có số/phép tính). Câu tự luận 1 từ không dấu hiệu có thể dính nhầm ở mức warning — chấp nhận được, đã ghi nhận.
- Evidence các rule mơ hồ hiện **cụm khớp thực tế** thay vì regex source; blocker chỉ dùng khi xác minh được.

### 12.4. Thống kê duy nhất (`question_stats`)
- `GET results` / `GET report` trả `question_stats: {total, with_issue, errors, warnings, infos, ok}` tính từ cùng findings đã lưu (`modules/stats/stats.js`).
- Mapping severity: `blocker` → errors, `review`/`warning` → warnings, `hint`/`info` → infos. FE giữ cách đếm riêng nhưng đối chiếu khớp số này.
- Bảng đáp án riêng cuối đề được điền vào câu thiếu đáp án trước khi chạy rule (hết báo oan `ANS_MISSING`).

### 12.5. Test hiện tại
- `npm test`: 82 tests xanh, gồm `tests/shallow-content.test.js` (dòng vô nghĩa / tự luận / thiếu PA / đủ PA + đáp án riêng / question_stats) và fixture `tests/fixtures/shallow-*.txt`.
- 1 test cũ phải sửa theo hành vi mới: `FILE_MAX_MB=0` giờ là env không hợp lệ → fallback an toàn thay vì chặn tất cả.

## 12.6. Đã code xong (12/10/2026 — T13, T14, T18)

`npm test`: **103 tests xanh** (từ 82 → 103; thêm `tests/quota.test.js` + test T13/T14).

### T13 — RAG chịu được quy mô thật (đo, không phải ước lượng)
- `chunks` thêm cột **`vec` BLOB float32** + `page_source`. Cột `embedding` TEXT **giữ lại** → rollback được.
  Migration đọc JSON cũ → ghi BLOB, chạy 1 lần (`db.js: migrateChunkVectors`).
- Bảng mới **`citations`** (lưu trích dẫn theo câu: sách/chương/trang/`page_source`/score) — T17 sẽ ghi vào.
- `retrieve()` viết lại theo **2 pha**: pha 1 chấm điểm chỉ trên vector, pha 2 mới lấy `content` cho top-K
  (kéo `content` cho 20k dòng là lãng phí I/O).
- **Đo thật 20.000 chunks** (SQLite 3.53): `retrieve` **346-457ms** vs cách cũ **515-631ms** → nhanh hơn ~33%.
- **Bài học tốn công nhất**: `ORDER BY (c.vec IS NULL)` làm SQLite **sort toàn bảng, mất index** —
  tốn **432ms** (624ms → 192ms khi bỏ). Thay bằng 2 query riêng (đọc vec trước, hỏi chunk cũ sau).
- `cosineBlob()` xem Float32Array **trực tiếp trên BLOB** khi byteOffset chia hết 4, tránh cấp phát
  20k Float32Array (đo thấy GC gánh nặng hơn JSON).
- Test bắt được bug thật: **thiếu ngoặc `WHERE (a OR b) AND c`** → `a OR (b AND c)` khiến chunk sai môn
  lọt qua. Đã có test khoá hành vi này.
- `db.js` thêm `PRAGMA busy_timeout=10000` — `node --test` chạy file song song trên cùng DB, không có nó thì
  báo `database is locked`.

### T14 — Ingest SGK không còn cắt còn ~20% nội dung
- Thêm `profile: "exam" | "book"` cho `extractFromBuffer`. **Đề thi giữ nguyên** 20.000 ký tự (hành vi cũ).
- `bookLimits()` riêng: `BOOK_MAX_CHARS=300000`, `BOOK_MAX_MB=30`, `BOOK_MAX_PAGES=400`, timeout 60s.
- `ingestTextbook()` dùng profile `"book"`; route `POST /api/textbooks` dùng uploader `uploadBook` (30MB, thay vì 10MB).
- `EMBED_MAX_CHUNKS` 400→**2000**, `EMBED_MAX_CHARS` 200k→**2 triệu**.
- Warning ingest nay báo rõ **% nội dung bị cắt** thay vì câu cứng nhắc "20.000 ký tự".
- Test chứng minh: sách 60k ký tự → `truncated=false`, đề thi cùng nội dung → vẫn cắt ở 20k, và
  `fullHash` hai bên **bằng nhau** (hash trước khi cắt → dedup đúng).

### T18 — Paywall + đo chi phí thật
- `modules/quota/quota.js`: `checkQuota` (chặn **trước** khi tạo check) → `QUOTA_EXCEEDED` **HTTP 402**
  kèm `upgrade_hint`; `consumeQuota`, `ensureUser` (tự tạo user + **tự reset quota sang tháng mới**).
- Gói **premium = không giới hạn** (`plan='premium'` → `unlimited:true, quota_left:null`) — đúng §15.4.
- Bảng **`ai_cost_log`** (check, model, input/output tokens, `cost_usd`) + `totalCost()`.
- `runCheck` ghi log cost mỗi lần chạy và trả `usage` trong response. *Hiện token là **ước lượng** theo
  độ dài prompt (~4 ký tự/token) vì `callLLM` chưa cắm provider thật; sẽ thay bằng usage thật ở T6/T19.*
- `llmConfig()` bổ sung `priceIn/priceOut` đọc từ env.
- `GET /api/me` trả `quota_left`, `unlimited`, `ai_cost` → đủ để FE hiện banner upsell.
- `errorHandler` trả kèm `upgrade_hint` và `quota_left` khi có.

### Chưa làm (còn nợ)
- **T15** số trang SGK vẫn là `estimatePage` nội suy → `page_source='estimated'`, **chưa phải trang thật**.
- **T16** `EMBED_PROVIDER` vẫn mặc định `hash` (chưa bật `gemini` — cần API key).
- **T17** RAG **chưa** nối vào `runCheck`; bảng `citations` mới có, chưa có dữ liệu.
- **T19** chưa có model 2 tầng/escalation. **T20** chưa có DOCX.
- `runCheck` vẫn gọi LLM **tuần tự** trong vòng lặp → đề 50 câu sẽ chậm.
- Token trong `ai_cost_log` hiện là ước lượng, chưa phải usage thật từ provider.

## 13. Định vị kiếm tiền: lớp lọc thứ 2 sau ChatGPT/Gemini (chốt 12/10/2026)

> Quyết định: Full đa môn SGK + budget AI <200k VNĐ/tháng + RAG ưu tiên KHTN cấp 2-3 + bộ Kết nối tri thức trước.

1. **Nỗi đau trả tiền:** GV đã tạo đề bằng ChatGPT/Gemini nhưng không dám chắc: đáp án có đúng không,
   có câu 2 đáp án đúng không, có thiếu hình/đơn vị/bảng không, có lệch CT GDPT 2018 không.
   Sai 1 câu trước lớp/hội đồng = mất uy tín + phải in lại đề.
2. **Cam kết sản phẩm:** "Dán đề ChatGPT vào (hoặc upload PDF/DOCX) → Soi Đề chỉ ra câu nào
   Chặn lại / Nên xem kèm bằng chứng + trích dẫn SGK trang X → xuất biên bản nộp tổ chuyên môn".
   Không hứa "tạo đề hay", chỉ hứa **"chặn sai"** — đây là lý do GV chi tiền.
3. **Hook trả phí (freemium):**
   - Free 30 câu/tháng: chỉ chạy `rule + hash-RAG` offline, không giải AI chi tiết →
     nhiều dòng `chưa thể kết luận — cần GV quyết` → GV thấy thiếu.
   - Premium mở: giải mù AI + đối chiếu SGK có trích dẫn trang + check nguyên file PDF/DOCX
     + xuất DOCX biên bản + quota cao + check tự luận rubric.
   - Màn hình E (Báo cáo) là thứ bán được: có `verification_method`, `confidence`,
     `decisions_log` làm minh chứng với tổ trưởng.

## 14. Quy trình chi tiết end-to-end (code 0đ trước, AI sau — để tối ưu chi phí)

```
[0. Ingest PDF/DOCX/TXT] → [1. Parser choice/essay/auto] → [2. Code validators ~30 rules, 100% câu]
  → [3. Solver/Sandbox nhóm T] → [4. RAG SGK] → [5. AI cascade có điều kiện]
  → [6. Aggregator] → [7. GV Review + Report bán hàng]
```

### 14.0. Stage 0 — Ingest file (vì đề GV nằm ở PDF/DOCX, phải kiểm tra kỹ)
- Đã có: `modules/extract/` + `routes/files.js` + `middleware/upload.js`
  (chống zip-bomb `FILE_MAX_ZIP_ENTRIES`, `FILE_MAX_UNCOMPRESSED_MB`, timeout `EXTRACT_TIMEOUT_MS`,
  `pptx` trả stub `PPTX_NOT_SUPPORTED_YET`, giới hạn `FILE_MAX_MB/FILE_MAX_PAGES`).
- Quy trình chuẩn:
  1. Nhận file → check MIME/size/zip-entries → `pdf-parse` / `mammoth` trích text giữ số trang.
  2. Giữ `answerKey{}` (bảng đáp án cuối đề via `parseAnswerTable`) → điền vào câu thiếu đáp án
     trước khi chạy rule (hết báo oan `ANS_MISSING`).
  3. Phát hiện mất hình bằng code: regex `hình dưới|đồ thị|bảng sau|thí nghiệm|hình vẽ`
     mà không có `[IMAGE]` → `blocker thieu_ngu_canh` ngay, không tốn AI.
  4. Chuẩn hóa Unicode (NFKC), TCVN3 → Unicode, tách cột đôi, giữ `pageMap[]`, `imageRefs[]`.
- Output: `{examText, answerKey, imageRefs, pageMap}` → đưa sang Parser.

### 14.1. Stage 1 — Parser 2 dạng (đã có `question_format: choice | essay | auto`)
- `auto` (mặc định): ≥30% câu có dấu hiệu A-D → `choice`, ngược lại `essay`. Trả `format_detected`.
- **Trắc nghiệm:** tách `Câu N` + `A-D` inline/xuống dòng (`parseOne`, `splitInlineOptions`,
  `stripTrailingAnswer`). Rule `thieu_thanh_phan` chỉ chạy ở format này.
- **Tự luận:** tách theo `Câu/Bài + điểm (0.5–3đ) + động từ yêu cầu (trình bày/chứng minh/tính/so sánh)`.
  Thiếu barem/thang điểm → `review thieu_barem` bằng code, không gọi AI.

### 14.2. Stage 2 — Code validators (0đ, chạy 100% câu, <50ms/câu, làm trước AI)
- Nhóm A — Format (chung, `validator/rules/format.js,answer.js,choices.js`):
  numbering loạn, thiếu A-D/đáp án, đáp án ngoài A-D, bảng đáp án lệch số câu,
  trùng lặp exact + cosine ≥0.88 (`duplicate.js`).
- Nhóm B — Nội dung nông TV (regex + cụm khớp thực tế, không hiện regex source):
  phủ định kép, `có thể/một số/hầu hết/tất cả`, `Tất cả đều đúng` không giải thích,
  thiếu đơn vị (`cm/m/mol/V`), thiếu điều kiện/hình vẽ, `noi_dung_chua_du`
  (không PA + không đáp án + không `?`/từ nghi vấn/số — đã có `shallow-content.test.js`).
- Nhóm C — Trắc nghiệm logic: 2 PA paraphrase nhau (cosine cao), PA dài gấp ~2x trung bình,
  tính chẵn lẻ số học (`safeArithEval`, `checkTotals` trong `arithmetic.js`).
- Nhóm D — Tự luận logic: thiếu động từ hành động, thiếu dữ kiện số, tổng điểm ≠10,
  câu 1 từ vô nghĩa → duy nhất 1 `warning`, không kết luận đáp án sai.
- Nguyên tắc severity: **chỉ `blocker` khi code chứng minh được**
  (sai số, thiếu hình, đáp án vô hiệu). Còn lại tối đa `review/hint`.

### 14.3. Stage 3 — Solver xác minh (nhóm T: Toán/Lý/Hóa bài số)
- `sandbox/solve.py` chạy tiến trình riêng, timeout 5s (`SOLVER_TIMEOUT_MS`), cấm mạng.
  Mở rộng offline bằng `sympy`: đổi đơn vị, cân bằng PTHH, giải hệ.
- Khớp số mà đề không đáp án → `hint goi_y_dap_an` (GV chốt).
  Lệch đáp án GV → `blocker` kèm phép tính + đẩy sang Stage 5 phản biện.
  Timeout → `llm-suggest/thấp/chưa thể kết luận`, cho thử lại từng câu.

### 14.4. Stage 4 — RAG SGK (chi tiết ở §16)
- Mọi cảnh báo kiến thức phải kèm `citation {sách, lớp, chương, trang}` để GV tin.
- Filter `subject+grade+bookSeries` trước khi cosine → chống nhiễu liên môn.
- `RAG_TOP_K=3`, `RAG_MIN_SCORE=0.15` (tăng nếu nhiễu).

### 14.5. Stage 5 — AI cascade có điều kiện (chi tiết ở §15)
- Không gọi AI đại trà. Chỉ gọi khi: code không kết luận được, hoặc solver lệch đáp án,
  hoặc `confidence=thấp`, hoặc RAG mâu thuẫn đáp án GV.
- Solver mù (không nhìn đáp án GV) trước → Phản biện sau → Aggregator gắn
  `verification_method ∈ {rule, computed, llm-suggest}` + `confidence ∈ {thấp, vừa, cao}` (cấm % giả).

### 14.6. Stage 6 — Aggregator + Review + Report bán hàng
- `modules/aggregator/aggregator.js` gộp `rule + computed + rag + llm-suggest`,
  xếp `severity ∈ {blocker, review/warning, hint/info, ok}`.
- `GET results/report` trả `question_stats {total,with_issue,errors,warnings,infos,ok}`
  từ cùng findings đã lưu (`modules/stats/stats.js`) — FE đối chiếu khớp số này.
- Báo cáo E: `đã xác nhận / chưa xử lý / ổn + phạm vi & giới hạn + model dùng + trích dẫn SGK`
  → Sao chép + xuất DOCX để nộp tổ.
  **Lưu ý (12/10): `docx` CHƯA có trong `backend/package.json`** (hiện chỉ cors/dotenv/express/
  mammoth/multer/pdf-parse) → phải thêm dep + xử lý font tiếng Việt (task T20). README cũng đang
  ghi sai (nói có lucide, nhưng FE chỉ có react).

## 15. Plan AI tiết kiệm mà hiệu quả (budget <200k VNĐ/tháng, ~500–1000 câu)

### 15.1. Chốt: 2 tầng model + 2 vai logic, KHÔNG voting đa model song song
- Voting đa model (GPT + Claude + Gemini cùng câu) tốn 2–3x tiền mà pilot chưa cần;
  precision ≥60% ở Toán+Anh đạt được bằng `rule + 1 LLM + retry`.
- **Không dùng `gemini-2.0-flash`** (thế hệ cũ, giá $0.15/$0.60). Chốt 2 tầng:

| Tầng | Model | Giá (USD/1M in/out) | Khi nào gọi |
|------|-------|---------------------|-------------|
| Tầng 1 | `gemini-2.5-flash-lite` | $0.10 / $0.40 | Solver mù + Phản biện + review — **95% lưu lượng** |
| Tầng 2 | `gemini-3.8-flash` | $0.375 / $1.875 | Chỉ leo cho câu `blocker` chưa ngã ngũ, gọi **theo từng câu** |

| Vai | Dùng tầng | Khi nào gọi | Cách tiết kiệm |
|-----|-----------|-------------|----------------|
| Solver mù (giải không nhìn đáp án GV) | Tầng 1 | Code chưa kết luận + câu đủ dữ kiện + còn quota | 1 câu/lượt, temp 0.2, JSON schema (`validateSolverJSON`), `MAX_SOLVE_QUESTIONS=5` |
| Phản biện (argue) | Tầng 1 | Solver lệch đáp án GV hoặc confidence thấp hoặc RAG mâu thuẫn | `MAX_QUESTIONS=10`, hỏng JSON → retry 2 → fallback `llm-suggest/thấp` (`validateFindingJSON`) |
| Leo thang (khi GV bấm) | Tầng 2 | Câu `blocker` chưa được GV xác nhận | Gọi lẻ 1 câu, ghi model đã dùng vào báo cáo |
| Embedding | `gemini` (bắt buộc ở đường chính) | Luôn khi ingest/retrieve | Xem §16 — `hash` chỉ để test offline, không dùng để bán |

- **Prompt caching là khoản tiết kiệm lớn nhất**: cached input rẻ hơn ~90% ($0.01–0.04/1M).
  → Giữ `SYSTEM` prompt **tĩnh**, không nhét text động vào system; chỉ nhét citations/câu vào `user`.
- Env tương ứng: `LLM_MODEL=gemini-2.5-flash-lite`, `LLM_MODEL_STRONG=gemini-3.8-flash`,
  `LLM_PRICE_IN=0.10`, `LLM_PRICE_OUT=0.40` (giá tầng 2 đặt riêng, không trộn).
- Hiện `LLM_PRICE_IN/OUT=0` trong `.env.example` → `costOf()` luôn ra 0, tức **đang tiêu tiền mà không biết bao nhiêu**.
  Bắt buộc điền giá thật (task T18) nếu không thì số ở §15.2 chỉ là ước tính lý thuyết.

### 15.2. Chi phí theo quy mô (đơn giá ~6đ/câu, tầng 1)

Đơn giên thực tế: 1 câu ≈ **1.200 token vào + 300 token ra** (nội dung + 4 PA + ~3 đoạn SGK trích dẫn + lời giải).
`1.200 × $0.10/1M + 300 × $0.40/1M = $0.00024/câu ≈ 6đ/câu`.

| Quy mô | Câu AI-check/tháng | Chi AI/tháng |
|--------|--------------------|--------------|
| Test chất lượng (đo trên gold-set) | 100 | ~600đ |
| Pilot 3–5 GV | 1.000 | **~6.000đ** |
| 20 GV | 5.000 | ~30.000đ |
| 100 GV | 25.000 | ~150.000đ |
| 400 GV | 100.000 | ~600.000đ |

- Ngoài ra: embedding nạp SGK ~2.000đ **một lần** (xem §16); leo thang tầng 2 cho 10% câu blocker ≈ +30% (100 GV: ~+45.000đ).
- **Kết luận quan trọng: ngân sách 200k/tháng đủ tới ~150 GV.** Ràng buộc kinh tế **không nằm ở token** mà ở:
  1. Công bảo trì gold-set + sửa false positive (GV dùng vài lần rồi bỏ vì báo oan = mất khách).
  2. Bản quyền SGK khi mở bán rộng (xem cảnh báo §16).
  3. Máy chủ (~5–10$/tháng).
- Con số ở bảng là **ước tính lý thuyết**; sau pilot 2 tuần sẽ ghi đè bằng `cost_usd` đo thật (task T21).

### 15.3. Tại sao không chọn GPT/Claude làm chính ngay
- Đắt gấp 2–3x mà chất lượng review tiếng Việt KHTN phổ thông không cao hơn đủ để bù chi phí ở quy mô này.
- Hệ đã code `AIProvider` (`modules/llm/provider.js`: `solveBlind`, `counterArgue`,
  `withRetry`, `callLLM`) nên đổi model chỉ cần đổi env, không sửa pipeline.

### 15.4. Mô hình giá (chốt 12/10/2026): gói tháng KHÔNG giới hạn số câu

| Gói | Giá | Được gì |
|-----|-----|---------|
| Free | 0đ | 30 câu/tháng, chỉ `rule + SGK` (không giải AI chi tiết) → nhiều dòng "chưa thể kết luận" → thấy thiếu |
| Premium | đồng giá mỗi tháng | **Không giới hạn số câu**: giải mù AI + đối chiếu SGK có trích dẫn trang + check file PDF/DOCX + DOCX biên bản + tự luận |

- **Lý do chịu được "không giới hạn"**: 1 GV dùng 1.000 câu/tháng = 6.000đ; dùng 5.000 câu = 30.000đ — vẫn nằm trong giá thu. Nguy cơ lạm dụng thực tế rất thấp vì người dùng là GV, không phải bot.
- **Biện pháp chống lạm dụng** (đã có sẵn trong code): rate limit 30 req/phút · tối đa 50 câu/lần ·
  `LLM_MAX_QUESTIONS=10` câu AI mỗi lượt · nhóm câu dễ chỉ chạy rule không tốn token ·
  log `cost_usd` để phát hiện tài khoản lạm dụng · gắn `user_id` vào mọi log.
- **Rủi ro đã biết**: đối thủ dùng để bán lại dịch vụ → cần đăng nhập thật (hiện còn `CURRENT_USER = "demo-teacher"`, xem task T18) + giới hạn tài khoản.
- **Số tiền cần chốt giá**: KHÔNG đoán trước. Chờ `cost_usd` thật 2 tuần pilot (task T21) rồi mới đặt giá Premium.
- Free giữ 30 câu như phễu chuyển đổi (khung đã có sẵn ở §3: `monthly_quota`, `used_this_month`).

## 16. Plan RAG nạp kiến thức SGK (Kết nối tri thức, KHTN cấp 2-3 trước)

### 16.1. Phạm vi (theo lựa chọn: full đa môn nhưng ingest theo thứ tự)
1. Đợt 1: Vật Lý 10-11-12 + Hóa 10-11-12 (dễ sai công thức/đơn vị nhất, GV sẵn trả tiền).
2. Đợt 2: Sinh 10-12 + Toán 10-12 (bổ trợ nhóm T).
3. Đợt 3: Anh/Văn/Sử/Địa (chỉ gợi ý ngữ cảnh, không blocker đáp án).
- Mỗi đợt ~30–50 PDF chương. Không ingest full 12 lớp cùng lúc (nặng, nhiễu).

### 16.2. Pipeline ingest (đã có khung `modules/knowledge/`)
- `POST /api/textbooks` (buffer PDF/DOCX) → `ingestTextbook({buffer, meta})`:
  chunk 800–1200 ký tự, overlap ~15%, giữ `subject/grade/bookSeries/chapter/page`
  (`metadata.js`: `detectChapterMarks`, `chapterAt`, `estimatePage`, `bookMeta`).
- **Điều kiện bắt buộc (bổ sung 12/10 — vì plan cũ mô tả đẹp hơn code thật):**
  1. **Giới hạn riêng cho sách**: `BOOK_MAX_MB=30`, `BOOK_MAX_CHARS=300000`.
     Hiện `extract/extract.js` đặt `MAX_TEXT_CHARS = 20000` và `ingestTextbook` dùng chung
     `extractFromBuffer` → 1 chương SGK 30–60 trang (60k–150k ký tự) **chỉ còn ~20%**, phần còn lại bị bỏ.
     Sửa: cho `extractFromBuffer(buffer, {maxChars})`, đề thi giữ 20.000, sách dùng 300.000.
  2. **Chunk theo trang thật**: `pdf-parse` dùng `pagerender` để lấy `pages:[{page,text}]`;
     chunk không cắt qua trang. Giữ nguyên đường `text` phẳng cho **đề thi** (parser cần),
     chỉ bật `pages` khi **ingest sách** (tránh đổi thứ tự câu trắc nghiệm).
  3. **`page_source = real | estimated`**: chunk PDF → `real`; txt/docx không có trang → `estimated`
     (`metadata.js:estimatePage` chỉ dùng cho 2 loại sau). UI + báo cáo E **hiện nhãn tương ứng**
     để không bán trích dẫn sai lệch.
  4. **Embedding bắt buộc `gemini` ở đường chính**: `hashEmbed` chỉ là n-gram 2–4 (`embed.js:21-42`),
     không có ngữ nghĩa → "định luật II Newton" trượt với SGK "định luật II của Newton".
     `EMBED_PROVIDER=hash` chỉ dùng cho **test offline, cost 0**. Embedding rẻ hơn generation
     rất nhiều nên không có lý do tiết kiệm sai chỗ ở đây.
  5. **Hiệu năng**: `retrieve.js` hiện `SELECT` **toàn bộ** bảng `chunks` (kèm cột embedding)
     rồi mới filter trong JS; embedding lưu dạng **JSON string** (512 số/chunk).
     Với 20k chunks sẽ phải parse hàng trăm MB mỗi truy vấn → phá cam kết "<3 phút/10 câu".
     Sửa: lọc `subject/grade/book_series` **ngay trong SQL** (`idx_books_meta` đã có) và lưu
     embedding dạng **BLOB float32** (migration: đọc TEXT cũ → ghi BLOB; backup `data/soide.db` trước).
- Giới hạn an toàn: `EMBED_MAX_CHUNKS` và `EMBED_MAX_CHARS=200000` — nâng theo profile sách.
- Lưu chunk + vector + meta vào SQLite (pilot) → sau >50k chunks mới cân nhắc pgvector.

### 16.3. Retrieve khi chạy check
- `retrieve({query, subject, grade, bookSeries, topK=3, minScore=0.15})` (`retrieve.js`):
  build query từ `nội dung câu + PA + đáp án GV`, filter sách đúng lớp/bộ **trong SQL**,
  cosine sau, bỏ chunk < ngưỡng.
- Prompt Solver/Review được nhét tối đa 3 citations (`formatCitations`) → LLM phải dẫn
  `sách-trang` khi bác bỏ đáp án GV, nếu không dẫn được thì hạ confidence.
- Không tìm thấy RAG → ghi rõ `không có căn cứ SGK` thay vì bịa trang.

### 16.4. Cảnh báo bản quyền SGK (bắt buộc đọc trước khi mở bán rộng)
- Nạp PDF SGK (Kết nối tri thức) vào DB để cung cấp dịch vụ thương mại là **rủi ro pháp lý**:
  sách giáo dục do NXB giáo dục sở hữu quyền tác giả.
- **Pilot 3–5 GV, dùng nội bộ, không phát hành** → rủi ro thấp, chấp nhận được.
- **Mở bán rộng** → cần một trong: giấy phép/nội dung mở của NXB, hoặc chỉ trích dẫn ngắn
  kèm nguồn (không lưu và không phát tán toàn văn).
- Không quảng cáo "soi theo SGK" cho khách ngoài phạm vi tự luận đến khi đã xử lý xong mục này.

### 16.5. Nghiệm thu RAG
- `POST /api/textbooks` ingest 1 chương Lý 10 → `retrieve("định luật II Newton")`
  trả ≥2 citations đúng sách/trang, `page_source='real'` (`tests/knowledge.test.js` xanh).
- Đo thời gian `retrieve()` với 20k chunks: mục tiêu <300ms.
- Precision kiến thức đo trên gold-set có nhãn GV (xem §9), chưa có user thì ghi `dự kiến`.

## 17. Ma trận 2 dạng câu hỏi + task bổ sung

### 17.1. Trắc nghiệm vs tự luận

| Tiêu chí | Trắc nghiệm (`choice`) | Tự luận (`essay`) |
|----------|------------------------|-------------------|
| Code check | thiếu A-D, đáp án ngoài A-D, 2 PA paraphrase, PA dài lệch, sai số | thiếu barem, tổng điểm ≠10, thiếu động từ, đề 1 từ vô nghĩa |
| Solver | sandbox số + AI giải mù so đáp án → `blocker` nếu lệch | AI lập dàn ý/rubric + check thiếu dữ kiện; không chấm điểm tuyệt đối, bắt buộc `cần GV quyết` |
| RAG | đối chiếu định nghĩa/công thức SGK | đối chiếu khái niệm + gợi ý rubric theo chương SGK |
| Tỉ lệ gọi AI | ~40% câu (lệch/khó) | ~70% câu (khó code) → quota tính ×2 |
| Report | Chặn lại/Nên xem + đáp án đề xuất + diff | Cảnh báo thiếu rubric + đáp án mẫu + trích dẫn SGK |

### 17.2. Task bổ sung (đã bị thay bằng task có ngày ở §18.2)

Bản task cũ (không có ngày, trùng ID với §18.2) đã **bị thay thế** — xem §18.2 để có lịch khớp deadline 25/10:

| ID | Việc | Nghiệm thu |
|----|------|------------|
| (→ T14) | Ingest SGK KHTN Kết nối tri thức 10-12 | `retrieve` trả citation đúng trang |
| (→ T15) | Rules tự luận (barem, tổng điểm, động từ) + test | `npm test` thêm ~15 tests xanh |
| (→ T19) | Gate AI có điều kiện + log token/cost | E2E 10 câu <3 phút, hỏng JSON có fallback |
| (→ T20) | Report DOCX biên bản tổ + upsell quota | ≥1 GV thật quote "báo cáo này nộp tổ được" |

## 18. Rà soát plan ↔ code (cập nhật 12/10/2026) — 6 sai lệch đã biết

§13–17 mô tả hệ thống như đã có đủ 7 stage. Rà code thực tế cho thấy 6 chỗ **plan đẹp hơn code**,
phải sửa code (task T13–T20 ở §18.2) thì plan mới đúng.
Trạng thái cập nhật 12/10/2026: **T13, T14, T18 đã code xong** (xem §12.6) — còn T15/T16/T17 là
những khoảng trống nghiêm trọng nhất.

### 18.1. Sáu sai lệch (mức độ chặn)

| # | Plan nói | Code thật | Chặn? | Task | Trạng thái |
|---|----------|-----------|-------|------|-----------|
| 1 | §14: RAG là stage trong pipeline | `routes/checks.js` (`runCheck`) chạy rules → solver → LLM → aggregate, **không gọi `retrieve()`**. RAG chỉ chạy ở route phụ `/api/ai-review` và findings đó không vào `findings` của check → báo cáo E không thấy trích dẫn SGK | **Cao** | T17 | ❌ Chưa làm |
| 2 | §16: ingest 30–50 PDF chương | `extract/extract.js` đặt `MAX_TEXT_CHARS = 20000` và ingest dùng chung → chương SGK 60k–150k ký tự chỉ còn ~20% | **Cao** | T14 | ✅ Xong (profile `book`, 300k) |
| 3 | §13/§16: "trích dẫn SGK trang X" | `pdfExtractor` trả text phẳng + `numpages`; `estimatePage` nội suy theo tỉ lệ ký tự → số trang là ước lượng | **Cao** | T15 | ❌ Chưa (đã có cột `page_source` để đánh dấu) |
| 4 | §16: RAG phục vụ cả bộ SGK | `retrieve.js` kéo toàn bảng chunks rồi filter trong JS; embedding lưu JSON | **Cao** | T13 | ✅ Xong (lọc SQL, BLOB, 2 pha) |
| 5 | §15: `hash` embedding "0đ, đủ cho pilot" | `embed.js` chỉ n-gram 2–4 + bucket 512 chiều, không có ngữ nghĩa | Trung bình | T16 | ❌ Chưa (cần API key) |
| 6 | §13/§15.4: có paywall `QUOTA_EXCEEDED` | `createCheck` chỉ `used_this_month += N`, không so `monthly_quota`; `LLM_PRICE_IN/OUT=0` nên `costOf()` luôn 0 | **Cao** | T18 | ✅ Xong (402 + `upgrade_hint` + `ai_cost_log`) |

Ngoài ra: `docx` **chưa có** trong `backend/package.json` (chỉ cors/dotenv/express/mammoth/multer/pdf-parse)
→ §14.6 "xuất DOCX (`docx` đã có trong deps)" sai; README cũng sai (nói có lucide, FE chỉ có react).
`runCheck` gọi LLM **tuần tự** trong vòng lặp (`checks.js`) → đề 50 câu sẽ mất hàng phút dù §4 nói async/poll.
`aiReview/review.js` cắt còn `LLM_MAX_QUESTIONS=10` câu, phần còn lại vào `skipped` → phải hiện rõ
"N câu chưa kiểm tra AI" ở màn C + báo cáo E, không được hứa "kiểm cả đề".
`CURRENT_USER = "demo-teacher"` còn hardcode → chưa có đăng nhập thật, đây là rủi ro lạm dụng đã ghi ở §15.4.

### 18.2. Task T13–T22 (có ngày, deadline 25/10)

Task ở §17.2 đã ánh xạ vào bảng dưới: T13 (perf RAG), T14 (giới hạn sách), T15 (trang thật),
T16 (embedding gemini), T17 (RAG vào pipeline), T18 (paywall + đo chi phí), T19 (model 2 tầng),
T20 (DOCX), T21 (pilot đo thật), T22 (nộp).

| ID | Ngày | Việc | Nghiệm thu |
|----|------|------|-----------|
| T13 | 13–14/10 | Migration `chunks.embedding` → **BLOB float32** + bảng `citations` + `retrieve()` lọc SQL | `retrieve()` 20k chunks <300ms; `knowledge.test.js` xanh; backup `data/soide.db` trước khi migrate |
| T14 | 14–15/10 | Profile giới hạn sách `BOOK_MAX_MB=30`, `BOOK_MAX_CHARS=300000`; `extractFromBuffer({maxChars})` | Ingest 1 chương Lý 10 thật → `truncated:false`, `chunk_count` 150–400 |
| T15 | 15–16/10 | pdf per-page thật (`pagerender`) + chunk theo trang + cột `page_source` | Chunk ở trang 2 → `page=2, page_source='real'`; đường parse đề thi không đổi hành vi |
| T16 | 16–17/10 | Bật `EMBED_PROVIDER=gemini`; `hash` chỉ còn đường test | Test dùng mock engine; ghi chi phí embedding nạp 1 bộ sách vào nhật ký |
| T17 | 17–18/10 | **RAG vào `runCheck`** + citations gắn vào findings + màn C + báo cáo E | `GET results` trả `citations[]`; báo cáo in "SGK tr.X — Chương Y (trang thật/ước lượng)" |
| T18 | 18–19/10 | **Paywall**: chặn `monthly_quota` → `QUOTA_EXCEEDED` + `upgrade_hint`; thêm `used_ai_this_month`, `tokens_in/out`, `cost_usd`; `/me` trả `quota_left` | Free vượt quota → 402 kèm `upgrade_hint`; FE hiện banner upsell; điền `LLM_PRICE_IN/OUT` thật |
| T19 | 19–20/10 | Model 2 tầng + escalation `strong` theo từng câu + hiện "N câu chưa kiểm tra AI" | Chuyển `LLM_MODEL` qua `.env` là đổi được cả tầng; báo cáo ghi model đã dùng |
| T20 | 20–21/10 | Xuất DOCX biên bản (thêm dep `docx`) | File Word mở ra: tiếng Việt đúng dấu, có bảng cảnh báo + citations + scope note + decisions_log |
| T21 | 21–23/10 | E2E + thử GV thật + **đo `cost_usd` thật 2 tuần** | Bảng precision/recall + **đơn giá thực/câu** → ghi đè §15.2 → chốt giá Premium (§15.4) |
| T22 | 24–25/10 | Đệm, quay demo 90s, chụp ảnh B→C→E | Nộp link BTC trước 20h 25/10 |

Thứ tự ràng buộc: T13 → T14 → T15 → T17 (RAG chỉ đáng giá khi trang thật + không cắt sách + không chết perf).
T18–T20 độc lập nhau, làm song song nếu còn nhân sự. T21 là cổng quyết định giá.
