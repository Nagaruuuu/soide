// Unit test Rule-based Question Validator: đúng / sai / ngoại lệ / thiếu input.
// Không AI, không mạng — chạy thuần node --test.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { validateExam } from "../src/modules/validator/validate.js";
import { normalizeText, tokenCosine } from "../src/modules/validator/normalize.js";
import { parseAnswerTable } from "../src/modules/validator/rules/format.js";
import { safeArithEval } from "../src/modules/validator/rules/arithmetic.js";

const fx = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const ids = (out) => out.issues.map((i) => i.ruleId);

// ---------- normalize ----------
test("normalize: gộp space, lowercase, bỏ dấu câu/dấu TV", () => {
  assert.equal(normalizeText("  Hà  NỘI!!! "), "ha noi");
  assert.ok(tokenCosine("thủ đô việt nam", "thu do Viet Nam") > 0.99);
  assert.ok(tokenCosine("hoàn toàn khác hẳn", "chuyện không liên quan gì") < 0.5);
});

// ---------- đề hợp lệ ----------
test("đề sạch: không error, validatedQuestions=2", () => {
  const out = validateExam({ exam_text: fx("validator-valid.txt"), hasAnswerKey: true });
  assert.equal(out.summary.error, 0);
  assert.equal(out.validatedQuestions, 2);
  assert.ok(out.issues.every((i) => i.ruleId && i.severity && "questionNumber" in i && i.message && i.evidence && i.suggestion));
});

// ---------- trùng lặp ----------
test("câu giống hệt -> DUP_EXACT error; gần giống -> DUP_NEAR warning", () => {
  const out = validateExam({ exam_text: fx("validator-duplicate.txt") });
  assert.ok(ids(out).includes("DUP_EXACT"), JSON.stringify(ids(out)));
  assert.ok(ids(out).includes("DUP_NEAR"), JSON.stringify(ids(out)));
  const ex = out.issues.find((i) => i.ruleId === "DUP_EXACT");
  assert.equal(ex.severity, "error");
  assert.match(ex.evidence, /100%/);
});

// ---------- thiếu đáp án / lựa chọn / sai lệch ----------
test("thiếu D + nhãn A lặp + đáp án E -> CHOICE_MISSING/LABEL_DUP/ANS_INVALID", () => {
  const out = validateExam({ exam_text: fx("validator-missing.txt"), hasAnswerKey: true });
  assert.ok(ids(out).includes("CHOICE_MISSING"));
  assert.ok(ids(out).includes("LABEL_DUP"));
  assert.ok(ids(out).includes("ANS_INVALID"));
  assert.ok(ids(out).includes("ANS_MISSING")); // câu 1 không đáp án
  const inv = out.issues.find((i) => i.ruleId === "ANS_INVALID");
  assert.equal(inv.severity, "error");
  assert.match(inv.evidence, /E/);
});

test("không hasAnswerKey -> ANS_MISSING vào skippedChecks, không error oan", () => {
  const out = validateExam({ exam_text: fx("validator-missing.txt") });
  assert.ok(!ids(out).includes("ANS_MISSING"));
  assert.ok(out.skippedChecks.some((s) => s.check === "ANS_MISSING"));
});

// ---------- định dạng ----------
test("trùng số + nhảy số + thiếu lựa chọn + đáp án trỏ câu 9", () => {
  const out = validateExam({ exam_text: fx("validator-format.txt"), hasAnswerKey: true });
  for (const id of ["NUM_DUP", "NUM_GAP", "CHOICE_MISSING", "ANS_REF_MISSING"]) {
    assert.ok(ids(out).includes(id), `thiếu ${id} trong ${JSON.stringify(ids(out))}`);
  }
  assert.equal(out.issues.find((i) => i.ruleId === "NUM_GAP").severity, "warning");
  assert.equal(out.issues.find((i) => i.ruleId === "ANS_REF_MISSING" && i.questionNumber === 9).questionNumber, 9);
});

