// Lựa chọn trắc nghiệm: thiếu / nhãn lỗi / rỗng — theo questionType, không mặc
// định mọi câu đều A/B/C/D. Nhãn trùng + rỗng chỉ thấy được trên text thô
// (parser đã gộp), nên rule này chạy trên exam_text khi có.
import { normalizeLabel } from "../normalize.js";

function issue(ruleId, severity, questionNumber, message, evidence, suggestion) {
  return { ruleId, severity, questionNumber, message, evidence, suggestion };
}

// Nhãn kỳ vọng theo loại câu; caller có thể ghi đè qua expectedLabels.
export function expectedLabelsFor(questionType = "single", expectedLabels) {
  if (Array.isArray(expectedLabels) && expectedLabels.length) return expectedLabels.map((l) => String(l).toUpperCase());
  if (questionType === "single" || questionType === "multi") return ["A", "B", "C", "D"];
  return []; // true_false: chỉ đếm số lượng; essay: không yêu cầu lựa chọn
}

const OPT_KEYS = { A: "opt_a", B: "opt_b", C: "opt_c", D: "opt_d", E: "opt_e", F: "opt_f" };

function presentLabels(q) {
  const out = [];
  for (const [label, key] of Object.entries(OPT_KEYS)) {
    if (q[key] != null && String(q[key]).trim() !== "") out.push(label);
  }
  // câu chỉ có opt_a..d (pipeline cũ): vẫn suy ra nhãn A-D
  return out;
}

// CHOICE_MISSING (error): thiếu nhãn kỳ vọng.
export function checkMissingChoices(questions = [], { questionType = "single", expectedLabels } = {}) {
  const issues = [];
  if (questionType === "essay") return issues;
  const expected = expectedLabelsFor(questionType, expectedLabels);
  questions.forEach((q, i) => {
    const num = q._num ?? i + 1;
    if (questionType === "true_false") {
      const n = presentLabels(q).length;
      if (n < 2) {
        issues.push(issue("CHOICE_MISSING", "error", num,
          "Câu đúng/sai có chưa tới 2 lựa chọn.",
          `Mới thấy ${n} lựa chọn có nội dung.`,
          "Bổ sung đủ 2 lựa chọn (ví dụ Đúng/Sai hoặc A/B)."));
      }
      return;
    }
    for (const label of expected) {
      const key = OPT_KEYS[label];
      const val = key ? q[key] : undefined;
      if (val == null || String(val).trim() === "") {
        issues.push(issue("CHOICE_MISSING", "error", num,
          `Thiếu lựa chọn ${label}.`,
          `Không tìm thấy nội dung cho nhãn ${label} (loại câu: ${questionType}).`,
          `Bổ sung lựa chọn ${label} hoặc sửa nhãn bị đánh sai.`));
      }
    }
  });
  return issues;
}

// Quét text thô: LABEL_DUP (error), CHOICE_EMPTY (error), OPT_EXTRA/OPT_BAD_FORMAT (info/warning).
// Dùng splitQuestionBlocks dùng chung với parser để block khớp câu đã parse.
import { contentBlocks, blockNumber } from "../blocks.js";
export function checkRawOptionProblems(examText = "", { questionType = "single" } = {}) {
  const issues = [];
  const text = String(examText ?? "");
  if (!text.trim()) return issues;
  const blocks = contentBlocks(text); // block có nội dung, khớp câu đã parse
  blocks.forEach((block, bi) => {
    const num = blockNumber(block, bi + 1);
    const seen = new Map();
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      // dòng đáp án/lời giải: bỏ qua, do answer.js xử lý
      if (/^(đáp án|dap an|answer|lời giải|loi giai)/i.test(t)) continue;
      const m = t.match(/^[(（]?([A-Za-z])[)）.\-:)\]]\s*(.*)$/);
      if (!m) {
        // dòng bắt đầu giống nhãn nhưng dính liền nội dung, vd "A.xyz" không cách
        if (/^[(（]?[A-Za-z][)）.\-:)\]]\S/.test(t)) {
          issues.push(issue("OPT_BAD_FORMAT", "warning", num,
            "Dòng lựa chọn sai định dạng (thiếu khoảng trắng sau nhãn).",
            `Dòng: "${t.slice(0, 60)}"`,
            "Viết dạng “A. nội dung” để máy tách chắc chắn; vẫn đọc được bằng mắt nên chỉ cảnh báo."));
        }
        continue;
      }
      const label = m[1].toUpperCase();
      if (!/^[A-F]$/.test(label)) continue; // nhãn ngoài A-F: không kết luận
      const body = (m[2] || "").trim();
      // nhãn E/F ở loại single: có thể là đề 5-6 lựa chọn hợp lệ -> info, không kết luận sai
      if ((label === "E" || label === "F") && questionType === "single" && body) {
        issues.push(issue("OPT_EXTRA", "info", num,
          `Câu có thêm lựa chọn ${label} ngoài A-D.`,
          `Dòng: "${t.slice(0, 60)}"`,
          "Nếu đề cố ý 5-6 lựa chọn thì bỏ qua; nếu gõ nhầm nhãn thì sửa."));
        continue;
      }
      if (seen.has(label)) {
        issues.push(issue("LABEL_DUP", "error", num,
          `Nhãn lựa chọn ${label} bị lặp trong cùng câu.`,
          `Nhãn ${label} xuất hiện ${seen.get(label) + 1} lần.`,
          "Đánh lại nhãn liên tục (A, B, C, D...) — máy chỉ giữ lại lựa chọn đầu tiên."));
        seen.set(label, seen.get(label) + 1);
      } else {
        seen.set(label, 1);
        if (!body) {
          issues.push(issue("CHOICE_EMPTY", "error", num,
            `Lựa chọn ${label} không có nội dung.`,
            `Dòng "${t}" chỉ có nhãn.`,
            "Bổ sung nội dung cho lựa chọn hoặc xóa nhãn thừa."));
        }
      }
    }
  });
  return issues;
}
