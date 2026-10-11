// Đáp án: thiếu (chỉ error khi hasAnswerKey=true, ngược lại skip ghi rõ lý do),
// sai lệch khỏi tập lựa chọn (error), dạng lạ — needs_review, không đoán.
import { contentBlocks, blockNumber } from "../blocks.js";

function issue(ruleId, severity, questionNumber, message, evidence, suggestion) {
  return { ruleId, severity, questionNumber, message, evidence, suggestion };
}

function presentLabels(q) {
  const keys = { A: "opt_a", B: "opt_b", C: "opt_c", D: "opt_d", E: "opt_e", F: "opt_f" };
  return Object.entries(keys)
    .filter(([, k]) => q[k] != null && String(q[k]).trim() !== "")
    .map(([l]) => l);
}

function lettersOf(ans) {
  return String(ans ?? "").toUpperCase().replace(/[^A-Z]/g, "").split("");
}

// ANS_MISSING: thiếu đáp án khi đề được cho biết là có đáp án.
export function checkMissingAnswers(questions = [], { hasAnswerKey = false } = {}) {
  const issues = [];
  const skipped = [];
  if (!hasAnswerKey) {
    skipped.push({ check: "ANS_MISSING", reason: "Không rõ đề có kèm đáp án (hasAnswerKey=false) nên không kết luận thiếu." });
    return { issues, skipped };
  }
  questions.forEach((q, i) => {
    const num = q._num ?? i + 1;
    if (!String(q.expected_answer ?? "").trim()) {
      issues.push(issue("ANS_MISSING", "error", num,
        "Câu không có đáp án trong khi đề được cho biết có đáp án.",
        "Không tách được đáp án A–F cho câu này.",
        "Bổ sung đáp án hoặc kiểm tra đáp án có nằm file/bảng riêng không."));
    }
  });
  return { issues, skipped };
}

// ANS_INVALID: đáp án ngoài tập lựa chọn (vd E khi chỉ có A-D).
// Dạng nhiều đáp án/Đ-S mà parser không tách được -> needs_review.
export function checkAnswerValidity(questions = [], { questionType = "single" } = {}) {
  const issues = [];
  questions.forEach((q, i) => {
    const num = q._num ?? i + 1;
    const raw = String(q.expected_answer ?? "").trim();
    if (!raw) return; // do ANS_MISSING xử lý
    const labels = presentLabels(q);
    if (questionType === "essay") return;
    if (questionType === "true_false") {
      // Đáp án Đ/S không nằm trong A-F: chấp nhận, chỉ kiểm khi là 1 chữ cái A-F
      if (/^[A-F]$/i.test(raw) && labels.length && !labels.includes(raw.toUpperCase())) {
        issues.push(issue("ANS_INVALID", "error", num,
          `Đáp án ${raw.toUpperCase()} không thuộc các lựa chọn hiện có (${labels.join("/")}).`,
          `Đáp án: ${raw}; lựa chọn có nội dung: ${labels.join(", ") || "không có"}.`,
          "Sửa đáp án cho khớp nhãn lựa chọn."));
      }
      return;
    }
    const letters = lettersOf(raw);
    if (!letters.length) {
      issues.push(issue("ANS_INVALID", "needs_review", num,
        "Đáp án ở dạng chưa đọc được (không phải chữ cái A–F).",
        `Đáp án ghi nhận: "${raw}".`,
        "Kiểm tra bằng mắt: đáp án có thể ở dạng Đúng/Sai hoặc tự luận."));
      return;
    }
    if (questionType === "single" && letters.length > 1) {
      issues.push(issue("ANS_INVALID", "needs_review", num,
        "Đáp án có nhiều hơn 1 lựa chọn trong khi loại câu là một đáp án.",
        `Đáp án ghi nhận: "${raw}".`,
        "Xác nhận: đề nhiều đáp án thật (đổi questionType=multi) hay gõ thừa."));
      return;
    }
    for (const L of new Set(letters)) {
      if (!labels.includes(L)) {
        issues.push(issue("ANS_INVALID", "error", num,
          `Đáp án ${L} không thuộc các lựa chọn hiện có${labels.length ? ` (${labels.join("/")})` : ""}.`,
          `Đáp án: ${raw}; lựa chọn có nội dung: ${labels.join(", ") || "không có"}.`,
          "Sửa đáp án hoặc bổ sung lựa chọn còn thiếu."));
        break;
      }
    }
  });
  return issues;
}

// Quét đáp án trên TEXT THÔ theo từng block — bắt được cái parser làm rơi:
// đáp án E ngoài A-D, nhiều đáp án, đáp án Đ/S ("Đáp án: E" không khớp regex
// [A-D] của parser nên expected_answer trống). Không trùng báo với check
// trên expected_answer vì hai nguồn thấy hai thứ khác nhau.
export function checkRawAnswers(examText = "", { questionType = "single", hasAnswerKey = false } = {}) {
  const issues = [];
  if (questionType === "essay" || !String(examText ?? "").trim()) return issues;
  const blocks = contentBlocks(examText);
  blocks.forEach((block, bi) => {
    const num = blockNumber(block, bi + 1);
    const labels = new Set();
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (!t || /^(đáp án|dap an|answer|lời giải|loi giai)/i.test(t)) continue;
      const lm = t.match(/^[(（]?([A-Za-z])[)）.\-:)\]]\s*(.*)$/);
      if (lm && /^[A-Fa-f]$/.test(lm[1]) && (lm[2] || "").trim()) labels.add(lm[1].toUpperCase());
    }
    const am = block.match(/^(đáp án|dap an|answer)\s*[:\-]?\s*(.+)$/im);
    if (!am) return; // không ghi đáp án trong block: do ANS_MISSING xử lý
    const letters = String(am[2]).toUpperCase().replace(/[^A-Z]/g, "").split("");
    if (!letters.length) {
      if (hasAnswerKey) {
        issues.push(issue("ANS_INVALID", "needs_review", num,
          "Dòng đáp án không đọc được chữ cái nào.",
          `Dòng đáp án: "${am[0].trim().slice(0, 80)}".`,
          "Kiểm tra bằng mắt: đáp án có thể ở dạng câu chữ."));
      }
      return;
    }
    if (questionType === "single" && new Set(letters).size > 1) {
      issues.push(issue("ANS_INVALID", "needs_review", num,
        "Đáp án liệt kê nhiều lựa chọn trong khi loại câu là một đáp án.",
        `Đáp án ghi: "${am[2].trim().slice(0, 60)}".`,
        "Xác nhận: đề nhiều đáp án thật (đổi questionType=multi) hay gõ thừa."));
      return;
    }
    for (const L of new Set(letters)) {
      if (!labels.has(L)) {
        issues.push(issue("ANS_INVALID", "error", num,
          `Đáp án ${L} không thuộc các lựa chọn của câu (${[...labels].join("/") || "không rõ"}).`,
          `Đáp án ghi: "${am[2].trim().slice(0, 60)}".`,
          "Sửa đáp án cho khớp nhãn lựa chọn."));
        break;
      }
    }
  });
  return issues;
}
