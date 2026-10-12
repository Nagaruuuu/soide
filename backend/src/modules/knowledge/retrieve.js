// Retrieve: lọc metadata (môn/lớp/bộ) NGAY TRONG SQL -> cosine trên tập đã lọc ->
// trên ngưỡng mới trả trích dẫn; không đạt -> { status: "no_reference_found" }.
// Không bao giờ bịa nguồn/trang, không kết luận đúng/sai.
//
// T13: trước đây kéo TOÀN BỘ bảng chunks (kèm embedding) rồi mới filter trong JS.
// Nay lọc bằng WHERE (idx_books_meta) + chỉ đọc `vec` BLOB của dòng khớp, có
// fallback về `embedding` TEXT cho chunk cũ chưa migrate.
import { db } from "../../db/db.js";
import { cosine, cosineBlob, embedTexts, unpackVector } from "./embed.js";

export function ragConfig() {
  return {
    topK: Number(process.env.RAG_TOP_K || 3),
    minScore: Number(process.env.RAG_MIN_SCORE || 0.15),
    maxScan: Number(process.env.RAG_MAX_SCAN || 20000),
  };
}

// NORMALIZE ở tầng JS rồi so trong SQL: đề so khớp "Vật lý" vs "vat ly" dễ bị sót,
// nên so sánh bằng chuỗi đã lowercase+trim, và bỏ filter nếu người gọi không truyền.
function buildFilter({ subject, grade, bookSeries }) {
  const clauses = [];
  const params = [];
  const push = (col, val) => {
    if (val == null || val === "") return;
    clauses.push(`LOWER(TRIM(COALESCE(${col}, ''))) = ?`);
    params.push(String(val).trim().toLowerCase());
  };
  push("t.subject", subject);
  push("t.grade", grade);
  push("t.book_series", bookSeries);
  return { where: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", params };
}

// citations: [{ content, title, chapter, page, page_source, score, textbook_id }]
export async function retrieve({ query = "", subject, grade, bookSeries, topK, minScore, embedCfg, _rows } = {}) {
  const cfg = { ...ragConfig(), ...(topK != null ? { topK } : {}), ...(minScore != null ? { minScore } : {}) };
  const q = String(query ?? "").trim();
  if (!q) return { status: "no_reference_found", reason: "Câu truy vấn rỗng.", citations: [] };

  const { vectors } = await embedTexts([q], embedCfg);
  const qv = vectors[0];
  if (!qv || !qv.length) {
    return { status: "no_reference_found", reason: "Không lấy được vector câu hỏi.", citations: [] };
  }

  // ---- Pha 1: chấm điểm CHỈ trên vector, KHÔNG kéo cột content ----
  // Cột content là TEXT (hàng trăm byte x 20k dòng) — chỉ cần cho top-K cuối cùng.
  let cand = _rows ?? scanVectors({ subject, grade, bookSeries, maxScan: cfg.maxScan });
  if (!cand.length) {
    const msg = (subject || grade || bookSeries)
      ? "Không có tài liệu cùng môn/lớp/bộ sách."
      : "Chưa nạp tài liệu nào vào kho SGK.";
    return { status: "no_reference_found", reason: msg, citations: [] };
  }
  const hits = [];
  // Buffer tái dùng cho mọi dòng BLOB: unpackVector() cấp phát mới mỗi dòng thì
  // với 20k chunk sẽ tạo 20k Float32Array và GC gánh nặng (đo thật: chậm hơn JSON).
  let scratch = null;
  for (const r of cand) {
    let score = null;
    if (r.vec) {
      score = cosineBlob(qv, r.vec, scratch);
      scratch = scratch && scratch.length * 4 === r.vec.byteLength ? scratch : new Float32Array(r.vec.byteLength / 4);
    }
    if (score === null && r.embedding) {
      // fallback chunk cũ chưa migrate / JSON hỏng
      let ev = null;
      try {
        const parsed = JSON.parse(r.embedding);
        if (Array.isArray(parsed) && parsed.length) ev = parsed;
      } catch { ev = null; }
      if (ev) score = cosine(qv, ev);
    }
    if (score === null || score < cfg.minScore) continue;
    hits.push({ id: r.id, score, title: r.title, chapter: r.chapter, page: r.page, page_source: r.page_source || "estimated", textbook_id: r.textbook_id });
  }
  if (!hits.length) {
    return { status: "no_reference_found", reason: `Không đoạn nào vượt ngưỡng giống nhau (${cfg.minScore}).`, citations: [] };
  }
  hits.sort((a, b) => b.score - a.score);

  // ---- Pha 2: lấy nội dung cho đúng top-K, lọc theo id (ít dòng) ----
  const top = hits.slice(0, cfg.topK);
  const wanted = new Set(top.map((h) => h.id));
  const contents = new Map();
  if (!_rows) {
    const byId = db.prepare(
      `SELECT c.id, c.content FROM chunks c WHERE c.id IN (${top.map(() => "?").join(",")})`
    );
    for (const row of byId.all(...top.map((h) => h.id))) contents.set(row.id, row.content);
  } else {
    for (const r of cand) if (wanted.has(r.id)) contents.set(r.id, r.content);
  }
  return {
    status: "found",
    citations: top.map((h) => ({
      content: contents.get(h.id) ?? "",
      title: h.title, chapter: h.chapter, page: h.page,
      page_source: h.page_source,
      score: Math.round(h.score * 1000) / 1000,
      textbook_id: h.textbook_id,
    })),
  };
}

// Pha 1: quét vector theo khoá sách, KHÔNG đọc cột content.
//
// GHI CHÚ HIỆU NĂNG (đo thật 20k chunks, SQLite 3.53):
//   SQL đọc cột vec .......................... 192ms
//   SQL đọc vec + ORDER BY (c.vec IS NULL) .... 624ms   <- nên tránh!
// `ORDER BY` lên biểu thức khiến SQLite sort toàn bảng, mất index. Thay bằng
// 2 query riêng: ưu tiên `vec IS NOT NULL`, phần chunk cũ chưa migrate thì hỏi riêng.
function scanVectors({ subject, grade, bookSeries, maxScan }) {
  const { where, params } = buildFilter({ subject, grade, bookSeries });
  const base = `FROM chunks c JOIN textbooks t ON t.id = c.textbook_id
       WHERE (c.embedding IS NOT NULL OR c.vec IS NOT NULL)${where}`;
  // Query chính: cột BLOB `vec`, KHÔNG kéo embedding TEXT.
  const rows = db.prepare(
    `SELECT c.id, c.chapter, c.page, c.page_source, c.vec, NULL AS embedding, c.textbook_id,
            t.title, t.subject, t.grade, t.book_series
     ${base}
     AND c.vec IS NOT NULL
     LIMIT ?`
  ).all(...params, maxScan);
  // Chunk cũ chưa migrate (chỉ có embedding TEXT): hỏi riêng, chỉ khi thực sự còn.
  // `missing === 0` là câu hỏi index nhẹ (~38ms với 20k dòng).
  const missing = db.prepare(`SELECT COUNT(*) AS n ${base} AND c.vec IS NULL`).get(...params).n;
  if (missing > 0) {
    const legacy = db.prepare(
      `SELECT c.id, c.chapter, c.page, c.page_source, NULL AS vec, c.embedding, c.textbook_id,
              t.title, t.subject, t.grade, t.book_series
       ${base}
       AND c.vec IS NULL LIMIT ?`
    ).all(...params, maxScan);
    return rows.concat(legacy);
  }
  return rows;
}

export function formatCitations(citations = []) {
  return citations.map((c, i) =>
    `[Nguồn ${i + 1}: ${c.title || "Tài liệu"}${c.chapter ? ` — ${c.chapter}` : ""}${c.page ? ` — tr.${c.page}` : ""}]\n${c.content}`
  ).join("\n\n");
}
