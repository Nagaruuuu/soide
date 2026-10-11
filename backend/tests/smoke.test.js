import test from "node:test";
import assert from "node:assert";
import { parseExamText } from "../src/modules/parser/parser.js";
import { runRules } from "../src/modules/rules/rules.js";

test("parser tách 1 câu đủ A-D + đáp án", () => {
  const qs = parseExamText("Câu 1: 2+2=?\nA. 3\nB. 4\nC. 5\nD. 6\nĐáp án: B");
  assert.equal(qs.length, 1);
  assert.equal(qs[0].opt_b, "4");
  assert.equal(qs[0].expected_answer, "B");
});

test("rules báo thiếu phương án", () => {
  const f = runRules({ content: "2+2=?", opt_a: "3", opt_b: "4", opt_c: "", opt_d: "", expected_answer: "B" }, { group_kind: "T" });
  assert.ok(f.some((x) => x.category === "thieu_thanh_phan" && x.severity === "blocker"));
});

test("nhóm H không nâng blocker đáp án", async () => {
  const { aggregate } = await import("../src/modules/aggregator/aggregator.js");
  const out = aggregate({}, { group_kind: "H" }, [{ severity: "blocker", category: "x", evidence: "y", verification_method: "rule" }]);
  assert.equal(out[0].severity, "review");
});
