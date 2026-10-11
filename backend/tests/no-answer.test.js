import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseExamText } from "../src/modules/parser/parser.js";
import { runRules } from "../src/modules/rules/rules.js";
import { aggregate } from "../src/modules/aggregator/aggregator.js";
import { compareSolution } from "../src/modules/independentSolver/compare.js";
import { validateExam } from "../src/modules/validator/validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const noAnswerText = fs.readFileSync(path.join(__dirname, "fixtures", "no-answer.txt"), "utf8");

test("parse đề không đáp án: expected_answer trống", () => {
  const qs = parseExamText(noAnswerText);
  assert.equal(qs.length, 2);
  assert.ok(qs.every((q) => !q.expected_answer));
});

test("rules has_answer=0: không thieu_dap_an, có info khong_kem_dap_an", () => {
  const qs = parseExamText(noAnswerText);
  for (const q of qs) {
    const f = runRules(q, { group_kind: "T", has_answer: 0 });
    assert.ok(!f.some((x) => x.category === "thieu_dap_an"));
    assert.ok(f.some((x) => x.category === "khong_kem_dap_an" && x.severity === "info"));
  }
});

test("rules mặc định (thiếu has_answer): vẫn báo thieu_dap_an như cũ", () => {
  const f = runRules({ content: "2+2=?", opt_a: "3", opt_b: "4", opt_c: "5", opt_d: "6", expected_answer: "" }, { group_kind: "T" });
  assert.ok(f.some((x) => x.category === "thieu_dap_an" && x.severity === "review"));
});

test("aggregator gợi ý đáp án solver khi đề không đáp án", () => {
  const q = { content: "8+4=?", opt_a: "12", opt_b: "14", opt_c: "16", opt_d: "20", expected_answer: "" };
  const out = aggregate(q, { group_kind: "T" }, [], { solver: { value: 12, steps: "8+4=12", method: "computed", matchLetter: "A" } });
  const sug = out.find((x) => x.category === "goi_y_dap_an");
  assert.ok(sug);
  assert.equal(sug.severity, "hint");
  assert.equal(sug.suggested_answer, "A");
});

test("compareSolution trả suggest khi giải xong mà không có đáp án", () => {
  const cmp = compareSolution({ questionNumber: 1, status: "solved", answer: "B", verificationMethod: "computed" }, "");
  assert.equal(cmp.verdict, "suggest");
  assert.equal(cmp.independentAnswer, "B");
});

test("validator hasAnswerKey=false: ANS_MISSING vào skipped, không error", () => {
  const out = validateExam({ exam_text: noAnswerText, hasAnswerKey: false });
  assert.ok(!out.issues.some((i) => i.ruleId === "ANS_MISSING"));
  assert.ok(out.skippedChecks.some((s) => s.check === "ANS_MISSING"));
});

test("validator hasAnswerKey=true trên đề không đáp án: ANS_MISSING error", () => {
  const out = validateExam({ exam_text: noAnswerText, hasAnswerKey: true });
  assert.ok(out.issues.some((i) => i.ruleId === "ANS_MISSING" && i.severity === "error"));
});

test("auto-detect: <30% câu có đáp án -> coi như không có", () => {
  const qs = parseExamText(noAnswerText);
  const answered = qs.filter((q) => String(q.expected_answer ?? "").trim() !== "").length;
  assert.ok(answered / qs.length < 0.3);
});
