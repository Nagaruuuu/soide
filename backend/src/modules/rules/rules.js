// Rules lõi chung + theo nhóm môn (không tốn token). Nhóm H chỉ gợi ý.
const VAGUE = [/có thể/i, /một số/i, /hầu hết/i, /tất cả đều đúng/i, /tất cả các đáp án/i];
const DOUBLE_NEG = [/không\s+.*\bkhông\b/i, /chưa\s+.*\bchưa\b/i, /không phải là không/i, /không\s+không/i];
const MISSING_MEDIA = [/hình (vẽ|dưới|trên|bên)/i, /đồ thị/i, /bảng số liệu/i, /đoạn trích/i, /hình vẽ kèm theo/i, /như hình/i];
const MISSING_CTX_H = [/năm nào/i, /thời (gian|kì|kỳ)/i, /ở đâu/i, /tác giả/i, /nguồn/i];
const EN_TENSE = [/\b(is|are|was|were|has|have|had)\b/i];

function norm(s = "") {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function cosineTokens(a, b) {
  const ta = norm(a).split(" ").filter(Boolean), tb = norm(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const fa = {}, fb = {};
  for (const w of ta) fa[w] = (fa[w] || 0) + 1;
  for (const w of tb) fb[w] = (fb[w] || 0) + 1;
  let dot = 0;
  for (const w in fa) if (fb[w]) dot += fa[w] * fb[w];
  const na = Math.sqrt(Object.values(fa).reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(Object.values(fb).reduce((s, x) => s + x * x, 0));
  return na && nb ? dot / (na * nb) : 0;
}

// Từ khóa nháp / dummy / thử nghiệm
const DUMMY_KEYWORDS = /\b(test|testing|abcd|asdf|qwerty|xyz|dummy|placeholder|sample|demo)\b/i;

// Phương án dummy phổ biến (lặp âm, placeholder vô nghĩa như HI, HA, HO, HU, aaa, bbb)
const DUMMY_OPTS_PATTERN = /^(hi|ha|ho|hu|bla|xxx|aaa|bbb|ccc|ddd|test|abcd)$/i;

// Dấu hỏi đặt ở đầu câu
const QUESTION_MARK_LEADING = /^\s*[\?？]/;

// Từ nghi vấn đặc trưng tiếng Việt
const INTERROGATIVE_WORDS = /(là gì|ở đâu|khi nào|bao nhiêu|ai|tại sao|vì sao|thế nào|như thế nào|phải không|mấy|nào)/i;

export function shannonEntropy(str = "") {
  const s = String(str || "").replace(/\s+/g, "").toLowerCase();
  if (!s.length) return 0;
  const freq = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  let ent = 0;
  for (const c in freq) {
    const p = freq[c] / s.length;
    ent -= p * Math.log2(p);
  }
  return ent;
}

export function dupSimilarity(a, b) { return cosineTokens(a, b); }

export function runRules(q, check = {}, siblings = []) {
  const out = [];
  const push = (severity, category, evidence, fix_suggestion, verification_method = "rule", confidence = "cao") =>
    out.push({ severity, category, evidence, fix_suggestion, verification_method, confidence, expected_answer: q.expected_answer, suggested_answer: "" });

  if (!q.opt_a || !q.opt_b || !q.opt_c || !q.opt_d)
    push("blocker", "thieu_thanh_phan", "Thiếu một hoặc nhiều phương án A/B/C/D.", "Bổ sung đủ 4 phương án trước khi kiểm tiếp.");
  // Đề không kèm đáp án (check.has_answer === 0): không báo thiếu, chỉ ghi nhận info
  const wantAnswer = check.has_answer == null || Number(check.has_answer) !== 0;
  if (!q.expected_answer) {
    if (wantAnswer)
      push("review", "thieu_dap_an", "Chưa nhập đáp án dự kiến nên không đối chiếu được.", "Nhập đáp án A/B/C/D dự kiến.", "rule", "vừa");
    else
      push("info", "khong_kem_dap_an", "Đề không kèm đáp án — chỉ soi cấu trúc, AI sẽ gợi ý đáp án.", "Bật gợi ý đáp án ở bước chạy để nhận đề xuất.", "rule", "vừa");
  }
  const content = q.content || "";
  const trimmed = content.trim();

  // 1. Kiểm tra cú pháp dấu hỏi '?'
  if (QUESTION_MARK_LEADING.test(content)) {
    push("review", "dau_hoi_sai_vi_tri", "Dấu hỏi '?' bị đặt ở đầu câu hoặc sai vị trí cú pháp.", "Di chuyển dấu hỏi '?' về cuối câu hỏi.", "rule", "cao");
  } else if (INTERROGATIVE_WORDS.test(content) && !/[\?？]\s*$/.test(content)) {
    push("review", "thieu_dau_hoi", "Câu chứa từ nghi vấn nhưng cuối câu thiếu dấu '?'.", "Thêm dấu hỏi chấm '?' vào cuối câu hỏi.", "rule", "cao");
  } else if (!/[\?？]\s*$/.test(content) && !/(chọn|điền|tính|tìm|nào sau đây|đúng|sai)/i.test(content)) {
    push("hint", "cau_chu", "Câu hỏi chưa có dấu hỏi hoặc động từ yêu cầu rõ ràng.", "Thêm yêu cầu: '... là gì? / Chọn đáp án đúng.'", "rule", "vừa");
  }

  // 2. Kiểm tra độ dài câu hỏi & nội dung quá ngắn
  if (trimmed.length > 0 && trimmed.length < 10 && !/^\d+\s*[\+\-\*\/]\s*\d+/.test(trimmed)) {
    push("review", "cau_qua_ngan", `Câu hỏi quá ngắn (${trimmed.length} ký tự), nghi ngờ là văn bản nháp chưa hoàn thiện.`, "Bổ sung đầy đủ nội dung câu dẫn và câu hỏi.", "rule", "cao");
  }

  // 3. Kiểm tra từ khóa nháp / test placeholder
  if (DUMMY_KEYWORDS.test(content)) {
    push("review", "tu_khoa_test", "Nội dung câu hỏi chứa từ khóa nháp / thử nghiệm ('test', 'dummy', 'abcd'...).", "Thay thế bằng nội dung đề thi chính thức.", "rule", "cao");
  }

  // 4. Thuật toán Shannon Entropy (phát hiện chuỗi lặp / spam / vô nghĩa)
  if (trimmed.length >= 12) {
    const ent = shannonEntropy(trimmed);
    if (ent < 1.8) {
      push("review", "entropy_thap", `Độ hỗn loạn thông tin cực thấp (Shannon Entropy = ${ent.toFixed(2)}) — nghi ngờ gõ lặp ký tự hoặc văn bản vô nghĩa.`, "Viết lại nội dung câu hỏi có nghĩa.", "rule", "cao");
    }
  }

  // 5. Kiểm tra phương án dummy / quá ngắn
  const rawOpts = [q.opt_a, q.opt_b, q.opt_c, q.opt_d].map((s) => String(s || "").trim());
  const dummyOptsCount = rawOpts.filter((s) => DUMMY_OPTS_PATTERN.test(s)).length;
  if (dummyOptsCount >= 3) {
    push("review", "phuong_an_dummy", "Các phương án có dấu hiệu gõ thử / placeholder (ví dụ: HI, HA, HO, HU, test...).", "Nhập các phương án câu hỏi thực tế.", "rule", "cao");
  } else {
    const nonNumShort = rawOpts.filter((s) => s.length > 0 && s.length <= 2 && /^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+$/.test(s) && !/^\d+$/.test(s));
    if (nonNumShort.length === 4) {
      push("hint", "phuong_an_qua_ngan", "Các phương án đều rất ngắn (1-2 chữ cái), nghi ngờ chưa hoàn thiện nội dung.", "Bổ sung nội dung chi tiết cho các phương án.", "rule", "vừa");
    }
  }

  for (const re of DOUBLE_NEG) {
    if (re.test(content)) { push("review", "phu_dinh_kep", `Câu chứa phủ định kép ("${re.source}") — HS dễ hiểu nhầm.`, "Viết lại khẳng định hoặc chỉ giữ 1 phủ định.", "rule", "vừa"); break; }
  }
  for (const re of VAGUE) {
    if (re.test(content)) { push("review", "mo_ho", `Cụm từ gây mơ hồ: "${re.source}" — mỗi GV/HS có thể hiểu khác nhau.`, "Viết lại cụ thể, tránh từ mơ hồ.", "rule", "vừa"); break; }
  }
  for (const re of MISSING_MEDIA) {
    if (re.test(content)) { push("review", "thieu_du_kien", "Câu nhắc tới hình/đồ thị/bảng nhưng đề dán thiếu dữ kiện kèm theo.", "Bổ sung hình hoặc mô tả dữ kiện đầy đủ."); break; }
  }
  // dài câu bất thường
  if (content.length > 400)
    push("hint", "cau_dai", `Câu hỏi dài ${content.length} ký tự — HS dễ nản, nguy cơ thừa dữ kiện.`, "Tách ý hoặc rút gọn đề.", "rule", "vừa");
  const lens = [q.opt_a, q.opt_b, q.opt_c, q.opt_d].map((s) => (s || "").length);
  if (Math.max(...lens) > 0 && Math.max(...lens) > 3 * (Math.min(...lens.filter(Boolean)) || 1))
    push("hint", "leech_do_dai", "Một phương án dài bất thường — HS dễ đoán mẹo.", "Cân bằng độ dài các phương án.", "rule", "vừa");
  if (/đơn vị|tính .* (m|kg|s|mol|lít)/i.test(content) && !/(m|kg|s|mol|cm|km\/h)\b/i.test([q.opt_a, q.opt_b, q.opt_c, q.opt_d].join(" ") + " " + content))
    push("review", "thieu_don_vi", "Câu tính toán nhưng chưa thấy đơn vị rõ ràng.", "Bổ sung đơn vị cho số liệu và đáp án.", "rule", "vừa");
  // trùng lặp trong cùng lần kiểm tra (cosine >= 0.88)
  for (const s of siblings) {
    if (!s || s === q) continue;
    if (s.id && q.id && s.id === q.id) continue;
    const sim = cosineTokens(content, s.content || "");
    if (sim >= 0.88) { push("review", "trung_lap", `Câu gần giống câu khác (độ giống ~${Math.round(sim * 100)}%) — nguy cơ trùng đề.`, "Giữ 1 câu, viết lại hoặc bỏ câu còn lại.", "rule", "vừa"); break; }
  }

  const group = check.group_kind || "H";
  if (group === "N") {
    // Anh/Tin cơ bản: mạo từ + hòa hợp số ít/nhiều/ip
    if (/tiếng anh|tieng anh|english/i.test(check.subject || "") || EN_TENSE.some((re) => re.test(content + " " + [q.opt_a, q.opt_b, q.opt_c, q.opt_d].join(" ")))) {
      if (/\b(a|an|the)\s+\1\b/i.test(content)) push("review", "en_article", "Lặp mạo từ a/an/the — kiểm tra lại ngữ pháp.", "Sửa mạo từ cho đúng.", "rule", "vừa");
    }
    if (/(is|was|has)\s+\w*s\b/i.test(content + " " + q.content)) push("hint", "en_agreement", "Nghi ngờ hòa hợp chủ-vị số ít/nhiều.", "Kiểm tra lại thì và số.", "rule", "thấp");
  }
  if (group === "H") {
    // chỉ báo thiếu ngữ cảnh ở mức gợi ý
    if (!MISSING_CTX_H.some((re) => re.test(content)) && /(năm|thời|ở đâu|ai|tác phẩm|trận|triều)/i.test(content))
      push("hint", "thieu_ngu_canh", "Câu nhận định thiếu mốc thời gian/địa điểm/nguồn trích rõ ràng.", "Bổ sung ngữ cảnh: thời gian, địa điểm, nguồn.", "rule", "thấp");
  }
  if (out.length === 0) push("ok", "on", "Chưa phát hiện vấn đề trong phạm vi rules lõi chung.", "", "rule", "vừa");
  return out;
}

