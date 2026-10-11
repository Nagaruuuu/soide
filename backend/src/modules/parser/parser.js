// Tách đề text thành mảng câu trắc nghiệm 4 lựa chọn.
// Hỗ trợ: mỗi option 1 dòng, 4 options trên 1 dòng, (A)/(B)/(C)/(D), numbering loạn.
export function parseExamText(text = "") {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const chunks = splitChunks(normalized);
  const out = [];
  const warnings = [];
  const seenOrd = new Map();
  for (let i = 0; i < chunks.length; i++) {
    const q = parseOne(chunks[i]);
    if (q && q.content) {
      out.push(q);
      const n = extractOrd(chunks[i]);
      if (n != null) {
        if (seenOrd.has(n)) warnings.push(`Trùng số câu ${n} (câu ${seenOrd.get(n)} và câu ${out.length}).`);
        else seenOrd.set(n, out.length);
      }
    }
  }
  // phát hiện nhảy số: 1,2,4...
  const ords = [...seenOrd.keys()].sort((a, b) => a - b);
  for (let i = 1; i < ords.length; i++) {
    if (ords[i] !== ords[i - 1] + 1) {
      warnings.push(`Đánh số nhảy từ câu ${ords[i - 1]} sang câu ${ords[i]} — kiểm tra thiếu câu.`);
      break;
    }
  }
  out.warnings = warnings;
  return out;
}

// Tách text thô thành block theo mốc Câu/Bài/N. (đã gộp mảnh vụn do capturing
// group trong split). Dùng chung cho validator để block khớp 1:1 với questions.
export function splitQuestionBlocks(text = "") {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const parts = normalized.split(/(?=^\s*(Câu\s*\d+|Bài\s*\d+|\d+\s*[.)]\s))/gim)
    .map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return [normalized].map((s) => s.trim()).filter(Boolean);
  const merged = [];
  for (const p of parts) {
    if (/^(Câu\s*\d+|Bài\s*\d+|\d+\s*[.)])\s*/i.test(p)) merged.push(p);
    else if (merged.length) merged[merged.length - 1] += "\n" + p;
    else merged.push(p);
  }
  return merged.length ? merged : [normalized];
}

function splitChunks(text) {
  // Tách theo Câu/Bài/N. khi ở đầu dòng (hoặc đầu chuỗi)
  return splitQuestionBlocks(text);
}

function extractOrd(chunk) {
  const m = String(chunk).match(/^\s*(Câu|Bài)?\s*(\d+)\s*[.)\:]/i);
  return m ? Number(m[2]) : null;
}

export function parseOne(block) {  let text = String(block || "").trim();
  if (!text) return null;
  const q = { content: "", opt_a: "", opt_b: "", opt_c: "", opt_d: "", expected_answer: "", explanation: "" };

  // Lời giải / đáp án ở cuối block (lấy trước để khỏi nuốt vào options)
  let m = text.match(/(lời giải|loi giai|giải thích|giai thich|hướng dẫn|huong dan)\s*[:\-]\s*([\s\S]+)$/i);
  if (m) { q.explanation = m[2].trim(); text = text.slice(0, m.index).trim(); }
  m = text.match(/(đáp án|dap an|answer)\s*[:\-]\s*([A-Da-d])\s*$/im);
  if (m) {
    q.expected_answer = m[2].toUpperCase();
    text = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim();
    // đáp án dính cuối option D: "... D. xyz B" -> đã tách ở trên, còn sót thì quét lại sau
  } else {
    const mInline = text.match(/(đáp án|dap an|answer)\s*[:\-]?\s*([A-Da-d])\b/i);
    if (mInline) { q.expected_answer = mInline[2].toUpperCase(); text = text.replace(mInline[0], " ").trim(); }
  }

  // Thử tách inline 1 dòng: A. xxx B. yyy C. zzz D. www
  const inline = splitInlineOptions(text);
  if (inline) {
    q.content = inline.content;
    q.opt_a = inline.a; q.opt_b = inline.b; q.opt_c = inline.c; q.opt_d = inline.d;
    return cleanup(q);
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const optRe = (letter) => new RegExp(
    `^(?:[\\(\\（]${letter}[\\)\\）]|${letter}[\\.\\):\\-])\\s*(.+)`, "i"
  );
  for (const ln of lines) {
    let mm = ln.match(optRe("A"));
    if (mm && !q.opt_a) { q.opt_a = stripTrailingAnswer(mm[1], q); continue; }
    mm = ln.match(optRe("B"));
    if (mm && !q.opt_b) { q.opt_b = stripTrailingAnswer(mm[1], q); continue; }
    mm = ln.match(optRe("C"));
    if (mm && !q.opt_c) { q.opt_c = stripTrailingAnswer(mm[1], q); continue; }
    mm = ln.match(optRe("D"));
    if (mm && !q.opt_d) { q.opt_d = stripTrailingAnswer(mm[1], q); continue; }
    mm = ln.match(/(đáp án|dap an|answer)\s*[:\-]\s*([A-Da-d])/i);
    if (mm) { q.expected_answer = mm[2].toUpperCase(); continue; }
    if (!q.content) q.content = ln.replace(/^(Câu\s*\d+|Bài\s*\d+|\d+\s*[.)\:\s]*)/i, "").trim();
    else q.content += " " + ln.replace(/^(Câu\s*\d+|Bài\s*\d+|\d+\s*[.)\:\s]*)/i, "").trim();
  }
  return cleanup(q);
}

