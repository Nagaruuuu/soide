// Quản lý tài liệu kiến thức (user upload, có quyền sử dụng — không crawl SGK).
// POST /api/textbooks (multipart file + subject/grade/bookSeries/title)
// GET /api/textbooks, DELETE /api/textbooks/:id, POST /api/references
import { Router } from "express";
import { db } from "../db/db.js";
import { uploadBook, TEXTBOOK_ROUTE_MAX_MB } from "../middleware/upload.js";
import { ingestTextbook } from "../modules/knowledge/ingest.js";
import { retrieve } from "../modules/knowledge/retrieve.js";

const r = Router();

r.post("/textbooks", (req, res, next) => {
  uploadBook(req, res, async (multerErr) => {
    try {
      if (multerErr) {
        if (multerErr.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error_code: "FILE_TOO_LARGE", message_vi: `File vượt giới hạn ${TEXTBOOK_ROUTE_MAX_MB}MB. Hãy nạp từng chương riêng.`, retryable: false });
        }
        return next(multerErr);
      }
      if (!req.file?.buffer) {
        const e = new Error("Chưa chọn file (field `file`).");
        e.code = "EMPTY_FILE"; e.status = 400;
        throw e;
      }
      const originalName = String(req.file.originalname || "").slice(0, 200);
      if (originalName.includes("..") || originalName.includes("/") || originalName.includes("\\")) {
        const e = new Error("Tên file không hợp lệ.");
        e.code = "UNSUPPORTED_TYPE"; e.status = 415;
        throw e;
      }
      const out = await ingestTextbook({
        buffer: req.file.buffer,
        originalName,
        mimetype: req.file.mimetype,
        meta: {
          subject: req.body?.subject, grade: req.body?.grade,
          bookSeries: req.body?.bookSeries, title: req.body?.title,
        },
      });
      // P0-2: giải phóng buffer upload ngay sau ingest
      req.file.buffer = null;
      res.status(201).json(out);
    } catch (e) { next(e); }
  });
});

r.get("/textbooks", (_req, res, next) => {
  try {
    const rows = db.prepare("SELECT id,subject,grade,book_series,title,chapter_info,file_type,chunk_count,created_at FROM textbooks ORDER BY created_at DESC").all();
    res.json({ textbooks: rows });
  } catch (e) { next(e); }
});

r.delete("/textbooks/:id", (req, res, next) => {
  try {
    db.prepare("DELETE FROM chunks WHERE textbook_id=?").run(req.params.id);
    const d = db.prepare("DELETE FROM textbooks WHERE id=?").run(req.params.id);
    if (!d.changes) {
      const e = new Error("Không tìm thấy tài liệu.");
      e.code = "NOT_FOUND"; e.status = 404;
      throw e;
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post("/references", async (req, res, next) => {
  try {
    const b = req.body ?? {};
    if (!String(b.query ?? "").trim()) {
      return res.status(400).json({ error_code: "INPUT_EMPTY", message_vi: "Cần query (nội dung câu hỏi).", retryable: false });
    }
    const out = await retrieve({
      query: b.query,
      subject: b.subject, grade: b.grade, bookSeries: b.bookSeries,
      topK: b.topK != null ? Math.max(1, Math.min(5, Number(b.topK) || 3)) : undefined,
    });
    res.json(out);
  } catch (e) { next(e); }
});

export default r;
