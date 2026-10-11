// Số học xác minh được bằng code: biểu thức số thuần, tổng điểm, tổng số câu.
// Có chữ cái/biến/điều kiện ("nếu", "tìm x", căn/log/phân số chữ) -> bỏ qua và
// ghi skippedChecks. Không tự tính bài toán phức tạp.

function issue(ruleId, severity, questionNumber, message, evidence, suggestion) {
  return { ruleId, severity, questionNumber, message, evidence, suggestion };
}

function optNumber(v) {
  if (v == null) return null;
  const m = String(v).replace(",", ".").match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Chỉ đánh giá chuỗi thuần số + +-*/()%^. Có chữ/căn/biến -> null (không đủ chắc).
export function safeArithEval(expr = "") {
  const s = String(expr ?? "").trim().replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "**").replace(/(?<![A-Za-z])x(?![A-Za-z])/g, "*");
  if (!s || /[A-Za-zÀ-ỹ=<>√∫∑]/.test(s)) return null;
  if (!/^[\d\s.+*\/%()\-]+$/.test(s)) return null;
  if (!/\d/.test(s) || !/[+*\/%()\-]/.test(s)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict"; return (${s});`)();
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function findPureExpr(content = "") {
  const c = String(content ?? "");
  // Dạng 1: số đứng TRƯỚC từ khóa — "8 + 4 bằng bao nhiêu?" / "Tính 2+3*4".
  let m = c.match(/([\d][\d\s.+*\/%()x×÷^\-]{1,60}?)\s*(?:bằng bao nhiêu|tính|kết quả|giá trị|=|bằng)\b/i);
  if (m) return m[1].trim();
  // Dạng 2: từ khóa trước số — "...bằng bao nhiêu: 2+3".
  m = c.match(/(?:bằng bao nhiêu|tính|kết quả|giá trị|bằng)[^\d\-+]*([\d][\d\s.+*\/%()x×÷^\-]+)/i);
  if (m) return m[1].trim();
  return null;
}

// EXPR_CHECK: đáp án số không khớp biểu thức thuần. Chỉ so khi: tìm được biểu
// thức thuần, mọi lựa chọn đều là số, và đáp án GV là 1 nhãn. Còn lại -> skip.
export function checkArithmetic(questions = []) {
  const issues = [];
  const skipped = [];
  questions.forEach((q, i) => {
    const num = q._num ?? i + 1;
    const expr = findPureExpr(q.content);
    if (!expr) return; // không phải câu số thuần -> không thuộc rule này
    const value = safeArithEval(expr);
    if (value == null) {
      skipped.push({ check: "EXPR_CHECK", questionNumber: num, reason: `Biểu thức "${expr.slice(0, 40)}" lẫn chữ/biến nên không tính mò.` });
      return;
    }
    const vals = { A: optNumber(q.opt_a), B: optNumber(q.opt_b), C: optNumber(q.opt_c), D: optNumber(q.opt_d) };
    if (Object.values(vals).some((v) => v == null)) {
      skipped.push({ check: "EXPR_CHECK", questionNumber: num, reason: "Lựa chọn không thuần số nên không đối chiếu." });
      return;
    }
    const match = Object.entries(vals).find(([, v]) => Math.abs(v - value) < 1e-9);
    const gv = String(q.expected_answer ?? "").trim().toUpperCase();
    if (!gv) return; // thiếu đáp án do ANS_MISSING xử lý
    if (!match) {
      issues.push(issue("EXPR_CHECK", "needs_review", num,
        `Máy tính ra ${value} nhưng không khớp lựa chọn nào.`,
        `Biểu thức "${expr}" = ${value}; A=${vals.A} B=${vals.B} C=${vals.C} D=${vals.D}.`,
        "Kiểm tra lại số liệu đề hoặc các lựa chọn."));
    } else if (match[0] !== gv) {
      issues.push(issue("EXPR_CHECK", "error", num,
        `Đáp án GV (${gv}) khác kết quả tính lại (${match[0]} = ${value}).`,
        `Biểu thức "${expr}" = ${value}, khớp lựa chọn ${match[0]}.`,
        `Đổi đáp án sang ${match[0]} hoặc sửa lại số liệu nếu đề cố ý bẫy.`));
    }
  });
  return { issues, skipped };
}

// SCORE_SUM (error): tổng điểm từng câu != tổng công bố. scores: {num: điểm}.
// COUNT_MATCH (error/warning): số câu != số công bố.
export function checkTotals({ questions = [], scores = null, expectedTotal = null, expectedCount = null } = {}) {
  const issues = [];
  const skipped = [];
  if (expectedCount != null && Number.isFinite(Number(expectedCount))) {
    if (questions.length !== Number(expectedCount)) {
      issues.push(issue("COUNT_MATCH", "error", null,
        `Số câu tách được (${questions.length}) khác số công bố (${expectedCount}).`,
        `Tách được ${questions.length}/${expectedCount} câu.`,
        "Kiểm tra câu bị dính/chia nhầm hoặc sửa số công bố."));
    }
  } else {
    skipped.push({ check: "COUNT_MATCH", reason: "Không có số câu công bố (expectedCount) nên không đối chiếu." });
  }
  if (scores && expectedTotal != null && Number.isFinite(Number(expectedTotal))) {
    let sum = 0, bad = [];
    for (const q of questions) {
      const n = q._num;
      const s = scores[n];
      if (s == null || !Number.isFinite(Number(s))) { bad.push(n); continue; }
      sum += Number(s);
    }
    if (bad.length) {
      skipped.push({ check: "SCORE_SUM", reason: `Thiếu điểm các câu ${bad.slice(0, 10).join(", ")}${bad.length > 10 ? "…" : ""} nên không cộng tổng.` });
    } else if (Math.abs(sum - Number(expectedTotal)) > 1e-9) {
      issues.push(issue("SCORE_SUM", "error", null,
        `Tổng điểm từng câu (${sum}) khác tổng công bố (${expectedTotal}).`,
        `Cộng ${questions.length} câu được ${sum}, công bố ${expectedTotal}.`,
        "Rà lại điểm từng câu hoặc tổng công bố."));
    }
  } else {
    skipped.push({ check: "SCORE_SUM", reason: "Thiếu bảng điểm từng câu hoặc tổng công bố nên không cộng tổng." });
  }
  return { issues, skipped };
}