function stripTrailingAnswer(optText, q) {
  // "24 Đáp án: B" -> option "24", gán expected_answer
  const m = String(optText).match(/^(.*)(đáp án|dap an|answer)\s*[:\-]\s*([A-Da-d])\s*$/i);
  if (m) { if (!q.expected_answer) q.expected_answer = m[3].toUpperCase(); return m[1].trim(); }
  return String(optText).trim();
}

function splitInlineOptions(text) {
  // tìm vị trí A/B/C/D dạng "A. " / "A) " / "(A)" trên cùng block
  const idx = ["A", "B", "C", "D"].map((L) => {
    const re = new RegExp(`(?:^|\\s)(?:[\\(\\（]${L}[\\)\\）]|${L}[\\.\\):\\-])\\s+`, "i");
    const mm = re.exec(text);
    return mm ? mm.index + mm[0].length - mm[0].trimStart().length - 0 : -1;
  });
  // cách đơn giản hơn: split bằng regex giữ delimiter
  const re = /(?:^|\s)(?:[\(（]([A-Da-d])[\)）]|([A-Da-d])[\.\):\-])\s+/g;
  const marks = [];
  let mm;
  while ((mm = re.exec(text)) !== null) {
    marks.push({ letter: (mm[1] || mm[2]).toUpperCase(), index: mm.index, len: mm[0].length });
  }
  const seq = marks.filter((x, i, arr) => i === 0 || x.letter !== arr[i - 1].letter);
  const ia = seq.findIndex((x) => x.letter === "A");
  if (ia < 0) return null;
  const slice4 = seq.slice(ia, ia + 4);
  if (slice4.map((x) => x.letter).join("") !== "ABCD") return null;
  const content = text.slice(0, slice4[0].index).replace(/^(Câu\s*\d+|Bài\s*\d+|\d+\s*[.)\:\s]*)/i, "").trim();
  const parts = slice4.map((mk, i) => {
    const start = mk.index + mk.len;
    const end = i < 3 ? slice4[i + 1].index : text.length;
    return text.slice(start, end).trim();
  });
  if (parts.some((p) => !p)) return null;
  // loại đáp án dính ở cuối D
  const q = { expected_answer: "" };
  parts[3] = stripTrailingAnswer(parts[3], q);
  return { content, a: parts[0], b: parts[1], c: parts[2], d: parts[3], _ans: q.expected_answer };
}

function cleanup(q) {
  // splitInlineOptions có thể đã tìm đáp án nhưng chưa gán (trường hợp inline)
  if (!q.expected_answer && q._ans) q.expected_answer = q._ans;
  delete q._ans;
  q.content = (q.content || "").replace(/\s+/g, " ").trim();
  for (const k of ["opt_a", "opt_b", "opt_c", "opt_d", "explanation"]) q[k] = (q[k] || "").replace(/\s+/g, " ").trim();
  return q;
}
