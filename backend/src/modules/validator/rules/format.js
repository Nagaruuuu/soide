// Lỗi định dạng đánh số và tham chiếu: trùng số (error), nhảy số (warning —
// có thể chủ ý bỏ câu), câu rỗng (error), đáp án trỏ câu không tồn tại (error).
// Không kết luận lỗi chỉ vì khác mẫu trình bày.
import { splitQuestionBlocks } from "../../parser/parser.js";

function issue(ruleId, severity, questionNumber, message, evidence, suggestion) {
  return { ruleId, severity, questionNumber, message, evidence, suggestion };
}

// questions đã parse (có _num) + exam_text (để bắt câu rỗng parser đã lọc bỏ).
export function checkNumbering(questions = [], examText = "") {
  const issues = [];
  const counts = new Map();
  for (const q of questions) {
    if (q._num == null) continue;
    counts.set(q._num, (counts.get(q._num) || 0) + 1);
  }
  for (const [num, c] of counts) {
    if (c > 1) {
      issues.push(issue("NUM_DUP", "error", num,
        `Trùng số câu ${num} (${c} câu).`,
        `Số ${num} xuất hiện ${c} lần trong đề.`,
        "Đánh lại số thứ tự liên tục trước khi chấm/tính điểm."));
    }
  }
  const ords = [...counts.keys()].sort((a, b) => a - b);
  for (let i = 1; i < ords.length; i++) {
    if (ords[i] !== ords[i - 1] + 1) {
      issues.push(issue("NUM_GAP", "warning", ords[i],
        `Nhảy số từ câu ${ords[i - 1]} sang câu ${ords[i]}.`,
        `Thiếu các số ${ords[i - 1] + 1}–${ords[i] - 1} trong dãy đánh số.`,
        "Nếu bỏ câu chủ ý thì bỏ qua; nếu thiếu câu thật thì bổ sung."));
      break; // chỉ báo 1 lần để khỏi spam
    }
  }
  // Câu rỗng: block đánh số có dấu phân cách nhưng không còn nội dung
  // (vd "Câu 5:" trơ trụi). Mảnh vụn split ("Câu 2" không dấu phân cách) thì bỏ qua.
  if (examText && String(examText).trim()) {
    const blocks = splitQuestionBlocks(String(examText));
    for (const block of blocks) {
      const m = block.match(/^\s*(Câu|Bài)?\s*(\d+)([\s.)\s:]*)/i);
      if (!m) continue;
      const body = block.slice(m[0].length).trim();
      if (!body && /[.):]/.test(m[3] || "")) {
        issues.push(issue("Q_EMPTY", "error", Number(m[2]),
          `Câu ${m[2]} không có nội dung.`,
          `Sau số câu ${m[2]} không còn chữ nào.`,
          "Bổ sung nội dung câu hỏi hoặc xóa số câu thừa."));
      }
    }
  }
  return issues;
}

// ANS_REF_MISSING (error): bảng đáp án cuối đề trỏ tới số câu không tồn tại.
// answerKey: { [num]: "A" } — ví dụ parse từ đoạn "Đáp án: 1A 2B ..." truyền vào.
export function checkAnswerRefs(answerKey = {}, existingNums = []) {
  const issues = [];
  const set = new Set(existingNums);
  for (const [numStr, ans] of Object.entries(answerKey)) {
    const num = Number(numStr);
    if (!set.has(num)) {
      issues.push(issue("ANS_REF_MISSING", "error", num,
        `Đáp án trỏ tới câu ${num} không tồn tại trong đề.`,
        `Bảng đáp án ghi câu ${num} = ${ans} nhưng đề không có câu này.`,
        "Sửa số câu trong bảng đáp án hoặc bổ sung câu còn thiếu."));
    }
  }
  return issues;
}

// Parse bảng đáp án cuối đề (best-effort). CHỈ parse phần sau tiêu đề đáp án
// ("Đáp án"/"Answer key"/"Bảng đáp án") để khỏi nhận nhầm nội dung câu hỏi
// (vd "Câu 2: Dung..." sẽ thành {2:"D"} nếu quét thô). Không thấy tiêu đề thì
// trả {} để caller ghi skippedChecks thay vì đoán.
export function parseAnswerTable(text = "") {
  const out = {};
  const src = String(text ?? "");
  const lines = src.split("\n");
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^(đáp án|dap an|answer\s*key|bảng đáp án|bang dap an)\b/i.test(lines[i].trim())) { start = i; break; }
  }
  if (start < 0) return out;
  let found = 0;
  for (const line of lines.slice(start + 1, start + 61)) {
    const t = line.trim();
    if (!t) continue; // bảng đáp án hay cách dòng
    if (found >= 60) break;
    // Dạng 1: cả dòng là 1 đáp án — "Câu 1: A" / "2-B". Chữ cái phải chiếm hết
    // phần còn lại nên "2. Dung..." không bao giờ lọt.
    let m = t.match(/^(?:câu\s*)?(\d{1,3})\s*[:\-.)]\s*([A-Fa-f])\s*$/i);
    if (m) { out[Number(m[1])] = m[2].toUpperCase(); found++; continue; }
    // Dạng 2: dãy compact "1A 2B 3C" / "1-A, 2-B" — cả dòng chỉ gồm token đáp án.
    const toks = t.split(/[\s,;]+/).filter(Boolean);
    if (toks.length && toks.every((tok) => /^(\d{1,3})[:\-.)]?([A-Fa-f])$/i.test(tok))) {
      for (const tok of toks) {
        const mm = tok.match(/^(\d{1,3})[:\-.)]?([A-Fa-f])$/i);
        out[Number(mm[1])] = mm[2].toUpperCase();
        found++;
      }
    }
    // Dòng khác (câu chữ, số liệu): bỏ qua, không đoán.
  }
  return out;
}
