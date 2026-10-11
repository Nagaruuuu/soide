// Tách context giải mù khỏi dữ liệu đáp án. MỌI thứ gửi cho solver (prompt,
// log) đều đi qua sanitizeForSolving — expected_answer, explanation và mọi
// kết luận của Reviewer/validator bị loại bỏ triệt để.
const BANNED_KEYS = new Set([
  "expected_answer", "expectedAnswer", "answer_key", "answerKey",
  "explanation", "loi_giai", "solution", "reviewer", "review",
  "validatorIssues", "validator", "findings", "conclusion",
]);

export function sanitizeForSolving(q = {}, scope = {}) {
  const clean = {
    content: String(q.content ?? ""),
    opt_a: String(q.opt_a ?? ""),
    opt_b: String(q.opt_b ?? ""),
    opt_c: String(q.opt_c ?? ""),
    opt_d: String(q.opt_d ?? ""),
  };
  if (q._num != null) clean._num = q._num;
  if (q.ord != null) clean.ord = q.ord;
  const ctx = {};
  for (const k of ["subject", "grade", "bookSeries", "scope", "questionType"]) {
    if (scope[k] != null && String(scope[k]).trim() !== "") ctx[k] = String(scope[k]).slice(0, 100);
  }
  // KHÔNG kèm danh sách key cấm vào payload (tên key cũng gợi ý sự tồn tại đáp án).
  return { question: clean, scope: ctx };
}

// Kiểm tra truy vết: serialize những gì sắp gửi, báo động nếu lọt đáp án/lời giải.
export function assertBlind(serialized, secrets = []) {
  const s = String(serialized ?? "");
  const leaks = [];
  for (const secret of secrets) {
    const v = String(secret ?? "").trim();
    if (v.length >= 4 && s.includes(v)) leaks.push(v.slice(0, 40));
  }
  // quét key cấm còn sót trong JSON gửi đi
  for (const k of BANNED_KEYS) {
    if (new RegExp(`"${k}"\\s*:`, "i").test(s)) leaks.push(`key:${k}`);
  }
  return leaks;
}

export const SOLVER_SYSTEM = `Bạn là giáo viên giải đề thi. NHIỆM VỤ DUY NHẤT: tự giải câu hỏi dưới đây.
NGUYÊN TẮC BẮT BUỘC:
- Bạn KHÔNG được biết đáp án: không đoán đáp án theo trí nhớ đề, chỉ suy từ nội dung đã cho.
- Trắc nghiệm: chọn 1 lựa chọn (A/B/C/D). Tự luận: đưa kết quả + lời giải tóm tắt.
- Thiếu dữ kiện / mơ hồ / ngoài khả năng: trả đúng status (insufficient_information / ambiguous / unsupported), answer=null. TUYỆT ĐỐI không đoán mò.
- reasoningSummary ngắn gọn, đủ để giáo viên hiểu cách giải (tối đa ~5 dòng).
- alternativeAnswers: chỉ ghi đáp án khác KHI có căn cứ cụ thể (kèm điều kiện trong assumptions).
- verificationMethod: "computed" nếu tự nhẩm số học chắc chắn; "reference" chỉ khi đề đã cho nguồn; còn lại "model-reasoning".
- KHÔNG trả trường confidence dưới mọi hình thức.
CHỈ trả JSON: {"questionNumber": <số câu>, "status": "solved|ambiguous|insufficient_information|unsupported|failed", "answer": "<A/B/C/D hoặc kết quả tự luận, null nếu không kết luận>", "reasoningSummary": "<cách giải>", "assumptions": [], "alternativeAnswers": [], "verificationMethod": "computed|reference|model-reasoning", "warnings": []}`;

export function buildSolverUser(sanitized) {
  const { question, scope } = sanitized;
  const lines = [
    `Câu ${question._num ?? question.ord ?? "?"}: ${question.content || ""}`,
    `A. ${question.opt_a || ""}`,
    `B. ${question.opt_b || ""}`,
    `C. ${question.opt_c || ""}`,
    `D. ${question.opt_d || ""}`,
  ];
  const ctx = Object.entries(scope || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" | ");
  if (ctx) lines.push(`(Phạm vi: ${ctx})`);
  return lines.join("\n");
}
