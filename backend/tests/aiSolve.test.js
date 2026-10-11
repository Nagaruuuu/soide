// Unit + integration test Independent Solver — 100% mock, 0 phí.
// Bao phủ: sanitize mù đáp án, schema 5 status, lỗi API/timeout/retry-1-lần,
// code-verify số học, compare 3 verdict, tích hợp solve->compare.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { validateSolution, parseSolutionResponse } from "../src/modules/independentSolver/schema.js";
import { sanitizeForSolving, assertBlind, SOLVER_SYSTEM, buildSolverUser } from "../src/modules/independentSolver/prompt.js";
import { solveQuestions, codeVerify } from "../src/modules/independentSolver/solver.js";
import { compareSolution } from "../src/modules/independentSolver/compare.js";
import { createMockProvider, aiError } from "../src/modules/aiReview/provider.js";

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"));

// ---------- sanitize: đáp án/lời giải/conclusion Reviewer KHÔNG lọt vào solver ----------
test("sanitize: loại expected_answer/explanation/reviewer conclusions", () => {
  const s = sanitizeForSolving(
    { content: "2+2=?", opt_a: "3", opt_b: "4", opt_c: "5", opt_d: "6", expected_answer: "B", explanation: "Vì 2+2=4" },
    { subject: "Toán", grade: "9" }
  );
  const payload = JSON.stringify(s) + buildSolverUser(s);
  assert.ok(!/"expected_answer"/.test(payload));
  assert.ok(!/"explanation"/.test(payload));
  assert.ok(!payload.includes("Vì 2+2=4"));
  assert.ok(payload.includes("2+2=?") && payload.includes("Toán"));
});

test("assertBlind: bắt đáp án rò rỉ + key cấm", () => {
  assert.deepEqual(assertBlind('{"content":"2+2=?"}', ["B", "lời giải dài"]), []);
  assert.ok(assertBlind('{"content":"x", "expected_answer":"B"}', ["B"]).some((l) => /key:expected_answer/.test(l)));
  assert.ok(assertBlind("đáp án là B évidemment", ["B évidemment"]).length > 0);
});

test("prompt solver: không chứa đáp án, yêu cầu status thay vì đoán", () => {
  assert.match(SOLVER_SYSTEM, /KHÔNG được biết đáp án/);
  assert.match(SOLVER_SYSTEM, /không đoán mò/i);
  assert.match(SOLVER_SYSTEM, /KHÔNG trả trường confidence/);
});

// ---------- schema ----------
test("schema: 5 status, solved bắt buộc answer, đoán mò bị loại", () => {
  const base = { reasoningSummary: "r", verificationMethod: "model-reasoning" };
  assert.equal(validateSolution({ ...base, status: "solved", answer: "B" }).status, "solved");
  for (const st of ["ambiguous", "insufficient_information", "unsupported"]) {
    assert.equal(validateSolution({ ...base, status: st, answer: null }).status, st);
  }
  assert.throws(() => validateSolution({ ...base, status: "solved", answer: null }), (e) => e.code === "LLM_BAD_JSON");
  assert.throws(() => validateSolution({ ...base, status: "ambiguous", answer: "A" }), (e) => e.code === "LLM_BAD_JSON");
  const noConf = validateSolution({ ...base, status: "solved", answer: "B", confidence: 0.9 });
  assert.ok(!("confidence" in noConf));
  assert.throws(() => parseSolutionResponse("không json"), (e) => e.code === "LLM_BAD_JSON");
  assert.equal(parseSolutionResponse(JSON.stringify({ solution: { ...base, status: "solved", answer: "B" } })).answer, "B");
});

// ---------- solver + lỗi ----------
test("solver: JSON hỏng retry 1 lần, timeout/rate-limit skipped", async () => {
  let n = 0;
  const p = createMockProvider(() => { n++; if (n === 1) return "{{hong"; return { status: "solved", answer: "B", reasoningSummary: "r", verificationMethod: "model-reasoning" }; });
  const q = { _num: 1, content: "2+2=?", opt_a: "3", opt_b: "4", opt_c: "5", opt_d: "6", expected_answer: "B" };
  const out = await solveQuestions({ questions: [q], provider: p });
  assert.equal(n, 2);
  assert.equal(out.solutions.length, 1);
  const p2 = createMockProvider(() => { throw aiError("TIMEOUT", "t", 504, true); });
  const out2 = await solveQuestions({ questions: [q, { ...q, _num: 2 }], provider: p2 });
  assert.equal(out2.solutions.length, 0);
  assert.equal(out2.skipped.length, 2);
  const p3 = createMockProvider(() => { throw aiError("RATE_LIMITED", "rl", 429, true); });
  const out3 = await solveQuestions({ questions: [q, { ...q, _num: 2 }, { ...q, _num: 3 }], provider: p3 });
  assert.equal(p3.calls.length, 1); // dừng cả đợt
});

