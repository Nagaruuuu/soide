import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseExamText } from "../src/modules/parser/parser.js";
import { runRules } from "../src/modules/rules/rules.js";
import { validateExam } from "../src/modules/validator/validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8");

// 1. Dòng vô nghĩa: đúng 1 warning noi_dung_chua_du, không kết luận đáp án sai
test("dòng vô nghĩa -> duy nhất 1 warning nội dung chưa đủ", () => {
  const qs = parseExamText(fx("shallow-gibberish.txt"));
  assert.equal(qs.length, 1);
  const f = runRules(qs[0], { group_kind: "T", question_format: "choice" });
  assert.equal(f.length, 1);
  assert.equal(f[0].category, "noi_dung_chua_du");
  assert.equal(f[0].severity, "warning");
  assert.ok(!/sai/i.test(f[0].evidence));
});

// 2. Câu tự luận hợp lệ: không báo thiếu A-D
test("tự luận hợp lệ -> không thieu_thanh_phan", () => {
  const qs = parseExamText(fx("shallow-essay.txt"));
  assert.equal(qs.length, 1);
  const f = runRules(qs[0], { group_kind: "H", question_format: "essay" });
  assert.ok(!f.some((x) => x.category === "thieu_thanh_phan"));
});

// 3. Trắc nghiệm thiếu phương án: blocker thieu_thanh_phan duy nhất về thiếu PA
test("trắc nghiệm thiếu C/D -> blocker thiếu thành phần", () => {
  const qs = parseExamText(fx("shallow-missing-opts.txt"));
  const f = runRules(qs[0], { group_kind: "T", question_format: "choice" });
  const miss = f.filter((x) => x.category === "thieu_thanh_phan");
  assert.equal(miss.length, 1);
  assert.equal(miss[0].severity, "blocker");
});

// 4. Trắc nghiệm đầy đủ + đáp án riêng: đối chiếu đúng, không báo oan
test("trắc nghiệm đủ + bảng đáp án riêng -> khớp, không thieu_dap_an", () => {
  const text = fx("shallow-full-key.txt");
  const out = validateExam({ exam_text: text, questionType: "single", hasAnswerKey: true });
  const withAns = out.issues.filter((i) => i.ruleId === "ANS_MISSING");
  assert.equal(withAns.length, 0);
  // đáp án riêng 1B khớp parse trong câu
  const refs = out.issues.filter((i) => i.ruleId === "ANS_REF_MISSING");
  assert.equal(refs.length, 0);
});

// 5. Thống kê question_stats tính từ cùng findings
test("question_stats: cùng nguồn findings, phân biệt câu lỗi/cảnh báo", async () => {
  const { buildQuestionStats } = await import("../src/modules/stats/stats.js");
  const st = buildQuestionStats(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    [
      { question_id: "a", severity: "blocker" },
      { question_id: "a", severity: "review" },
      { question_id: "b", severity: "hint" },
    ]
  );
  assert.deepEqual(st, { total: 3, with_issue: 2, errors: 1, warnings: 0, infos: 1, ok: 1 });
});
