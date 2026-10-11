// IndependentSolver: giải mù từng câu (1 câu/lượt), tái dùng AIProvider hiện có.
// Không batch như reviewer vì lời giải dài. Không gọi model thứ hai mặc định.
import { aiConfig, aiError, withTimeout, estimateTokens } from "../aiReview/provider.js";
import { parseSolutionResponse } from "./schema.js";
import { sanitizeForSolving, assertBlind, buildSolverUser, SOLVER_SYSTEM } from "./prompt.js";
import { referencesBlock, questionTextOf } from "../knowledge/attach.js";
import { solveNumeric } from "../solver/solver.js";

export function solveConfig() {
  const base = aiConfig();
  return {
    ...base,
    maxQuestions: Number(process.env.LLM_MAX_SOLVE_QUESTIONS || 5),
    maxOutputTokens: Number(process.env.LLM_SOLVE_MAX_OUTPUT_TOKENS || base.maxOutputTokens),
  };
}

function optNumber(v) {
  if (v == null) return null;
  const m = String(v).replace(",", ".").match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Bài số thuần mới kiểm chứng bằng code: có biểu thức số trong đề + mọi lựa
// chọn thuần số. Còn lại -> giữ verificationMethod của model, không kết luận.
export async function codeVerify(solution, cleanQuestion) {
  const warnings = [...(solution.warnings || [])];
  if (solution.status !== "solved" || solution.answer === null) return { solution, codeChecked: false };
  const nums = ["opt_a", "opt_b", "opt_c", "opt_d"].map((k) => optNumber(cleanQuestion[k]));
  if (nums.some((v) => v == null)) return { solution, codeChecked: false };
  const code = await solveNumeric(cleanQuestion).catch(() => null);
  if (!code || typeof code.value !== "number" || code.unavailable) return { solution, codeChecked: false };
  const aiVal = optNumber(solution.answer) ?? nums["ABCD".indexOf(String(solution.answer).trim().toUpperCase())] ?? null;
  if (aiVal == null) return { solution, codeChecked: false };
  if (Math.abs(aiVal - code.value) < 1e-9) {
    return { solution: { ...solution, verificationMethod: "computed" }, codeChecked: true };
  }
  warnings.push(`Máy tính lại ra ${code.value} (${code.steps || "không rõ bước"}), khác đáp án model chọn — model có thể tính nhẩm sai.`);
  return { solution: { ...solution, warnings }, codeChecked: true };
}

export async function solveQuestions({ questions = [], scope = {}, reviewerConclusions = [], provider, cfg = solveConfig(), refProvider = null } = {}) {
  if (!provider) throw aiError("NO_KEY", "Chưa có AIProvider (thiếu LLM_API_KEY hoặc cấu hình).", 400, false);
  void reviewerConclusions; // nhận để ký interface rõ ràng, nhưng KHÔNG dùng — chống lộ vào solver
  const solutions = [];
  const skipped = [];
  const usage = { inputTokens: 0, outputTokens: 0, latencyMs: 0, calls: 0 };
  const list = questions.slice(0, cfg.maxQuestions);
  if (questions.length > cfg.maxQuestions) {
    skipped.push({ reason: `Chỉ giải ${cfg.maxQuestions}/${questions.length} câu (LLM_MAX_SOLVE_QUESTIONS).` });
  }
  for (const q of list) {
    const num = q._num ?? q.ord ?? null;
    const sanitized = sanitizeForSolving(q, scope);
    let user = buildSolverUser(sanitized);
    // rào chắn mù: serialize đúng payload sắp gửi, quét đáp án/lời giải/key cấm
    const payload = JSON.stringify({ q: sanitized.question, scope: sanitized.scope });
    const leaks = assertBlind(payload + "\n" + user, [q.expected_answer, q.explanation]);
    if (leaks.length) {
      skipped.push({ questionNumber: num, reason: `Chặn giải để chống lộ đáp án (${leaks.length} dấu vết).` });
      continue;
    }
    if (refProvider) {
      // trích dẫn RAG gắn SAU rào chắn mù (textbook có thể chứa chuỗi đáp án
      // gây báo lộ giả). Lỗi retrieve -> giải như cũ.
      const cites = await refProvider(questionTextOf(q), q).catch(() => []);
      const block = referencesBlock(cites);
      if (block) user += "\n" + block;
    }
    if (Math.ceil((SOLVER_SYSTEM.length + user.length) / 4) > cfg.maxInputTokens) {
      skipped.push({ questionNumber: num, reason: "Prompt vượt LLM_MAX_INPUT_TOKENS." });
      continue;
    }
    const { signal, done } = withTimeout(cfg.timeoutMs);
    try {
      const res = await provider.completeJSON({ system: SOLVER_SYSTEM, user, maxTokens: cfg.maxOutputTokens, signal });
      usage.inputTokens += res.inputTokens || estimateTokens(SOLVER_SYSTEM + user);
      usage.outputTokens += res.outputTokens || 0;
      usage.latencyMs += res.latencyMs || 0;
      usage.calls += 1;
      let parsed;
      try {
        parsed = parseSolutionResponse(res.text);
      } catch (e) {
        if (e.code === "LLM_BAD_JSON") {
          const retry = await provider.completeJSON({ system: SOLVER_SYSTEM, user: user + "\nCHỈ trả JSON hợp lệ, không thêm chữ ngoài JSON.", maxTokens: cfg.maxOutputTokens, signal });
          usage.inputTokens += retry.inputTokens || 0;
          usage.outputTokens += retry.outputTokens || 0;
          usage.calls += 1;
          parsed = parseSolutionResponse(retry.text);
        } else throw e;
      }
      if (parsed.questionNumber == null) parsed.questionNumber = num;
      const { solution, codeChecked } = await codeVerify(parsed, sanitized.question);
      solutions.push({ ...solution, questionNumber: solution.questionNumber ?? num, codeChecked });
    } catch (e) {
      if (e.code === "RATE_LIMITED") {
        skipped.push({ questionNumber: num, reason: "AI giới hạn tốc độ — dừng cả đợt." });
        break;
      }
      skipped.push({ questionNumber: num, reason: e.code === "TIMEOUT" ? "AI timeout." : `Lỗi giải (${e.code || "LLM_API_ERROR"}).` });
    } finally {
      done();
    }
  }
  const costUSD = (usage.inputTokens / 1e6) * cfg.priceIn + (usage.outputTokens / 1e6) * cfg.priceOut;
  return { solutions, usage: { ...usage, costUSD }, skipped, meta: { model: provider.name } };
}
