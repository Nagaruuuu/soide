// Điều phối AI review: nhận questions đã parse + issues validator, gọi AI theo
// batch nhỏ, parse strict, tính usage/cost, câu lỗi ghi skipped (không chặn đợt).
import { aiConfig, aiError, withTimeout } from "./provider.js";
import { parseAiResponse } from "./schema.js";
import { REVIEW_SYSTEM, buildBatchUser } from "./prompt.js";
import { referencesBlock, questionTextOf } from "../knowledge/attach.js";

const BATCH_SIZE = 2; // 1-3 câu/lượt gọi: rẻ + lỗi 1 batch không lan cả đề

function flagsFor(num, validatorIssues = []) {
  return validatorIssues.filter((i) => i.questionNumber === num).map((i) => i.ruleId);
}

export function costOf(usage, cfg = aiConfig()) {
  const costUSD = (usage.inputTokens / 1e6) * cfg.priceIn + (usage.outputTokens / 1e6) * cfg.priceOut;
  return { ...usage, costUSD };
}

export async function reviewQuestions({ questions = [], validatorIssues = [], provider, cfg = aiConfig(), refProvider = null } = {}) {
  if (!provider) throw aiError("NO_KEY", "Chưa có AIProvider (thiếu LLM_API_KEY hoặc cấu hình).", 400, false);
  const findings = [];
  const skipped = [];
  const usage = { inputTokens: 0, outputTokens: 0, latencyMs: 0, calls: 0 };
  const list = questions.slice(0, cfg.maxQuestions);
  if (questions.length > cfg.maxQuestions) {
    skipped.push({ reason: `Chỉ review ${cfg.maxQuestions}/${questions.length} câu đầu (LLM_MAX_QUESTIONS).` });
  }
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    const items = batch.map((q) => ({ q, flags: flagsFor(q._num ?? q.ord, validatorIssues) }));
    if (refProvider) {
      // trích dẫn RAG opt-in: lấy song song, lỗi thì bỏ qua (AI chạy như cũ)
      const all = await Promise.all(items.map(({ q }) =>
        refProvider(questionTextOf(q), q).catch(() => [])
      ));
      items.forEach((it, idx) => { it.refsBlock = referencesBlock(all[idx]); });
    }
    const user = buildBatchUser(items);
    if ((systemTokens(user) + 1200) > cfg.maxInputTokens) {
      for (const q of batch) skipped.push({ questionNumber: q._num ?? q.ord, reason: "Prompt vượt LLM_MAX_INPUT_TOKENS." });
      continue;
    }
    const { signal, done } = withTimeout(cfg.timeoutMs);
    try {
      const res = await provider.completeJSON({ system: REVIEW_SYSTEM, user, maxTokens: cfg.maxOutputTokens, signal });
      usage.inputTokens += res.inputTokens || 0;
      usage.outputTokens += res.outputTokens || 0;
      usage.latencyMs += res.latencyMs || 0;
      usage.calls += 1;
      let parsed;
      try {
        parsed = parseAiResponse(res.text);
      } catch (e) {
        if (e.code === "LLM_BAD_JSON") {
          // retry đúng 1 lần, không vòng lặp vô hạn
          const retry = await provider.completeJSON({ system: REVIEW_SYSTEM, user: user + '\nCHỈ trả JSON hợp lệ, không thêm chữ ngoài JSON.', maxTokens: cfg.maxOutputTokens, signal });
          usage.inputTokens += retry.inputTokens || 0;
          usage.outputTokens += retry.outputTokens || 0;
          usage.calls += 1;
          parsed = parseAiResponse(retry.text);
        } else throw e;
      }
      const nums = new Set(batch.map((q) => q._num ?? q.ord));
      for (const f of parsed) {
        // Số câu lạ (AI bịa) -> skipped, KHÔNG gán nhầm sang câu khác
        if (!nums.has(f.questionNumber)) {
          skipped.push({
            questionNumber: f.questionNumber ?? null,
            reason: "AI trả số câu không thuộc nhóm đang xét — bỏ qua để tránh gán nhầm.",
          });
          continue;
        }
        findings.push({ ...f });
      }
    } catch (e) {
      for (const q of batch) {
        skipped.push({
          questionNumber: q._num ?? q.ord,
          reason: e.code === "TIMEOUT" ? "AI timeout." : e.code === "RATE_LIMITED" ? "AI giới hạn tốc độ." : `Lỗi AI (${e.code || "LLM_API_ERROR"}).`,
        });
      }
      if (e.code === "RATE_LIMITED") break; // dừng cả đợt khi bị rate-limit, không gọi tiếp
      // lỗi khác: tiếp batch sau
    } finally {
      done();
    }
  }
  return { findings, usage: costOf(usage, cfg), skipped, meta: { model: provider.name, batchSize: BATCH_SIZE } };
}

function systemTokens(user) {
  return Math.ceil((REVIEW_SYSTEM.length + String(user).length) / 4);
}