test("parseAnswerTable không nhận nhầm nội dung câu hỏi", () => {
  assert.deepEqual(parseAnswerTable("Câu 1: gì?\nA. x\nB. y"), {}); // không tiêu đề -> {}
  const t = parseAnswerTable("Câu 1: ...\nĐáp án\n1A 2B\n\nCâu 2: Dung lượng là gì?\nA. x");
  assert.equal(t[1], "A");
  assert.equal(t[2], "B");
  assert.ok(!("Dung" in t));
});

// ---------- số học / tổng ----------
test("đáp án GV lệch kết quả tính lại -> EXPR_CHECK error; câu đúng -> im lặng", () => {
  const out = validateExam({ exam_text: fx("validator-score.txt"), hasAnswerKey: true });
  const expr = out.issues.filter((i) => i.ruleId === "EXPR_CHECK");
  assert.equal(expr.length, 1);
  assert.equal(expr[0].severity, "error");
  assert.equal(expr[0].questionNumber, 1);
  assert.match(expr[0].evidence, /12/);
});

test("safeArithEval từ chối chữ/biến, chấp nhận số thuần", () => {
  assert.equal(safeArithEval("2+3*4"), 14);
  assert.equal(safeArithEval("tìm x biết 2+2"), null);
  assert.equal(safeArithEval("sqrt(4)+1"), null);
  assert.equal(safeArithEval(""), null);
});

test("COUNT_MATCH + SCORE_SUM đúng/sai", () => {
  const qs = [{ _num: 1 }, { _num: 2 }];
  let out = validateExam({ questions: qs, expectedCount: 3 });
  assert.ok(ids(out).includes("COUNT_MATCH"));
  out = validateExam({ questions: qs, scores: { 1: 5, 2: 5 }, expectedTotal: 9 });
  assert.ok(ids(out).includes("SCORE_SUM"));
  out = validateExam({ questions: qs, scores: { 1: 5, 2: 5 }, expectedTotal: 10 });
  assert.ok(!ids(out).includes("SCORE_SUM"));
  out = validateExam({ questions: qs });
  assert.ok(out.skippedChecks.some((s) => s.check === "COUNT_MATCH"));
  assert.ok(out.skippedChecks.some((s) => s.check === "SCORE_SUM"));
});

// ---------- loại câu hỏi ----------
test("essay: không đòi lựa chọn/đáp án số; true_false thiếu lựa chọn -> error", () => {
  const essay = [{ content: "Phân tích khổ thơ...", opt_a: "", expected_answer: "" }];
  let out = validateExam({ questions: essay, questionType: "essay" });
  assert.ok(!ids(out).includes("CHOICE_MISSING"));
  const tf = [{ content: "Trái Đất quay quanh Mặt Trời.", opt_a: "Đúng", opt_b: "", expected_answer: "" }];
  out = validateExam({ questions: tf, questionType: "true_false" });
  assert.ok(ids(out).includes("CHOICE_MISSING"));
});

// ---------- ngoại lệ / thiếu input ----------
test("input rỗng -> INPUT_EMPTY + skippedChecks", () => {
  const out = validateExam({ exam_text: "   " });
  assert.equal(out.validatedQuestions, 0);
  assert.ok(ids(out).includes("INPUT_EMPTY"));
  assert.ok(out.skippedChecks.length > 0);
});

test("questions[] trực tiếp (không exam_text): raw-rules vào skippedChecks", () => {
  const out = validateExam({ questions: [{ content: "2+2=?", opt_a: "3", opt_b: "4", opt_c: "5", opt_d: "6", expected_answer: "B" }] });
  assert.equal(out.validatedQuestions, 1);
  assert.equal(out.summary.error, 0);
  assert.ok(out.skippedChecks.some((s) => /LABEL_DUP/.test(s.check)));
});

test("multi: đáp án nhiều chữ cái không báo ANS_INVALID", () => {
  const out = validateExam({
    questions: [{ content: "Chọn các số chẵn", opt_a: "2", opt_b: "3", opt_c: "4", opt_d: "5", expected_answer: "AC" }],
    questionType: "multi",
  });
  assert.ok(!ids(out).filter((id) => id === "ANS_INVALID").length || out.issues.every((i) => i.ruleId !== "ANS_INVALID" || i.severity !== "error"));
});