test("solver: vượt maxQuestions + giới hạn token ghi skipped", async () => {
  const p = createMockProvider({ status: "solved", answer: "A", reasoningSummary: "r", verificationMethod: "model-reasoning" });
  const qs = Array.from({ length: 4 }, (_, i) => ({ _num: i + 1, content: "c", opt_a: "a", opt_b: "b", opt_c: "c", opt_d: "d", expected_answer: "A" }));
  const out = await solveQuestions({ questions: qs, provider: p, cfg: { maxQuestions: 2, maxInputTokens: 1e6, maxOutputTokens: 800, timeoutMs: 5000, priceIn: 0, priceOut: 0 } });
  assert.equal(out.solutions.length, 2);
  assert.ok(out.skipped.some((s) => /2\/4/.test(s.reason)));
});

// ---------- codeVerify ----------
test("codeVerify: khớp số -> computed; lệch -> warning, không tin mù", async () => {
  const q = { content: "8+4=?", opt_a: "12", opt_b: "14", opt_c: "16", opt_d: "20" };
  const ok = await codeVerify({ status: "solved", answer: "A", reasoningSummary: "r", verificationMethod: "model-reasoning", warnings: [] }, q);
  assert.equal(ok.codeChecked, true);
  assert.equal(ok.solution.verificationMethod, "computed");
  const bad = await codeVerify({ status: "solved", answer: "B", reasoningSummary: "r", verificationMethod: "model-reasoning", warnings: [] }, q);
  assert.equal(bad.codeChecked, true);
  assert.ok(bad.solution.warnings.some((w) => /tính lại|nhẩm sai/.test(w)));
  const skip = await codeVerify({ status: "solved", answer: "A", reasoningSummary: "r", verificationMethod: "model-reasoning", warnings: [] }, { content: "Ai là tác giả?", opt_a: "A", opt_b: "B", opt_c: "C", opt_d: "D" });
  assert.equal(skip.codeChecked, false);
});

// ---------- compare ----------
test("compare: match/mismatch/needs_review, không kết luận bên đúng", () => {
  assert.equal(compareSolution({ questionNumber: 1, status: "solved", answer: "B" }, "B").verdict, "match");
  const mm = compareSolution({ questionNumber: 1, status: "solved", answer: "B", verificationMethod: "computed" }, "A");
  assert.equal(mm.verdict, "mismatch");
  assert.match(mm.reason, /chưa kết luận bên nào đúng/);
  assert.equal(compareSolution({ questionNumber: 1, status: "ambiguous", answer: null }, "A").verdict, "needs_review");
  assert.equal(compareSolution({ questionNumber: 1, status: "failed", answer: null }, "A").verdict, "needs_review");
  assert.equal(compareSolution({ questionNumber: 1, status: "solved", answer: "B" }, "").verdict, "needs_review");
});

// ---------- integration: 6 fixtures solve(mock) -> compare ----------
test("integration mock: 6 fixtures qua solve->compare", async () => {
  for (const f of ["aisolve-single", "aisolve-essay", "aisolve-insufficient", "aisolve-ambiguous", "aisolve-arithmetic", "aisolve-wrong-expected"]) {
    const fix = fx(`${f}.json`);
    const p = createMockProvider(fix.mock);
    const out = await solveQuestions({ questions: [fix.question], provider: p });
    assert.equal(out.solutions.length, 1, f);
    const cmp = compareSolution(out.solutions[0], fix.question.expected_answer);
    if (f === "aisolve-single" || f === "aisolve-essay" || f === "aisolve-arithmetic") assert.equal(cmp.verdict, "match", f);
    if (f === "aisolve-wrong-expected") assert.equal(cmp.verdict, "mismatch", f);
    if (f === "aisolve-insufficient" || f === "aisolve-ambiguous") assert.equal(cmp.verdict, "needs_review", f);
  }
});

test("integration: reviewer conclusions không bao giờ vào prompt solver", async () => {
  let seen = "";
  const p = createMockProvider(({ user }) => { seen = user; return { status: "solved", answer: "A", reasoningSummary: "r", verificationMethod: "model-reasoning" }; });
  const q = { _num: 1, content: "2+2=?", opt_a: "3", opt_b: "4", opt_c: "5", opt_d: "6", expected_answer: "B" };
  await solveQuestions({ questions: [q], reviewerConclusions: [{ issueType: "WRONG_KEY", explanation: "đáp án B sai" }], provider: p });
  assert.ok(!seen.includes("WRONG_KEY") && !seen.includes("đáp án B sai"));
  assert.ok(!seen.includes("expected_answer"));
});
