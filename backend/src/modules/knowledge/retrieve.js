// Retrieve: lọc metadata (môn/lớp/bộ) -> cosine brute-force trên SQLite ->
// trên ngưỡng mới trả trích dẫn; không đạt -> { status: "no_reference_found" }.
// Không bao giờ bịa nguồn/trang, không kết luận đúng/sai.
import { db } from "../../db/db.js";
import { cosine, embedTexts } from "./embed.js";

export function ragConfig() {
  return {
    topK: Number(process.env.RAG_TOP_K || 3),
    minScore: Number(process.env.RAG_MIN_SCORE || 0.15),
  };
}

// citations: [{ content, title, chapter, page, score, textbook_id }]
export async function retrieve({ query = "", subject, grade, bookSeries, topK, minScore, embedCfg, _rows } = {}) {
  const cfg = { ...ragConfig(), ...(topK != null ? { topK } : {}), ...(minScore != null ? { minScore } : {}) };
  const q = String(query ?? "").trim();
  if (!q) return { status: "no_reference_found", reason: "Câu truy vấn rỗng.", citations: [] };
  let rows = _rows ?? db.prepare(
    `SELECT c.id, c.content, c.chapter, c.page, c.embedding, c.textbook_id,
            t.title, t.subject, t.grade, t.book_series
     FROM chunks c JOIN textbooks t ON t.id = c.textbook_id`
  ).all();
  // lọc metadata trước khi tính cosine (pilot 1 sách nên rẻ; mở rộng sau thêm index)
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  rows = rows.filter((r) =>
    (!subject || norm(r.subject) === norm(subject)) &&
    (!grade || norm(r.grade) === norm(grade)) &&
    (!bookSeries || norm(r.book_series) === norm(bookSeries))
  );
  if (!rows.length) {
    return { status: "no_reference_found", reason: "Không có tài liệu cùng môn/lớp/bộ sách.", citations: [] };
  }
  const { vectors } = await embedTexts([q], embedCfg);
  const qv = vectors[0];
  const scored = [];
  for (const r of rows) {
    let ev;
    try {
      ev = JSON.parse(r.embedding || "[]");
    } catch { continue; }
    if (!Array.isArray(ev) || !ev.length) continue;
    const score = cosine(qv, ev);
    if (score >= cfg.minScore) {
      scored.push({
        content: r.content,
        title: r.title, chapter: r.chapter, page: r.page,
        score: Math.round(score * 1000) / 1000,
        textbook_id: r.textbook_id,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, cfg.topK);
  if (!top.length) {
    return { status: "no_reference_found", reason: `Không đoạn nào vượt ngưỡng giống nhau (${cfg.minScore}).`, citations: [] };
  }
  return { status: "found", citations: top };
}

export function formatCitations(citations = []) {
  return citations.map((c, i) =>
    `[Nguồn ${i + 1}: ${c.title || "Tài liệu"}${c.chapter ? ` — ${c.chapter}` : ""}${c.page ? ` — tr.${c.page}` : ""}]\n${c.content}`
  ).join("\n\n");
}
