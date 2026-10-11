// POST /api/checks/:id/ai-review — AI Question Reviewer (opt-in, sau run).
// Lưu findings llm-suggest vào DB để hiện cùng C_Results/E_Report.
// Body: { questionType?, hasAnswerKey?, maxQuestions? }
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";
import { validateExam } from "../modules/validator/validate.js";
import { reviewQuestions } from "../modules/aiReview/review.js";
import { createProvider, aiConfig, aiError } from "../modules/aiReview/provider.js";
import { makeRefProvider } from "../modules/knowledge/attach.js";
import { aggregate } from "../modules/aggregator/aggregator.js";
import { getOwnedCheck } from "./checks.js";

const r = Router();

r.post("/checks/:id/ai-review", async (req, res, next) => {
  try {
    const { id } = req.params;
    const b = req.body ?? {};
    const check = getOwnedCheck(id);
    const cfg = aiConfig();
    if (b.maxQuestions != null) cfg.maxQuestions = Math.max(1, Math.min(20, Number(b.maxQuestions) || cfg.maxQuestions));
    let provider;
    try {
      provider = createProvider(cfg);
    } catch (e) {
      return next(e.code === "NO_KEY"
        ? aiError("NO_KEY", "Chưa cấu hình LLM_API_KEY nên không chạy AI review (rule-based vẫn đầy đủ).", 400, false)
        : e);
    }
    const dbQs = db.prepare("SELECT * FROM questions WHERE check_id=? ORDER BY ord").all(id);
    if (!dbQs.length) {
      const e = new Error("Chưa có câu hỏi nào trong lần kiểm tra.");
      e.status = 400; e.code = "INPUT_EMPTY";
      throw e;
    }
    const v = validateExam({
      questions: dbQs,
      questionType: b.questionType || "single",
      hasAnswerKey: b.hasAnswerKey === true,
    });
    // RAG opt-in (mặc định tắt): trích dẫn sách khớp môn/lớp vào prompt
    const referencesUsed = {};
    const refProvider = b.useReferences === true
      ? makeRefProvider({ subject: check.subject, grade: check.grade }, referencesUsed)
      : null;
    const { findings, usage, skipped, meta } = await reviewQuestions({
      questions: dbQs, validatorIssues: v.issues, provider, cfg, refProvider,
    });
    // Map questionNumber -> question id; AI không bao giờ blocker (aggregator ép).
    const byNum = new Map(dbQs.map((q) => [q.ord, q]));
    const finsIns = db.prepare("INSERT INTO findings(id,question_id,severity,category,evidence,expected_answer,suggested_answer,fix_suggestion,confidence,verification_method,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
    const saved = [];
    for (const f of findings) {
      const q = byNum.get(f.questionNumber);
      if (!q) {
        skipped.push({ questionNumber: f.questionNumber, reason: "AI trả số câu không có trong đề." });
        continue;
      }
      const mapped = aggregate(q, check, [], { aiReview: [f] });
      for (const m of mapped) {
        const fid = randomUUID();
        finsIns.run(fid, q.id, m.severity, m.category, m.evidence, m.expected_answer ?? "", m.suggested_answer ?? "", m.fix_suggestion ?? "", m.confidence ?? "thấp", m.verification_method ?? "llm-suggest", "pending");
        saved.push({ id: fid, question_id: q.id, questionNumber: q.ord, ...f, severity: m.severity });
      }
    }
    res.json({
      check_id: id,
      findings: saved,
      usage: { ...usage, model: meta.model },
      skipped,
      ...(b.useReferences === true ? { referencesUsed } : {}),
      meta: { ...meta, confidence: "omitted (chưa hiệu chỉnh — không bịa điểm số)" },
    });
  } catch (e) { next(e); }
});

export default r;
