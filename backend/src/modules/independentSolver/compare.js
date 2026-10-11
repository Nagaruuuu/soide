// Đối chiếu đáp án: interface RIÊNG, chạy SAU khi giải xong, không trộn vào solver.
// mismatch = "khác nhau", KHÔNG kết luận đáp án nào đúng. null/mơ hồ -> needs_review.

function normLetter(s) {
  const t = String(s ?? "").trim().toUpperCase();
  return /^[A-F]$/.test(t) ? t : null;
}

export function compareSolution(solution = {}, expectedAnswer = "") {
  const num = solution.questionNumber ?? null;
  const base = { questionNumber: num };
  if (solution.status === "failed") {
    return { ...base, verdict: "needs_review", reason: "Giải độc lập lỗi kỹ thuật nên chưa có gì để đối chiếu." };
  }
  if (solution.status !== "solved" || solution.answer === null) {
    return { ...base, verdict: "needs_review", reason: `Trạng thái giải: ${solution.status} — chưa đủ cơ sở đối chiếu.` };
  }
  const expRaw = String(expectedAnswer ?? "").trim();
  if (!expRaw) {
    return { ...base, verdict: "needs_review", reason: "Đề không có đáp án dự kiến để đối chiếu." };
  }
  const gv = normLetter(expRaw);
  const ai = normLetter(solution.answer);
  if (ai && gv) {
    if (ai === gv) {
      return { ...base, verdict: "match", independentAnswer: ai, expectedAnswer: gv, reason: "Đáp án độc lập trùng đáp án dự kiến." };
    }
    return {
      ...base,
      verdict: "mismatch",
      independentAnswer: ai,
      expectedAnswer: gv,
      reason: `Đáp án độc lập (${ai}) khác đáp án dự kiến (${gv}) — chưa kết luận bên nào đúng, cần GV kiểm tra ${solution.verificationMethod === "computed" ? "phép tính" : "lập luận"}.`,
    };
  }
  // Đáp án chữ/tự luận (vd "42"): so chuỗi chuẩn hóa; khác -> GV đối chiếu mắt.
  const same = String(solution.answer ?? "").trim().toLowerCase() === expRaw.toLowerCase();
  return same
    ? { ...base, verdict: "match", independentAnswer: solution.answer, expectedAnswer: expRaw, reason: "Đáp án độc lập trùng đáp án dự kiến." }
    : { ...base, verdict: "needs_review", independentAnswer: solution.answer, expectedAnswer: expRaw, reason: "Đáp án khác chữ — cần GV đối chiếu bằng mắt." };
}
