// Block câu hỏi THỰC (có nội dung) từ text thô — lọc mảnh vụn do capturing
// group trong split (vd "Câu 2" trơ trụi). Cùng tiêu chí với parseExamText
// (parseOne -> content non-empty) nên khớp 1:1 với mảng questions đã parse.
import { splitQuestionBlocks, parseOne } from "../parser/parser.js";

export function contentBlocks(examText = "") {
  return splitQuestionBlocks(examText).filter((b) => {
    const q = parseOne(b);
    return q && q.content;
  });
}

export function blockNumber(block, fallback = null) {
  const m = String(block).match(/^\s*(Câu|Bài)?\s*(\d+)\s*[.)\s:]/i);
  return m ? Number(m[2]) : fallback;
}
