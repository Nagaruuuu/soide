// Schema phát hiện của AI Reviewer. confidence KHÔNG có trong schema v1:
// chưa hiệu chỉnh thì không bịa điểm số (ghi rõ ở meta response).
export const ISSUE_TYPES = [
  "AMBIGUOUS", // mơ hồ / nhiều cách hiểu
  "MISSING_DATA", // thiếu dữ kiện, không trả lời duy nhất được
  "MULTI_VALID", // nhiều đáp án hợp lý tùy cách hiểu (kèm điều kiện)
  "MISMATCH_OPTIONS", // câu hỏi lệch với các lựa chọn
  "WRONG_KEY", // đáp án/lời giải có dấu hiệu sai kiến thức (nghi vấn, không khẳng định tuyệt đối)
  "OUT_OF_SCOPE", // có thể vượt phạm vi kiến thức đã cung cấp
  "CONTRADICTION", // dữ kiện mâu thuẫn / lỗi logic
];

export const SEVERITIES = ["high", "medium", "low"];

export function validateAiFinding(o) {
  const ok = o && typeof o === "object"
    && ISSUE_TYPES.includes(o.issueType)
    && SEVERITIES.includes(o.severity)
    && typeof o.evidence === "string" && o.evidence.trim().length > 0
    && typeof o.explanation === "string" && o.explanation.trim().length > 0
    && typeof o.suggestion === "string"
    && (o.reference === undefined || typeof o.reference === "string");
  if (!ok) {
    const e = new Error("AI trả JSON sai schema review.");
    e.code = "LLM_BAD_JSON"; e.retryable = true;
    throw e;
  }
  if ("confidence" in o) delete o.confidence; // cấm điểm số chưa hiệu chỉnh
  const qn = Number.isInteger(o.questionNumber) && o.questionNumber > 0 ? o.questionNumber : null;
  return {
    ...(qn ? { questionNumber: qn } : {}),
    issueType: o.issueType,
    severity: o.severity,
    evidence: o.evidence.trim().slice(0, 500),
    explanation: o.explanation.trim().slice(0, 1000),
    suggestion: String(o.suggestion ?? "").trim().slice(0, 500),
    ...(o.reference && String(o.reference).trim() ? { reference: String(o.reference).trim().slice(0, 200) } : {}),
  };
}

// Parse envelope: { "findings": [...] } hoặc [...] trần. Không có cảnh báo là hợp lệ.
export function parseAiResponse(text) {
  let obj;
  try {
    const cleaned = String(text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    obj = JSON.parse(cleaned);
  } catch {
    const e = new Error("AI trả JSON sai định dạng.");
    e.code = "LLM_BAD_JSON"; e.retryable = true;
    throw e;
  }
  const arr = Array.isArray(obj) ? obj : obj.findings;
  if (!Array.isArray(arr)) {
    const e = new Error("AI trả JSON thiếu mảng findings.");
    e.code = "LLM_BAD_JSON"; e.retryable = true;
    throw e;
  }
  return arr.slice(0, 5).map(validateAiFinding);
}
