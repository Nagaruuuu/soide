import test from "node:test";
import assert from "node:assert";
import { parseExamText } from "../src/modules/parser/parser.js";
import { runRules, dupSimilarity } from "../src/modules/rules/rules.js";
import { validateFindingJSON, validateSolverJSON } from "../src/modules/llm/provider.js";

test("parser tách inline 1 dòng A-D", () => {
  const qs = parseExamText("Câu 1: 2+2=? A. 3 B. 4 C. 5 D. 6 Đáp án: B");
  assert.equal(qs.length, 1);
  assert.equal(qs[0].opt_d, "6");
  assert.equal(qs[0].expected_answer, "B");
});

test("parser nhận (B)(C)(D)", () => {
  const qs = parseExamText("Câu 1: pick?\n(A) a\n(B) b\n(C) c\n(D) d\nĐáp án: A");
  assert.equal(qs[0].opt_b, "b");
});

test("rules phủ định kép + trùng lặp", () => {
  const a = { content: "Thủ đô của Việt Nam là Hà Nội phải không?", opt_a: "1", opt_b: "2", opt_c: "3", opt_d: "4", expected_answer: "A" };
  const b = { content: "Thủ đô của Việt Nam là Hà Nội phải không?", opt_a: "1", opt_b: "2", opt_c: "3", opt_d: "4", expected_answer: "A" };
  assert.ok(dupSimilarity(a.content, b.content) >= 0.88);
  const f = runRules({ ...a, content: "Điều này không phải là không đúng?" }, { group_kind: "H" }, [b]);
  assert.ok(f.some((x) => x.category === "phu_dinh_kep"));
});

test("LLM_BAD_JSON ném đúng mã", () => {
  assert.throws(() => validateFindingJSON({ category: "x" }), (e) => e.code === "LLM_BAD_JSON");
  assert.throws(() => validateSolverJSON({ answer: "E", steps: "", confidence: "cao" }), (e) => e.code === "LLM_BAD_JSON");
});

test("aggregator H cấm blocker đáp án", async () => {
  const { aggregate } = await import("../src/modules/aggregator/aggregator.js");
  const out = aggregate({ expected_answer: "A" }, { group_kind: "H" }, [{ severity: "blocker", category: "dap_an_sai", evidence: "y", verification_method: "computed", confidence: "cao" }]);
  assert.equal(out[0].severity, "review");
});

test("aggregator T lệch solver -> blocker computed", async () => {
  const { aggregate } = await import("../src/modules/aggregator/aggregator.js");
  const q = { content: "2+3x4=?", expected_answer: "A" };
  const out = aggregate(q, { group_kind: "T" }, [], { solver: { value: 14, steps: "2+3*4=14", method: "computed", matchLetter: "B" } });
  assert.ok(out.some((x) => x.severity === "blocker" && x.verification_method === "computed" && x.suggested_answer === "B"));
});
