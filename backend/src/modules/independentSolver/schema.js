// Schema lời giải độc lập. Không có confidence (chưa hiệu chỉnh thì không bịa).
export const SOLVE_STATUS = [
  "solved", // giải ra đáp án xác định
  "ambiguous", // mơ hồ / nhiều cách hiểu
  "insufficient_information", // thiếu dữ kiện
  "unsupported", // ngoài phạm vi model (công thức/hình phức tạp...)
  "failed", // lỗi kỹ thuật (timeout, API, JSON hỏng sau retry)
];

export const VERIFICATION_METHODS = ["computed", "reference", "model-reasoning"];

function isLetter(s) {
  return typeof s === "string" && /^[A-Fa-f]$/.test(s.trim());
}

export function validateSolution(o) {
  const ok = o && typeof o === "object"
    && SOLVE_STATUS.includes(o.status)
    && (o.answer === null || typeof o.answer === "string")
    && typeof o.reasoningSummary === "string" && o.reasoningSummary.trim().length > 0
    && (o.assumptions === undefined || Array.isArray(o.assumptions))
    && (o.alternativeAnswers === undefined || Array.isArray(o.alternativeAnswers))
    && VERIFICATION_METHODS.includes(o.verificationMethod)
    && (o.warnings === undefined || Array.isArray(o.warnings));
  if (!ok) {
    const e = new Error("AI giải trả JSON sai schema solution.");
    e.code = "LLM_BAD_JSON"; e.retryable = true;
    throw e;
  }
  // solved bắt buộc có answer; các trạng thái khác answer phải null (không đoán)
  if (o.status === "solved" && (o.answer === null || String(o.answer).trim() === "")) {
    const e = new Error("Trạng thái solved nhưng thiếu answer.");
    e.code = "LLM_BAD_JSON"; e.retryable = true;
    throw e;
  }
  if (o.status !== "solved" && o.status !== "failed" && o.answer !== null) {
    const e = new Error("Chưa kết luận được nhưng vẫn đưa answer (đoán mò).");
    e.code = "LLM_BAD_JSON"; e.retryable = true;
    throw e;
  }
  if ("confidence" in o) delete o.confidence; // cấm điểm số chưa hiệu chỉnh
  return {
    status: o.status,
    answer: o.answer === null ? null : String(o.answer).trim().slice(0, 200),
    reasoningSummary: o.reasoningSummary.trim().slice(0, 800),
    assumptions: (o.assumptions || []).map(String).slice(0, 5),
    alternativeAnswers: (o.alternativeAnswers || []).map(String).slice(0, 5),
    verificationMethod: o.verificationMethod,
    warnings: (o.warnings || []).map(String).slice(0, 5),
    ...(Number.isInteger(o.questionNumber) && o.questionNumber > 0 ? { questionNumber: o.questionNumber } : {}),
  };
}

// Parse 1 object solution (solver gọi 1 câu/lượt nên không cần mảng).
export function parseSolutionResponse(text) {
  let obj;
  try {
    const cleaned = String(text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    obj = JSON.parse(cleaned);
  } catch {
    const e = new Error("AI giải trả JSON sai định dạng.");
    e.code = "LLM_BAD_JSON"; e.retryable = true;
    throw e;
  }
  const inner = obj && obj.solution && typeof obj.solution === "object" ? obj.solution : obj;
  return validateSolution(inner);
}

export { isLetter };
