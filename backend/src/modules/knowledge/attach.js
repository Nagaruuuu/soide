// Gắn trích dẫn RAG vào prompt AI (opt-in). Chỉ nguồn retrieve thật được viện dẫn;
// không có nguồn -> không thêm gì (AI giữ nguyên tắc "không bịa nguồn").
import { retrieve, formatCitations } from "./retrieve.js";

export function questionTextOf(q = {}) {
  return [q.content, q.opt_a, q.opt_b, q.opt_c, q.opt_d].filter((s) => String(s ?? "").trim()).join("\n");
}

export function referencesBlock(citations = []) {
  if (!citations?.length) return "";
  return `<references>\n${formatCitations(citations)}\n(NGUỒN THẬT duy nhất được phép viện dẫn: chỉ ghi đúng [Nguồn N] kèm tên/chương/trang như trên. Không có trong danh sách thì KHÔNG được bịa nguồn khác.)</references>`;
}

// refProvider(questionText, question) -> citations[]; used thu lại để trả về response.
export function makeRefProvider(meta = {}, used = {}) {
  return async (questionText, q) => {
    try {
      const r = await retrieve({ query: questionText, ...meta });
      const cites = r.status === "found" ? r.citations : [];
      const num = q?._num ?? q?.ord;
      if (num != null && cites.length) used[num] = cites;
      return cites;
    } catch {
      return [];
    }
  };
}
