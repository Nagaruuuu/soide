// Gộp findings rules + solver sandbox + LLM, xếp severity, gắn nhãn trung thực.
const ORDER = { blocker: 0, review: 1, hint: 2, ok: 3 };

export function aggregate(q, check = {}, ruleFindings = [], extra = {}) {
  const out = [...ruleFindings];
  const group = check.group_kind || "H";

  // AI Reviewer: high/medium/low -> review/hint/hint. AI KHÔNG bao giờ blocker.
  const AI_SEV = { high: "review", medium: "hint", low: "hint" };
  for (const f of extra.aiReview || []) {
    if (!f || typeof f !== "object") continue;
    out.push({
      severity: AI_SEV[f.severity] || "hint",
      category: `ai_${String(f.issueType || "AMBIGUOUS").toLowerCase()}`,
      evidence: `${f.evidence || ""}${f.reference ? ` (Nguồn theo AI: ${f.reference} — cần GV kiểm chứng)` : ""}`,
      fix_suggestion: f.suggestion || f.explanation || "AI gợi ý xem lại — GV quyết định.",
      verification_method: "llm-suggest", confidence: "thấp",
      expected_answer: q.expected_answer, suggested_answer: "",
    });
  }

  // Nhóm T: đáp án số không khớp solver -> blocker computed kèm phép tính
  if (group === "T" && extra.solver && typeof extra.solver.value === "number" && !extra.solver.unavailable) {
    const m = extra.solver.matchLetter;
    if (m && q.expected_answer && m !== q.expected_answer) {
      out.push({
        severity: "blocker", category: "dap_an_sai",
        evidence: `Máy tính lại: ${extra.solver.steps} → ${m}, khác đáp án GV (${q.expected_answer}).`,
        fix_suggestion: `Đổi đáp án sang ${m} hoặc kiểm tra lại phép tính.`,
        verification_method: "computed", confidence: "cao",
        expected_answer: q.expected_answer, suggested_answer: m,
      });
    } else if (!m && q.expected_answer) {
      out.push({
        severity: "review", category: "solver_khong_khop",
        evidence: `Máy tính ra ${extra.solver.value} (${extra.solver.steps}) nhưng không khớp A/B/C/D.`,
        fix_suggestion: "Kiểm tra lại số liệu và các phương án.",
        verification_method: "computed", confidence: "vừa",
        expected_answer: q.expected_answer, suggested_answer: "",
      });
    }
  }

  // LLM: chỉ nhận khi có verification llm-suggest, confidence thấp -> giữ nguyên cảnh báo vàng
  if (extra.llm && extra.llm.category && !extra.llm.status) {
    const sev = group === "H" && extra.llm.severity === "blocker" ? "review" : extra.llm.severity;
    out.push({
      severity: sev, category: extra.llm.category, evidence: extra.llm.evidence,
      fix_suggestion: extra.llm.fix_suggestion || "chưa thể kết luận — cần GV quyết",
      verification_method: "llm-suggest", confidence: extra.llm.confidence || "thấp",
      expected_answer: q.expected_answer, suggested_answer: extra.llm.suggested_answer || "",
    });
  }
  if (extra.llm?.status === "fallback" || extra.llm?.status === "no-key") {
    // không thêm finding giả; rules đã đủ. UI hiển thị banner "chưa cấu hình key" riêng.
  }

  // Nhóm H: cấm blocker đáp án (trung thực)
  const fixed = out.map((f) => {
    if (group === "H" && f.severity === "blocker" && f.category !== "thieu_thanh_phan")
      return { ...f, severity: "review", verification_method: f.verification_method || "rule", confidence: f.confidence || "vừa" };
    return f;
  });

  // dedup theo category + sort blocker>review>hint>ok
  const seen = new Set();
  return fixed.filter((f) => {
    const k = f.category + "|" + f.evidence;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));
}
