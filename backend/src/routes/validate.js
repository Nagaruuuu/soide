// POST /api/validate — Rule-based Question Validator (không AI).
// Body: { exam_text? | questions[]?, questionType?, hasAnswerKey?, expectedLabels?,
//         expectedCount?, expectedTotal?, scores?, answerKey? }
import { Router } from "express";
import { validateExam } from "../modules/validator/validate.js";

const r = Router();

r.post("/validate", (req, res, next) => {
  try {
    const b = req.body ?? {};
    const text = typeof b.exam_text === "string" ? b.exam_text : "";
    if (text.length > 20_000) {
      return res.status(413).json({ error_code: "INPUT_TOO_LONG", message_vi: "Nội dung quá dài (tối đa ~20.000 ký tự).", retryable: false });
    }
    if (Array.isArray(b.questions) && b.questions.length > 50) {
      return res.status(413).json({ error_code: "INPUT_TOO_LONG", message_vi: "Tối đa 50 câu/lần.", retryable: false });
    }
    if (!text.trim() && !(Array.isArray(b.questions) && b.questions.length)) {
      return res.status(400).json({ error_code: "INPUT_EMPTY", message_vi: "Cần exam_text hoặc questions[].", retryable: false });
    }
    const out = validateExam({
      exam_text: text,
      questions: Array.isArray(b.questions) ? b.questions.slice(0, 50) : [],
      questionType: b.questionType || "single",
      hasAnswerKey: b.hasAnswerKey === true,
      expectedLabels: b.expectedLabels,
      expectedCount: b.expectedCount ?? null,
      expectedTotal: b.expectedTotal ?? null,
      scores: b.scores ?? null,
      answerKey: b.answerKey ?? null,
    });
    res.json(out);
  } catch (e) { next(e); }
});

export default r;
