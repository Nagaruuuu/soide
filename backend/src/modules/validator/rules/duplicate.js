// DUP_EXACT (error): trùng 100% sau chuẩn hóa. DUP_NEAR (warning): gần giống,
// không tự kết luận là trùng — GV quyết.
import { questionFingerprint, tokenCosine } from "../normalize.js";

const NEAR_THRESHOLD = 0.88;

function issue(ruleId, severity, questionNumber, message, evidence, suggestion) {
  return { ruleId, severity, questionNumber, message, evidence, suggestion };
}

export function checkExactDuplicates(questions = []) {
  const issues = [];
  const seen = new Map(); // fingerprint -> index câu đầu tiên
  questions.forEach((q, i) => {
    const fp = questionFingerprint(q);
    if (!fp.replace(/\|/g, "").trim()) return; // câu rỗng do format.js xử lý
    if (seen.has(fp)) {
      issues.push(issue(
        "DUP_EXACT", "error", q._num ?? i + 1,
        `Câu trùng hệt câu ${seen.get(fp).num}.`,
        `Nội dung sau chuẩn hóa giống 100% câu ${seen.get(fp).num}.`,
        "Xóa bớt 1 câu hoặc viết lại nếu là 2 câu khác nhau."
      ));
    } else {
      seen.set(fp, { num: q._num ?? i + 1 });
    }
  });
  return issues;
}

export function checkNearDuplicates(questions = []) {
  const issues = [];
  const reported = new Set(); // mỗi câu chỉ báo 1 lần để khỏi spam theo cặp
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      if (reported.has(j)) continue;
      const a = questions[i], b = questions[j];
      const textA = [a.content, a.opt_a, a.opt_b, a.opt_c, a.opt_d].join(" ");
      const textB = [b.content, b.opt_a, b.opt_b, b.opt_c, b.opt_d].join(" ");
      if (!textA.trim() || !textB.trim()) continue;
      if (questionFingerprint(a) === questionFingerprint(b)) continue; // đã báo DUP_EXACT
      const sim = tokenCosine(textA, textB);
      if (sim >= NEAR_THRESHOLD) {
        issues.push(issue(
          "DUP_NEAR", "warning", b._num ?? j + 1,
          `Câu gần giống câu ${a._num ?? i + 1} (~${Math.round(sim * 100)}%).`,
          `Độ giống ${(sim).toFixed(2)} — có thể là biến thể hợp lệ, chưa kết luận trùng.`,
          "Đối chiếu 2 câu: nếu trùng ý thì giữ 1 câu."
        ));
        reported.add(j);
        break; // mỗi câu chỉ báo 1 lần để khỏi spam
      }
    }
  }
  return issues;
}
