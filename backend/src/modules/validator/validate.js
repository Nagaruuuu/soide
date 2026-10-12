// Facade: validateExam() — thuần code, không AI, không sửa nội dung gốc.
// Input: exam_text (tự parse) HOẶC questions[] (tự parse rồi).
// Output: { summary{error,warning,info}, issues[], validatedQuestions, skippedChecks[] }.
// severity: error | warning | info | needs_review (summary đếm needs_review riêng).
import { parseExamText } from "../parser/parser.js";
import { contentBlocks, blockNumber } from "./blocks.js";
import { checkExactDuplicates, checkNearDuplicates } from "./rules/duplicate.js";
import { checkMissingChoices, checkRawOptionProblems } from "./rules/choices.js";
import { checkNumbering, checkAnswerRefs, parseAnswerTable } from "./rules/format.js";
import { checkMissingAnswers, checkAnswerValidity, checkRawAnswers } from "./rules/answer.js";
import { checkArithmetic, checkTotals } from "./rules/arithmetic.js";

const VALID_TYPES = new Set(["single", "multi", "true_false", "essay"]);

// Rule nào chạy cho loại câu nào. essay chỉ kiểm khung (trùng/numbering).
function registryFor(questionType) {
  const base = ["duplicate", "numbering", "totals"];
  if (questionType === "essay") return [...base, "answerPresence"];
  return [...base, "choices", "rawOptions", "answerPresence", "answerValidity", "arithmetic", "answerRefs"];
}

function attachNums(questions, examText) {
  // Gán _num từ số câu trong text; câu không bắt được số -> null (rule bỏ qua).
  if (!examText) return questions.map((q, i) => ({ ...q, _num: q._num ?? q.ord ?? i + 1 }));
  const blocks = contentBlocks(examText); // block có nội dung, khớp 1:1 với parse
  return questions.map((q, i) => {
    if (q._num != null || q.ord != null) return { ...q, _num: q._num ?? q.ord };
    // chỉ zip số khi số block khớp số câu (cùng parse 1 text thì luôn khớp)
    if (blocks.length !== questions.length) return { ...q, _num: i + 1 };
    return { ...q, _num: blockNumber(blocks[i], i + 1) };
  });
}

export function validateExam(input = {}) {
  const {
    exam_text = "", questions: given = [],
    questionType = "single", hasAnswerKey = false,
    expectedLabels, expectedCount = null, expectedTotal = null, scores = null,
    answerKey = null,
  } = input ?? {};
  const issues = [];
  const skippedChecks = [];
  const type = VALID_TYPES.has(questionType) ? questionType : "single";
  const skippedType = VALID_TYPES.has(questionType) ? null : `questionType "${questionType}" không hợp lệ, dùng "single".`;

  let questions = given && given.length ? given : [];
  let text = exam_text || "";
  if (!questions.length && text) {
    const parsed = parseExamText(text);
    questions = parsed;
    if (!questions.length) {
      return {
        summary: { error: 1, warning: 0, info: 0, needs_review: 0 },
        issues: [{
          ruleId: "INPUT_EMPTY", severity: "error", questionNumber: null,
          message: "Không tách được câu hỏi nào từ văn bản.",
          evidence: "parseExamText trả về rỗng.",
          suggestion: "Kiểm tra định dạng Câu/A-D hoặc gửi questions[] trực tiếp.",
        }],
        validatedQuestions: 0,
        skippedChecks: [{ check: "*", reason: "Không có câu hỏi nên bỏ qua mọi kiểm tra." }],
      };
    }
  }
  questions = attachNums(questions, text);
  // Bảng đáp án riêng (cuối đề hoặc truyền vào): điền vào câu thiếu đáp án
  // TRƯỚC khi chạy các rule đáp án — đáp án riêng cũng là đáp án hợp lệ.
  let mergedKey = answerKey;
  if (!mergedKey && text) mergedKey = parseAnswerTable(text);
  let withNum = questions.filter((q) => q._num != null);
  if (mergedKey && Object.keys(mergedKey).length) {
    withNum = withNum.map((q) => (
      String(q.expected_answer ?? "").trim() === "" && mergedKey[q._num] != null
        ? { ...q, expected_answer: mergedKey[q._num], _answerFromKey: true }
        : q
    ));
  }
  const enabled = new Set(registryFor(type));

  if (enabled.has("duplicate")) {
    issues.push(...checkExactDuplicates(withNum), ...checkNearDuplicates(withNum));
  }
  if (enabled.has("numbering")) {
    issues.push(...checkNumbering(withNum, text));
  }
  if (enabled.has("choices")) {
    issues.push(...checkMissingChoices(withNum, { questionType: type, expectedLabels }));
  }
  if (enabled.has("rawOptions") && text) {
    issues.push(...checkRawOptionProblems(text, { questionType: type }));
  }
  if (enabled.has("rawOptions") && !text) {
    skippedChecks.push({ check: "LABEL_DUP/CHOICE_EMPTY/OPT_EXTRA", reason: "Cần exam_text thô (questions[] đã mất nhãn trùng/rỗng)." });
  }
  if (enabled.has("answerPresence")) {
    const r = checkMissingAnswers(withNum, { hasAnswerKey });
    issues.push(...r.issues);
    skippedChecks.push(...r.skipped);
  }
  if (enabled.has("answerValidity")) {
    issues.push(...checkAnswerValidity(withNum, { questionType: type }));
    // Quét thô bắt cái parser làm rơi (đáp án E, nhiều đáp án, Đ/S).
    if (text) issues.push(...checkRawAnswers(text, { questionType: type, hasAnswerKey }));
    else skippedChecks.push({ check: "ANS_INVALID(raw)", reason: "Cần exam_text thô để bắt đáp án ngoài A-D mà parser đã lọc bỏ." });
  }
  if (enabled.has("arithmetic")) {
    const r = checkArithmetic(withNum);
    issues.push(...r.issues);
    skippedChecks.push(...r.skipped);
  }
  if (enabled.has("answerRefs")) {
    let key = answerKey;
    if (!key && text) {
      key = parseAnswerTable(text);
      if (!Object.keys(key).length) {
        skippedChecks.push({ check: "ANS_REF_MISSING", reason: "Không thấy bảng đáp án cuối đề nên không đối chiếu tham chiếu." });
      }
    } else if (!key) {
      skippedChecks.push({ check: "ANS_REF_MISSING", reason: "Không có bảng đáp án (answerKey) nên không đối chiếu tham chiếu." });
    }
    if (key && Object.keys(key).length) {
      issues.push(...checkAnswerRefs(key, withNum.map((q) => q._num)));
    }
  }
  if (enabled.has("totals")) {
    const r = checkTotals({ questions: withNum, scores, expectedTotal, expectedCount });
    issues.push(...r.issues);
    skippedChecks.push(...r.skipped);
  }
  if (skippedType) skippedChecks.push({ check: "config", reason: skippedType });

  const summary = { error: 0, warning: 0, info: 0, needs_review: 0 };
  for (const it of issues) {
    if (summary[it.severity] == null) summary.needs_review++;
    else summary[it.severity]++;
  }
  return { summary, issues, validatedQuestions: withNum.length, skippedChecks };
}
