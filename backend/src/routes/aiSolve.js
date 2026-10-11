// POST /api/checks/:id/ai-solve — AI Independent Solver (opt-in).
// Giải mù từng câu RỒI mới đối chiếu đáp án dự kiến (compare riêng).
// Body: { ords?: number[] (ưu tiên), questionType?, maxQuestions?, scope? }
// Không ords -> fallback câu có findings error/review (tối đa limit).
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";
import { solveQuestions, solveConfig } from "../modules/independentSolver/solver.js";
import { compareSolution } from "../modules/independentSolver/compare.js";
import { createProvider, aiError } from "../modules/aiReview/provider.js";
import { makeRefProvider } from "../modules/knowledge/attach.js";
import { getOwnedCheck } from "./checks.js";

const r = Router();

r.post("/checks/:id/ai-solve", async (req, res, next) => {
  try {
    const { id } = req.params;
    const b = req.body ?? {};
    const check = getOwnedCheck(id);
    const cfg = solveConfig();
    if (b.maxQuestions != null) cfg.maxQuestions = Math.max(1, Math.min(10, Number(b.maxQuestions) || cfg.maxQuestions));
    let provider;
    try {
      provider = createProvider(cfg);
    } catch (e) {
      return next(e.code === "NO_KEY"
        ? aiError("NO_KEY", "Chưa cấu hình LLM_API_KEY nên không chạy giải độc lập (rule-based vẫn đầy đủ).", 400, false)
        : e);
    }
    const dbQs = db.prepare("SELECT * FROM questions WHERE check_id=? ORDER BY ord").all(id);
    if (!dbQs.length) {
      const e = new Error("Chưa có câu hỏi nào trong lần kiểm tra.");
      e.status = 400; e.code = "INPUT_EMPTY";
      throw e;
    }
    let targets = dbQs;
    if (Array.isArray(b.ords) && b.ords.length) {
      const want = new Set(b.ords.map(Number));
      targets = dbQs.filter((q) => want.has(q.ord));
      if (!targets.length) {
        const e = new Error("Danh sách ords không khớp câu nào trong đề.");
        e.status = 400; e.code = "INPUT_EMPTY";
        throw e;
      }
    } else {
      // fallback: câu có cảnh báo error/review từ các bước trước
      const flagged = new Set(db.prepare(
        "SELECT question_id FROM findings WHERE severity IN ('blocker','review') AND question_id IN (SELECT id FROM questions WHERE check_id=?)"
      ).all(id).map((r) => r.question_id));
      const risky = dbQs.filter((q) => flagged.has(q.id));
      targets = risky.length ? risky : dbQs;
    }
    const scope = {
      subject: check.subject || b.scope?.subject,
      grade: check.grade || b.scope?.grade,
      bookSeries: b.scope?.bookSeries,
      scope: b.scope?.scope,
      questionType: b.questionType || "single",
    };
    // Dấu vết chống lộ: solver KHÔNG bao giờ nhận reviewer conclusions (ký để rõ).
    // RAG opt-in (mặc định tắt), gắn sau rào chắn mù trong solver.
    const referencesUsed = {};
    const refProvider = b.useReferences === true
      ? makeRefProvider({ subject: scope.subject, grade: scope.grade, bookSeries: scope.bookSeries }, referencesUsed)
      : null;
    const { solutions, usage, skipped, meta } = await solveQuestions({
      questions: targets, scope, reviewerConclusions: [], provider, cfg, refProvider,
    });
    const finsIns = db.prepare("INSERT INTO findings(id,question_id,severity,category,evidence,expected_answer,suggested_answer,fix_suggestion,confidence,verification_method,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
    const saved = [];
    const comparisons = [];
    for (const s of solutions) {
      const q = dbQs.find((x) => (x.ord === s.questionNumber));
      if (!q) {
        skipped.push({ questionNumber: s.questionNumber, reason: "Kết quả giải trỏ số câu không có trong đề." });
        continue;
      }
      const cmp = compareSolution(s, q.expected_answer);
      comparisons.push({ ...cmp, codeChecked: !!s.codeChecked });
      if (cmp.verdict === "match") continue; // khớp thì không lưu, tránh nhiễu
      const isMismatch = cmp.verdict === "mismatch";
      const isSuggest = cmp.verdict === "suggest";
      const fid = randomUUID();
      const evidence = isMismatch
        ? `Giải độc lập chọn ${cmp.independentAnswer}, đáp án dự kiến ${cmp.expectedAnswer}. Lập luận: ${s.reasoningSummary}`
        : isSuggest
          ? `AI giải độc lập đề xuất đáp án ${cmp.independentAnswer}. Lập luận: ${s.reasoningSummary}`
          : `Chưa đối chiếu được (${s.status}). ${s.reasoningSummary}`;
      finsIns.run(fid, q.id, isMismatch ? "review" : "hint",
        isMismatch ? "ai_solution_mismatch" : isSuggest ? "ai_solution_suggest" : "ai_solution_needs_review",
        evidence.slice(0, 900), q.expected_answer ?? "", (isMismatch || isSuggest) ? (cmp.independentAnswer ?? "") : "",
        isMismatch ? "GV kiểm tra lại đáp án dự kiến — mismatch chưa kết luận bên nào đúng."
          : isSuggest ? "Đề xuất từ giải mù — GV kiểm tra rồi chốt đáp án."
          : "GV xem xét bổ sung dữ kiện/làm rõ câu hỏi.",
        "thấp", "llm-suggest", "pending");
      saved.push({ id: fid, question_id: q.id, questionNumber: q.ord, severity: isMismatch ? "review" : "hint", ...cmp });
    }
    res.json({
      check_id: id,
      solved: solutions.length,
      comparisons,
      findings: saved,
      usage: { ...usage, model: meta.model },
      skipped,
      ...(b.useReferences === true ? { referencesUsed } : {}),
      meta: { ...meta, confidence: "omitted (chưa hiệu chỉnh — không bịa điểm số)" },
    });
  } catch (e) { next(e); }
});

export default r;
