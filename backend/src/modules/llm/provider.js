// AIProvider: 1 LLM, 2 vai (Solver mù + Phản biện có điều kiện), validate JSON + retry.
const SEV = ["blocker", "review", "hint", "ok"];
const CONF = ["thấp", "vừa", "cao"];
const VER = ["rule", "computed", "llm-suggest"];

export function llmConfig() {
  return {
    provider: process.env.LLM_PROVIDER || "gemini",
    model: process.env.LLM_MODEL || "gemini-2.0-flash",
    hasKey: !!process.env.LLM_API_KEY,
  };
}

export function solverPrompt(q) {
  return `Bạn là giáo viên ra đề. Giải BÀI này mà KHÔNG nhìn đáp án của GV. Chỉ trả JSON: {"answer":"A|B|C|D","steps":"<ngắn gọn>","confidence":"thấp|vừa|cao"}\nĐề: ${q.content}\nA. ${q.opt_a}\nB. ${q.opt_b}\nC. ${q.opt_c}\nD. ${q.opt_d}`;
}

export function arguePrompt(q, solverAns) {
  return `Phản biện đáp án GV. Chỉ trả JSON: {"category":"...","evidence":"...","suggested_answer":"A|B|C|D|","fix_suggestion":"...","severity":"blocker|review|hint|ok","confidence":"thấp|vừa|cao"}\nĐề: ${q.content}\nĐáp án GV: ${q.expected_answer}\nMáy giải mù: ${solverAns}`;
}

async function callLLM(prompt) {
  const { hasKey, provider, model } = llmConfig();
  if (!hasKey) {
    const e = new Error("Chưa cấu hình LLM_API_KEY — chỉ dùng rules.");
    e.code = "NO_KEY"; e.retryable = false;
    throw e;
  }
  // MVP: gọi HTTP tối giản theo provider; lỗi JSON/mạng -> caller retry rồi fallback.
  // Giữ fetch native để không thêm dep. Hết MVP mới tách adapter riêng từng hãng.
  void provider; void model; void prompt;
  const e = new Error("LLM provider chưa được cắm key thật (làm ở T6-α).");
  e.code = "LLM_NOT_CONFIGURED"; e.retryable = false;
  throw e;
}

async function withRetry(fn, tries = 2) {
  let last;
  for (let i = 0; i <= tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (e?.code === "LLM_BAD_JSON" && i < tries) continue; if (i >= tries) throw e; }
  }
  throw last;
}

export async function solveBlind(question) {
  if (!llmConfig().hasKey) return { status: "no-key", confidence: "thấp", note: "Chưa cấu hình LLM_API_KEY — chỉ dùng rules." };
  try {
    return await withRetry(async () => {
      const raw = await callLLM(solverPrompt(question));
      return validateSolverJSON(raw);
    });
  } catch (e) {
    return { status: "fallback", confidence: "thấp", note: "chưa thể kết luận — cần GV quyết", error_code: e.code || "LLM_BAD_JSON" };
  }
}

export async function counterArgue(question, solverAns) {
  if (!llmConfig().hasKey) return { status: "no-key", confidence: "thấp", note: "Chưa cấu hình LLM_API_KEY." };
  try {
    return await withRetry(async () => {
      const raw = await callLLM(arguePrompt(question, solverAns));
      return validateFindingJSON(raw);
    });
  } catch (e) {
    return { status: "fallback", confidence: "thấp", note: "chưa thể kết luận — cần GV quyết", error_code: e.code || "LLM_BAD_JSON" };
  }
}

export function validateSolverJSON(o) {
  const obj = typeof o === "string" ? JSON.parse(o) : o;
  if (!obj || !["A", "B", "C", "D"].includes(String(obj.answer || "").toUpperCase()) || typeof obj.steps !== "string" || !CONF.includes(obj.confidence)) {
    const e = new Error("LLM trả JSON sai schema."); e.code = "LLM_BAD_JSON"; e.retryable = true; throw e;
  }
  return { answer: String(obj.answer).toUpperCase(), steps: obj.steps, confidence: obj.confidence };
}

export function validateFindingJSON(o) {
  const obj = typeof o === "string" ? JSON.parse(o) : o;
  const ok = obj && typeof obj.category === "string" && typeof obj.evidence === "string"
    && SEV.includes(obj.severity) && CONF.includes(obj.confidence)
    && (obj.verification_method === undefined || VER.includes(obj.verification_method));
  if (!ok) { const e = new Error("LLM trả JSON sai schema."); e.code = "LLM_BAD_JSON"; e.retryable = true; throw e; }
  return { ...obj, verification_method: obj.verification_method || "llm-suggest" };
}
