// Unit + integration test AI Reviewer — 100% mock, 0 phí API.
// Bao phủ: schema, prompt mù đáp án, lỗi API/timeout/rate-limit/JSON hỏng,
// retry đúng 1 lần, usage/cost, map severity, tích hợp validate->review->aggregate.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { validateAiFinding, parseAiResponse, ISSUE_TYPES } from "../src/modules/aiReview/schema.js";
import { REVIEW_SYSTEM, buildReviewUser } from "../src/modules/aiReview/prompt.js";
import { createMockProvider, createProvider, aiError } from "../src/modules/aiReview/provider.js";
import { reviewQuestions, costOf } from "../src/modules/aiReview/review.js";
import { aggregate } from "../src/modules/aggregator/aggregator.js";

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"));

// ---------- schema ----------
test("schema: đủ 7 issueType, thiếu field/báo sai severity -> LLM_BAD_JSON", () => {
  assert.equal(ISSUE_TYPES.length, 7);
  const good = { issueType: "AMBIGUOUS", severity: "medium", evidence: "cụm X", explanation: "vì sao", suggestion: "sửa sao" };
  assert.equal(validateAiFinding(good).issueType, "AMBIGUOUS");
  assert.throws(() => validateAiFinding({ ...good, severity: "critical" }), (e) => e.code === "LLM_BAD_JSON");
  assert.throws(() => validateAiFinding({ ...good, evidence: "  " }), (e) => e.code === "LLM_BAD_JSON");
  assert.throws(() => validateAiFinding({ ...good, issueType: "MADE_UP" }), (e) => e.code === "LLM_BAD_JSON");
});

test("schema: cấm confidence giả tạo, reference trống bị lược", () => {
  const f = validateAiFinding({ issueType: "WRONG_KEY", severity: "high", evidence: "e", explanation: "x", suggestion: "s", confidence: 0.99, reference: "  " });
  assert.ok(!("confidence" in f));
  assert.ok(!("reference" in f));
});

test("schema: parse envelope findings[] + trần [], cắt tối đa 5", () => {
  const mk = (i) => ({ issueType: "AMBIGUOUS", severity: "low", evidence: "e" + i, explanation: "x", suggestion: "s" });
  assert.equal(parseAiResponse(JSON.stringify({ findings: [mk(1)] })).length, 1);
  assert.equal(parseAiResponse(JSON.stringify([mk(1), mk(2)])).length, 2);
  assert.equal(parseAiResponse(JSON.stringify({ findings: Array.from({ length: 9 }, (_, i) => mk(i)) })).length, 5);
  assert.throws(() => parseAiResponse("không phải json"), (e) => e.code === "LLM_BAD_JSON");
  assert.throws(() => parseAiResponse(JSON.stringify({ nope: 1 })), (e) => e.code === "LLM_BAD_JSON");
});

// ---------- prompt ----------
test("prompt: mù đáp án, kèm cờ validator, không sửa đề", () => {
  assert.match(REVIEW_SYSTEM, /CHƯA CHẮC đúng/);
  assert.match(REVIEW_SYSTEM, /KHÔNG sửa đề/);
  assert.match(REVIEW_SYSTEM, /TUYỆT ĐỐI không bịa/);
  const u = buildReviewUser({ _num: 3, content: "2+2=?", opt_a: "3", opt_b: "4", opt_c: "5", opt_d: "6", expected_answer: "B" }, ["DUP_NEAR"]);
  assert.match(u, /Câu 3/);
  assert.match(u, /CHƯA XÁC MINH/);
  assert.match(u, /DUP_NEAR/);
  assert.match(u, /đừng lặp lại/);
});

// ---------- provider errors ----------
test("mock: ghi calls, ước lượng token, cost theo bảng giá env", () => {
  const p = createMockProvider({ __default: { findings: [] } });
  return p.completeJSON({ system: "s", user: "u".repeat(100) }).then((r) => {
    assert.equal(p.calls.length, 1);
    assert.ok(r.inputTokens >= 25 && r.outputTokens >= 1);
    const c = costOf({ inputTokens: 1e6, outputTokens: 1e6, latencyMs: 0, calls: 1 }, { priceIn: 1, priceOut: 2 });
    assert.equal(c.costUSD, 3);
  });
});

