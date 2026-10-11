// Ingest sách: tái dùng extractFromBuffer (không viết lại đọc file) ->
// chunk -> metadata chương/trang -> embed -> SQLite. Chống trùng bằng sha256.
import { randomUUID } from "node:crypto";
import { db } from "../../db/db.js";
import { extractFromBuffer } from "../extract/extract.js";
import { chunkText, sha256norm } from "./chunk.js";
import { detectChapterMarks, chapterAt, estimatePage, bookMeta } from "./metadata.js";
import { embedTexts, embedConfig } from "./embed.js";

export async function ingestTextbook({ buffer, originalName = "", mimetype = "", meta = {}, embedCfg } = {}) {
  const cfg = embedCfg || embedConfig();
  const extracted = await extractFromBuffer(buffer, { originalName, mimetype });
  // Giới hạn pilot: extract đã cắt 20k ký tự — ghi rõ, không nạp SGK 1-12 ở đây.
  const digest = sha256norm(extracted.text);
  const dup = db.prepare("SELECT id, title FROM textbooks WHERE sha256=?").get(digest);
  if (dup) {
    const e = new Error(`Tài liệu đã tồn tại: "${dup.title || dup.id}".`);
    e.code = "TEXTBOOK_DUPLICATE"; e.status = 409; e.retryable = false;
    throw e;
  }
  const marks = detectChapterMarks(extracted.text);
  const chunks = chunkText(extracted.text);
  if (chunks.length > cfg.maxChunks) {
    const e = new Error(`Tài liệu tách ra ${chunks.length} đoạn, vượt giới hạn ${cfg.maxChunks} (EMBED_MAX_CHUNKS). Hãy chia nhỏ file.`);
    e.code = "FILE_TOO_LARGE"; e.status = 413; e.retryable = false;
    throw e;
  }
  const { vectors, costUSD, chars, engine } = await embedTexts(chunks, cfg);
  const info = bookMeta(meta);
  const id = randomUUID();
  const now = new Date().toISOString();
  // gán chương/trang theo vị trí ký tự (ước lượng, null nếu không có pageCount).
  // Chunk chứa mốc chương bên trong (vd tiêu đề sách + nội dung chương 1) thì
  // lấy mốc đó thay vì null ở phần mở đầu.
  let offset = 0;
  const rows = chunks.map((content, i) => {
    const at = extracted.text.indexOf(content.slice(0, 60), offset);
    const pos = at >= 0 ? at : offset;
    offset = pos + content.length;
    const inner = marks.find((m) => m.charOffset >= pos && m.charOffset < pos + content.length);
    return {
      content,
      chapter: inner ? inner.chapter : chapterAt(pos, marks),
      page: estimatePage(pos, extracted.text.length, extracted.pageCount || null),
      embedding: JSON.stringify(vectors[i]),
    };
  });
  db.prepare("INSERT INTO textbooks(id,subject,grade,book_series,title,chapter_info,file_type,sha256,chunk_count,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(id, info.subject, info.grade, info.book_series, info.title || originalName, marks.length ? `${marks.length} mục` : null, extracted.fileType, digest, rows.length, now);
  const cins = db.prepare("INSERT INTO chunks(id,textbook_id,ord,content,chapter,page,embedding,created_at) VALUES(?,?,?,?,?,?,?,?)");
  rows.forEach((r, i) => cins.run(randomUUID(), id, i + 1, r.content, r.chapter, r.page, r.embedding, now));
  return {
    textbook: { id, ...info, file_type: extracted.fileType, chunk_count: rows.length },
    ingested: { chunks: rows.length, engine, chars, costUSD, truncated: !!extracted.metadata?.truncated },
    warnings: [...(extracted.warnings || []), "Pilot: mỗi file tối đa ~20.000 ký tự (giới hạn module trích xuất)."],
  };
}