test("factory: mock theo env, gemini thiếu key báo NO_KEY", () => {
  assert.equal(createProvider({ provider: "mock" }).name, "mock");
  assert.throws(() => createProvider({ provider: "gemini", model: "m", apiKey: "" }), (e) => e.code === "NO_KEY");
});

test("review: JSON hỏng retry đúng 1 lần rồi thành công", async () => {
  let n = 0;
  const p = createMockProvider(() => {
    n++;
    if (n === 1) return "ngon}{{ngữ";
    return { findings: [] };
  });
  const out = await reviewQuestions({ questions: [{ _num: 1, content: "c", opt_a: "a", opt_b: "b", opt_c: "c", opt_d: "d" }], provider: p });
  assert.equal(n, 2);
  assert.equal(out.usage.calls, 2);
  assert.equal(out.findings.length, 0);
});

test("review: timeout/rate-limit ghi skipped, rate-limit dừng cả đợt", async () => {
  const timeoutErr = aiError("TIMEOUT", "t", 504, true);
  const p = createMockProvider(() => { throw timeoutErr; });
  const qs = [{ _num: 1, content: "c1", opt_a: "a", opt_b: "b", opt_c: "c", opt_d: "d" }, { _num: 2, content: "c2", opt_a: "a", opt_b: "b", opt_c: "c", opt_d: "d" }];
  let out = await reviewQuestions({ questions: qs, provider: p });
  assert.equal(out.skipped.length, 2); // 2 batch, mỗi batch 1 câu... batch size 2 -> 1 batch 2 câu
  const rl = createMockProvider(() => { throw aiError("RATE_LIMITED", "rl", 429, true); });
  out = await reviewQuestions({ questions: [...qs, ...qs, ...qs], provider: rl });
  assert.ok(out.skipped.length >= 2);
  assert.equal(rl.calls.length, 1); // dừng sau batch đầu
});

test("review: vượt maxQuestions ghi skipped, không gửi key ra log", async () => {
  const p = createMockProvider({ __default: { findings: [] } });
  const qs = Array.from({ length: 5 }, (_, i) => ({ _num: i + 1, content: `c${i}`, opt_a: "a", opt_b: "b", opt_c: "c", opt_d: "d" }));
  const out = await reviewQuestions({ questions: qs, provider: p, cfg: { maxQuestions: 2, maxInputTokens: 1e6, maxOutputTokens: 800, timeoutMs: 5000, priceIn: 0, priceOut: 0 } });
  assert.ok(out.skipped.some((s) => /2\/5/.test(s.reason)));
  assert.ok(!JSON.stringify(p.calls).includes("sk-"));
});

// ---------- integration: validate -> review(mock) -> aggregate ----------
test("integration mock: 5 fixtures qua full pipeline, map severity đúng", async () => {
  for (const f of ["aireview-ok", "aireview-ambiguous", "aireview-missing-data", "aireview-multi-valid", "aireview-wrong-key"]) {
    const fix = fx(`${f}.json`);
    const p = createMockProvider(fix.mock);
    const out = await reviewQuestions({ questions: [fix.question], validatorIssues: [], provider: p });
    const rows = aggregate(fix.question, { group_kind: "H" }, [], { aiReview: out.findings });
    if (!fix.expectFinding) {
      assert.equal(out.findings.length, 0, f);
      assert.equal(rows.length, 0, f);
    } else {
      assert.equal(out.findings[0].issueType, fix.expectType, f);
      assert.ok(!rows.some((r) => r.severity === "blocker"), `${f}: AI không bao giờ blocker`);
      assert.equal(rows[0].verification_method, "llm-suggest", f);
      assert.equal(rows[0].confidence, "thấp", f);
      assert.ok(/^ai_/.test(rows[0].category), f);
    }
  }
});

test("integration mock: sai số câu AI trả -> skipped, không gán nhầm", async () => {
  const p = createMockProvider({ findings: [{ issueType: "AMBIGUOUS", severity: "low", evidence: "x", explanation: "y", suggestion: "z", questionNumber: 99 }] });
  const out = await reviewQuestions({ questions: [{ _num: 1, content: "c", opt_a: "a", opt_b: "b", opt_c: "c", opt_d: "d" }], provider: p });
  assert.equal(out.findings.length, 0); // KHÔNG gán nhầm sang câu 1
  assert.ok(out.skipped.some((s) => s.questionNumber === 99 && /không thuộc nhóm đang xét/.test(s.reason)));
});
